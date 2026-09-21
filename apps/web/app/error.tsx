"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-24 text-center">
      <p className="text-body font-medium text-ink">Something broke on this page</p>
      <p className="text-small text-ink-muted">{error.message}</p>
      <Button variant="primary" className="mt-2" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
