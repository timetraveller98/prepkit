"use client";

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { API_BASE_PATH, apiFetch, jsonBody } from "./api";
import type {
  Flashcard,
  KitDetail,
  KitSummary,
  PracticeSession,
  Question,
  QuestionCategory,
  ReadinessReport,
  RegenerateSection,
  RegenerationOutcome,
  SessionUser,
} from "./types";

export const queryKeys = {
  kits: ["kits"] as const,
  kit: (id: string) => ["kit", id] as const,
  practice: (id: string) => ["practice", id] as const,
  readiness: (id: string) => ["readiness", id] as const,
};

export function useRegister() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      apiFetch<{ user: SessionUser }>("/auth/register", {
        method: "POST",
        ...jsonBody(credentials),
      }),
  });
}

export function useKits() {
  return useQuery({
    queryKey: queryKeys.kits,
    queryFn: async () => (await apiFetch<{ kits: KitSummary[] }>("/kits")).kits,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((kit) => kit.status === "queued" || kit.status === "running")
        ? 5_000
        : false,
  });
}

export function useKit(kitId: string) {
  return useQuery({
    queryKey: queryKeys.kit(kitId),
    queryFn: async () => (await apiFetch<{ kit: KitDetail }>(`/kits/${kitId}`)).kit,
    enabled: kitId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 6_000 : false;
    },
  });
}

export function useCreateKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      jobDescription: string;
      companyUrl: string;
      daysAvailable: number;
      force?: boolean;
    }) =>
      apiFetch<{ duplicate: boolean; kit: KitSummary; message?: string }>("/kits", {
        method: "POST",
        ...jsonBody(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.kits }),
  });
}

export function useCreateKitBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cases: { jobDescription: string; companyUrl: string; daysAvailable: number }[]) =>
      apiFetch<{ created: KitSummary[]; skipped: { companyUrl: string; reason: string }[] }>(
        "/kits/batch",
        { method: "POST", ...jsonBody({ cases }) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.kits }),
  });
}

export function useDeleteKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kitId: string) => apiFetch<void>(`/kits/${kitId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.kits }),
  });
}

export function useRetryKit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kitId: string) =>
      apiFetch<{ kit: KitSummary }>(`/kits/${kitId}/retry`, { method: "POST" }),
    onSuccess: (_data, kitId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.kits });
      void queryClient.invalidateQueries({ queryKey: queryKeys.kit(kitId) });
    },
  });
}

function writeKit(queryClient: QueryClient, kit: KitDetail) {
  queryClient.setQueryData(queryKeys.kit(kit.id), kit);
  void queryClient.invalidateQueries({ queryKey: queryKeys.kits });
}

export function useKitMutation<TVariables>(
  kitId: string,
  request: (variables: TVariables) => Promise<{ kit: KitDetail }>,
  options: {
    optimistic?: (current: KitDetail, variables: TVariables) => KitDetail;
    onDone?: (result: { kit: KitDetail }) => void;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    onMutate: async (variables: TVariables) => {
      if (!options.optimistic) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: queryKeys.kit(kitId) });
      const previous = queryClient.getQueryData<KitDetail>(queryKeys.kit(kitId));
      if (previous) {
        queryClient.setQueryData(queryKeys.kit(kitId), options.optimistic(previous, variables));
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.kit(kitId), context.previous);
    },
    onSuccess: (result) => {
      writeKit(queryClient, result.kit);
      options.onDone?.(result);
    },
  });
}

export function useUpdateQuestion(kitId: string) {
  return useKitMutation<{ questionId: string; patch: Partial<Question> }>(
    kitId,
    ({ questionId, patch }) =>
      apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/questions/${questionId}`, {
        method: "PATCH",
        ...jsonBody(patch),
      }),
    {
      optimistic: (current, { questionId, patch }) =>
        current.kit
          ? {
              ...current,
              kit: {
                ...current.kit,
                questions: current.kit.questions.map((question) =>
                  question.id === questionId ? { ...question, ...patch } : question,
                ),
              },
            }
          : current,
    },
  );
}

export function useCreateQuestion(kitId: string) {
  return useKitMutation<{
    prompt: string;
    category: QuestionCategory;
    answer_outline?: string;
    difficulty?: number;
    requirement_ids?: string[];
  }>(kitId, (input) =>
    apiFetch<{ kit: KitDetail; id: string }>(`/kits/${kitId}/questions`, {
      method: "POST",
      ...jsonBody(input),
    }),
  );
}

export function useDeleteQuestion(kitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) =>
      apiFetch<{ kit: KitDetail; newGaps: string[] }>(`/kits/${kitId}/questions/${questionId}`, {
        method: "DELETE",
      }),
    onSuccess: (result) => writeKit(queryClient, result.kit),
  });
}

export function useReorderQuestions(kitId: string) {
  return useKitMutation<string[]>(
    kitId,
    (ids) =>
      apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/questions/order`, {
        method: "PUT",
        ...jsonBody({ ids }),
      }),
    {
      optimistic: (current, ids) => {
        if (!current.kit) return current;
        const byId = new Map(current.kit.questions.map((question) => [question.id, question]));
        const ordered = ids.flatMap((id) => {
          const question = byId.get(id);
          return question ? [question] : [];
        });
        const remaining = current.kit.questions.filter((question) => !ids.includes(question.id));
        return { ...current, kit: { ...current.kit, questions: [...ordered, ...remaining] } };
      },
    },
  );
}

export function usePinQuestion(kitId: string) {
  return useKitMutation<{ questionId: string; pinned: boolean }>(kitId, ({ questionId, pinned }) =>
    apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/questions/${questionId}/pin`, {
      method: "POST",
      ...jsonBody({ pinned }),
    }),
  );
}

export function useUpdateFlashcard(kitId: string) {
  return useKitMutation<{ flashcardId: string; patch: Partial<Flashcard> }>(
    kitId,
    ({ flashcardId, patch }) =>
      apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/flashcards/${flashcardId}`, {
        method: "PATCH",
        ...jsonBody(patch),
      }),
    {
      optimistic: (current, { flashcardId, patch }) =>
        current.kit
          ? {
              ...current,
              kit: {
                ...current.kit,
                flashcards: current.kit.flashcards.map((flashcard) =>
                  flashcard.id === flashcardId ? { ...flashcard, ...patch } : flashcard,
                ),
              },
            }
          : current,
    },
  );
}

export function useCreateFlashcard(kitId: string) {
  return useKitMutation<{ front: string; back?: string; requirement_ids?: string[] }>(
    kitId,
    (input) =>
      apiFetch<{ kit: KitDetail; id: string }>(`/kits/${kitId}/flashcards`, {
        method: "POST",
        ...jsonBody(input),
      }),
  );
}

export function useDeleteFlashcard(kitId: string) {
  return useKitMutation<string>(kitId, (flashcardId) =>
    apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/flashcards/${flashcardId}`, { method: "DELETE" }),
  );
}

export function useReorderFlashcards(kitId: string) {
  return useKitMutation<string[]>(
    kitId,
    (ids) =>
      apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/flashcards/order`, {
        method: "PUT",
        ...jsonBody({ ids }),
      }),
    {
      optimistic: (current, ids) => {
        if (!current.kit) return current;
        const byId = new Map(current.kit.flashcards.map((flashcard) => [flashcard.id, flashcard]));
        const ordered = ids.flatMap((id) => {
          const flashcard = byId.get(id);
          return flashcard ? [flashcard] : [];
        });
        const remaining = current.kit.flashcards.filter((card) => !ids.includes(card.id));
        return { ...current, kit: { ...current.kit, flashcards: [...ordered, ...remaining] } };
      },
    },
  );
}

export function usePinFlashcard(kitId: string) {
  return useKitMutation<{ flashcardId: string; pinned: boolean }>(
    kitId,
    ({ flashcardId, pinned }) =>
      apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/flashcards/${flashcardId}/pin`, {
        method: "POST",
        ...jsonBody({ pinned }),
      }),
  );
}

export function useUpdateBrief(kitId: string) {
  return useKitMutation<{ summary?: string; what_they_do?: string }>(
    kitId,
    (patch) =>
      apiFetch<{ kit: KitDetail }>(`/kits/${kitId}/brief`, { method: "PATCH", ...jsonBody(patch) }),
    {
      optimistic: (current, patch) =>
        current.kit
          ? {
              ...current,
              kit: { ...current.kit, company_brief: { ...current.kit.company_brief, ...patch } },
            }
          : current,
    },
  );
}

export function useRegenerate(kitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      section: RegenerateSection;
      category?: QuestionCategory;
      daysAvailable?: number;
    }) =>
      apiFetch<RegenerationOutcome>(`/kits/${kitId}/regenerate`, {
        method: "POST",
        ...jsonBody(input),
      }),
    onSuccess: (result) => writeKit(queryClient, result.kit),
  });
}

export function usePracticeSession(kitId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.practice(kitId),
    queryFn: () => apiFetch<PracticeSession>(`/kits/${kitId}/practice?limit=40`),
    enabled: enabled && kitId.length > 0,
  });
}

export function useGradeCard(kitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flashcardId, confidence }: { flashcardId: string; confidence: number }) =>
      apiFetch<{ progress: PracticeSession["progress"] }>(
        `/kits/${kitId}/practice/${flashcardId}`,
        { method: "POST", ...jsonBody({ confidence }) },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<PracticeSession>(queryKeys.practice(kitId), (current) =>
        current ? { ...current, progress: result.progress } : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(kitId) });
    },
  });
}

export function useResetPractice(kitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/kits/${kitId}/practice/reset`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.practice(kitId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.readiness(kitId) });
    },
  });
}

export function useReadiness(kitId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.readiness(kitId),
    queryFn: async () =>
      (await apiFetch<{ readiness: ReadinessReport }>(`/kits/${kitId}/readiness`)).readiness,
    enabled: enabled && kitId.length > 0,
  });
}

export function useKitProgressStream(kitId: string, active: boolean) {
  const queryClient = useQueryClient();
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!active || kitId.length === 0) return;

    const source = new EventSource(`${API_BASE_PATH}/kits/${kitId}/events`, {
      withCredentials: true,
    });

    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as {
        type: "progress" | "status";
        status?: string;
        event?: KitDetail["progress"];
      };

      queryClient.setQueryData<KitDetail>(queryKeys.kit(kitId), (current) => {
        if (!current) return current;
        if (payload.type === "progress" && payload.event) {
          return {
            ...current,
            progress: payload.event,
            events: [...current.events.slice(-40), payload.event],
          };
        }
        return current;
      });

      if (payload.type === "status" && payload.status && payload.status !== lastStatus.current) {
        lastStatus.current = payload.status;
        if (payload.status === "ready" || payload.status === "failed") {
          void queryClient.invalidateQueries({ queryKey: queryKeys.kit(kitId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.kits });
        }
      }
    };

    source.onerror = () => source.close();

    return () => source.close();
  }, [active, kitId, queryClient]);
}
