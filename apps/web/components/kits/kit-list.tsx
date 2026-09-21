"use client";

import { ArrowRight, FileStack, MoreHorizontal, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
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

  return (
    <>
      <PageHeader
        title="Your kits"
        description="One kit per role you are preparing for. Everything is private to your account."
        actions={
          kits.data && kits.data.length > 0 ? (
            <Button asChild variant="primary" size="lg">
              <Link href="/kits/new">
                Prepare for a role
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : null
        }
      />

      {kits.isPending ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <li key={index}>
              <Skeleton className="h-44 rounded-xl" />
            </li>
          ))}
        </ul>
      ) : kits.isError ? (
        <ErrorState
          title="Could not load your kits"
          message={kits.error instanceof Error ? kits.error.message : "Unknown error"}
          action={
            <Button size="sm" onClick={() => kits.refetch()}>
              Try again
            </Button>
          }
        />
      ) : kits.data.length === 0 ? (
        <div className="panel grid-backdrop">
          <EmptyState
            icon={<FileStack className="size-5" />}
            title="No kits yet"
            description="Paste a job description and a company website. The research starts on its own and runs in the background."
            action={
              <Button asChild variant="primary" size="lg">
                <Link href="/kits/new">Create your first kit</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kits.data.map((kit) => (
            <li key={kit.id} className="rise-in">
              <KitCard
                kit={kit}
                onDelete={() => setPendingDelete(kit)}
                onRetry={() =>
                  retryKit.mutate(kit.id, {
                    onSuccess: () => toast.success("Generation restarted"),
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent
          title="Delete this kit?"
          description="The kit, your edits and your practice history for it are removed. This cannot be undone."
        >
          <p className="rounded-lg border border-line bg-sunken px-3 py-2 text-small text-ink">
            {pendingDelete?.title}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button size="md">Keep it</Button>
            </DialogClose>
            <Button
              size="md"
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

function KitCard({
  kit,
  onDelete,
  onRetry,
}: {
  kit: KitSummary;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const generating = kit.status === "queued" || kit.status === "running";
  const host = hostOf(kit.companyUrl);

  return (
    <article className="panel card-lift relative flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <StatusPill status={kit.status} />
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative z-10 -mt-1 -mr-1"
              aria-label={`Actions for ${kit.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {kit.status === "failed" ? (
              <MenuItem onSelect={onRetry}>
                <RotateCw className="size-3.5" />
                Try again
              </MenuItem>
            ) : null}
            <MenuItem destructive onSelect={onDelete}>
              <Trash2 className="size-3.5" />
              Delete kit
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <h2 className="mt-3 line-clamp-2 text-lead leading-snug font-semibold text-ink">
        <Link href={`/kits/${kit.id}`} className="after:absolute after:inset-0">
          {kit.title}
        </Link>
      </h2>
      <p className="mt-1 truncate text-tiny text-ink-faint">{host}</p>

      <div className="mt-auto pt-4">
        {generating ? (
          <div className="space-y-2">
            <p className="truncate text-tiny text-ink-muted">
              {kit.progress ? stepLabel(kit.progress.step) : "Waiting to start"}
            </p>
            <ProgressBar
              value={kit.progress ? (kit.progress.index / kit.progress.total) * 100 : 4}
              label="Generation progress"
            />
          </div>
        ) : kit.status === "failed" ? (
          <p className="line-clamp-2 text-tiny leading-relaxed text-danger">
            {kit.error?.message ?? "Generation failed"}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{kit.counts.questions} questions</Badge>
            <Badge tone="outline">{kit.counts.flashcards} cards</Badge>
            <Badge tone="outline">{kit.daysAvailable}-day plan</Badge>
            {kit.counts.uncoveredMust > 0 ? (
              <Badge tone="warning">{kit.counts.uncoveredMust} uncovered</Badge>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
