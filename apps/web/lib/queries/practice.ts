"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, jsonBody } from "../api";
import type { PracticeSession, ReadinessReport } from "../types";
import { queryKeys } from "./keys";

const SESSION_LIMIT = 40;

export function usePracticeSession(kitId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.practice(kitId),
    queryFn: () => apiFetch<PracticeSession>(`/kits/${kitId}/practice?limit=${SESSION_LIMIT}`),
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
