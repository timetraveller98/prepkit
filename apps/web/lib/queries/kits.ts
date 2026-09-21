"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { API_BASE_PATH, apiFetch, jsonBody } from "../api";
import type { KitDetail, KitSummary } from "../types";
import { queryKeys } from "./keys";

const GENERATING_POLL_MS = 6_000;
const LIST_POLL_MS = 5_000;
const MAX_BUFFERED_EVENTS = 40;

function isGenerating(status: string | undefined): boolean {
  return status === "queued" || status === "running";
}

export function useKits() {
  return useQuery({
    queryKey: queryKeys.kits,
    queryFn: async () => (await apiFetch<{ kits: KitSummary[] }>("/kits")).kits,
    refetchInterval: (query) =>
      (query.state.data ?? []).some((kit) => isGenerating(kit.status)) ? LIST_POLL_MS : false,
  });
}

export function useKit(kitId: string) {
  return useQuery({
    queryKey: queryKeys.kit(kitId),
    queryFn: async () => (await apiFetch<{ kit: KitDetail }>(`/kits/${kitId}`)).kit,
    enabled: kitId.length > 0,
    refetchInterval: (query) =>
      isGenerating(query.state.data?.status) ? GENERATING_POLL_MS : false,
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

      if (payload.type === "progress" && payload.event) {
        const event = payload.event;
        queryClient.setQueryData<KitDetail>(queryKeys.kit(kitId), (current) =>
          current
            ? {
                ...current,
                progress: event,
                events: [...current.events.slice(-MAX_BUFFERED_EVENTS), event],
              }
            : current,
        );
        return;
      }

      if (payload.status && payload.status !== lastStatus.current) {
        lastStatus.current = payload.status;
        if (!isGenerating(payload.status)) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.kit(kitId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.kits });
        }
      }
    };

    source.onerror = () => source.close();

    return () => source.close();
  }, [active, kitId, queryClient]);
}
