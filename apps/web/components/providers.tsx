"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { ApiRequestError } from "@/lib/api";

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
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className:
                "!bg-[var(--surface-raised)] !text-[var(--ink)] !border !border-[var(--line)] !rounded-xl",
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
