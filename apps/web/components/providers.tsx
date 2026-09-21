"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { Toaster } from "sonner";
import { ApiRequestError } from "@/lib/api";
import { TooltipProvider } from "@/components/ui/overlays";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiRequestError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className:
              "!bg-[var(--surface-raised)] !text-[var(--text)] !border !border-[var(--border)] !rounded-xl",
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
