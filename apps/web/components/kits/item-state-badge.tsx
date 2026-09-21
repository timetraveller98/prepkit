import { PencilLine, Pin, UserPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ItemMeta } from "@/lib/types";

export function ItemStateBadges({ meta }: { meta: ItemMeta | undefined }) {
  if (!meta) return null;

  return (
    <>
      {meta.origin === "user" ? (
        <Badge tone="accent">
          <UserPen className="size-3" />
          Yours
        </Badge>
      ) : meta.edited ? (
        <Badge tone="accent">
          <PencilLine className="size-3" />
          Edited
        </Badge>
      ) : null}
      {meta.pinned ? (
        <Badge tone="warning">
          <Pin className="size-3" />
          Pinned
        </Badge>
      ) : null}
    </>
  );
}

export function isProtectedMeta(meta: ItemMeta | undefined): boolean {
  return Boolean(meta && (meta.origin === "user" || meta.edited || meta.pinned));
}
