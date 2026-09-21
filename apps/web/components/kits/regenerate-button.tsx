"use client";

import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRegenerate } from "@/lib/queries";
import type { QuestionCategory, RegenerateSection } from "@/lib/types";

export function RegenerateButton({
  kitId,
  section,
  category,
  label = "Regenerate",
  protectedCount = 0,
}: {
  kitId: string;
  section: RegenerateSection;
  category?: QuestionCategory;
  label?: string;
  protectedCount?: number;
}) {
  const regenerate = useRegenerate(kitId);

  return (
    <Button
      size="sm"
      loading={regenerate.isPending}
      onClick={() =>
        regenerate.mutate(
          { section, category },
          {
            onSuccess: (result) => {
              const kept = result.preservedIds.length;
              toast.success(
                kept > 0
                  ? `Regenerated. ${kept} item${kept === 1 ? "" : "s"} you touched ${kept === 1 ? "was" : "were"} kept.`
                  : "Regenerated.",
              );
            },
            onError: (error) => toast.error(error.message),
          },
        )
      }
      title={
        protectedCount > 0
          ? `${protectedCount} edited or pinned item${protectedCount === 1 ? "" : "s"} will be kept`
          : undefined
      }
    >
      <RefreshCw className="size-3.5" />
      {regenerate.isPending ? "Regenerating" : label}
    </Button>
  );
}
