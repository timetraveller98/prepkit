"use client";

import { ArrowRight, FileStack, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/overlays";
import { useDeleteKit, useKits, useRetryKit } from "@/lib/queries";
import type { KitSummary } from "@/lib/types";
import { StatusPill, stepLabel } from "./status-pill";

export function KitList() {
  const kits = useKits();
  const deleteKit = useDeleteKit();
  const retryKit = useRetryKit();
  const [pendingDelete, setPendingDelete] = useState<KitSummary | null>(null);

  if (kits.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-40 rounded-[var(--radius-card)]" />
        ))}
      </div>
    );
  }

  if (kits.isError) {
    return (
      <ErrorState
        title="Could not load your kits"
        message={kits.error instanceof Error ? kits.error.message : "Unknown error"}
        action={
          <Button size="sm" onClick={() => kits.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (kits.data.length === 0) {
    return (
      <EmptyState
        icon={<FileStack className="size-7" />}
        title="No kits yet"
        description="Paste a job description and a company website, and the research starts on its own."
        action={
          <Button asChild variant="primary">
            <Link href="/kits/new">Create your first kit</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kits.data.map((kit) => (
          <li key={kit.id}>
            <article className="surface-panel group flex h-full flex-col p-4 transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <StatusPill status={kit.status} />
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${kit.title}`}>
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent>
                    {kit.status === "failed" ? (
                      <MenuItem
                        onSelect={() =>
                          retryKit.mutate(kit.id, {
                            onSuccess: () => toast.success("Generation restarted"),
                          })
                        }
                      >
                        <RotateCw className="size-3.5" />
                        Try again
                      </MenuItem>
                    ) : null}
                    <MenuItem destructive onSelect={() => setPendingDelete(kit)}>
                      <Trash2 className="size-3.5" />
                      Delete kit
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>

              <h2 className="mt-3 text-[15px] leading-snug font-semibold tracking-tight text-ink">
                <Link href={`/kits/${kit.id}`} className="after:absolute after:inset-0">
                  {kit.title}
                </Link>
              </h2>
              <p className="mt-0.5 truncate text-xs text-ink-faint">{kit.companyUrl}</p>

              <div className="mt-auto pt-4">
                {kit.status === "running" || kit.status === "queued" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-ink-muted">
                      {kit.progress ? stepLabel(kit.progress.step) : "Waiting to start"}
                    </p>
                    <ProgressBar
                      value={kit.progress ? (kit.progress.index / kit.progress.total) * 100 : 4}
                      label="Generation progress"
                    />
                  </div>
                ) : kit.status === "failed" ? (
                  <p className="line-clamp-2 text-xs text-danger">
                    {kit.error?.message ?? "Generation failed"}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{kit.counts.questions} questions</Badge>
                    <Badge>{kit.counts.flashcards} cards</Badge>
                    <Badge>{kit.daysAvailable}-day plan</Badge>
                    {kit.counts.uncoveredMust > 0 ? (
                      <Badge tone="warning">{kit.counts.uncoveredMust} uncovered</Badge>
                    ) : null}
                  </div>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent
          title="Delete this kit?"
          description="The kit, your edits and your practice history for it are removed. This cannot be undone."
        >
          <p className="text-[13px] text-ink-muted">{pendingDelete?.title}</p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button size="sm">Keep it</Button>
            </DialogClose>
            <Button
              size="sm"
              variant="danger"
              loading={deleteKit.isPending}
              onClick={() => {
                if (!pendingDelete) return;
                deleteKit.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    toast.success("Kit deleted");
                    setPendingDelete(null);
                  },
                  onError: (error) => toast.error(error.message),
                });
              }}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function KitListHeader() {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Your kits</h1>
        <p className="mt-1 text-[13px] text-ink-muted">One kit per role you are preparing for.</p>
      </div>
      <Button asChild variant="primary">
        <Link href="/kits/new">
          Prepare for a role
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
