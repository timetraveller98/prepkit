"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, jsonBody } from "../api";
import type {
  Flashcard,
  KitDetail,
  Question,
  QuestionCategory,
  RegenerateSection,
  RegenerationOutcome,
} from "../types";
import { useKitMutation, writeKit } from "./shared";

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
    { optimistic: (current, ids) => reorderOptimistically(current, ids, "questions") },
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
    { optimistic: (current, ids) => reorderOptimistically(current, ids, "flashcards") },
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

function reorderOptimistically(
  current: KitDetail,
  ids: string[],
  collection: "questions" | "flashcards",
): KitDetail {
  if (!current.kit) return current;

  const items = current.kit[collection];
  const byId = new Map(items.map((item) => [item.id, item]));
  const requested = new Set(ids);

  const ordered = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const remaining = items.filter((item) => !requested.has(item.id));

  return {
    ...current,
    kit: { ...current.kit, [collection]: [...ordered, ...remaining] },
  } as KitDetail;
}
