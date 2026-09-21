"use client";

import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import type { KitDetail } from "../types";
import { queryKeys } from "./keys";

export function writeKit(queryClient: QueryClient, kit: KitDetail) {
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
