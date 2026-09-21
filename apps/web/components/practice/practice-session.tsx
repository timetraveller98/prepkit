"use client";

import { ChevronLeft, Eye, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { useGradeCard, useKit, usePracticeSession, useResetPractice } from "@/lib/queries";
import { CONFIDENCE_OPTIONS } from "@/lib/types";

export function PracticeSession({ kitId }: { kitId: string }) {
  const kit = useKit(kitId);
  const session = usePracticeSession(kitId);
  const grade = useGradeCard(kitId);
  const reset = useResetPractice(kitId);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const cards = session.data?.session ?? [];
  const current = cards[index];
  const finished = cards.length > 0 && index >= cards.length;

  const record = useCallback(
    (confidence: number) => {
      if (!current) return;
      grade.mutate(
        { flashcardId: current.flashcard.id, confidence },
        { onError: (error) => toast.error(error.message) },
      );
      setRevealed(false);
      setIndex((value) => value + 1);
    },
    [current, grade],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /input|textarea/i.test(event.target.tagName))
        return;
      if (!current) return;

      if (!revealed && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && ["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        record(Number(event.key) - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, revealed, record]);

  if (kit.isPending || session.isPending) {
    return <Skeleton className="h-80 rounded-[var(--radius-card)]" />;
  }

  if (session.isError) {
    return (
      <ErrorState
        title="Could not start practice"
        message={session.error instanceof Error ? session.error.message : "Unknown error"}
        action={
          <Button size="sm" onClick={() => session.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const progress = session.data?.progress;

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-7" />}
        title="No cards to practise"
        description="This kit has no flashcards yet. Add some in the builder, or regenerate the card set."
        action={
          <Button asChild variant="primary">
            <Link href={`/kits/${kitId}?tab=flashcards`}>Open flashcards</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/kits/${kitId}`}
          className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Back to the kit
        </Link>
        <Button
          size="sm"
          variant="ghost"
          loading={reset.isPending}
          onClick={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                setIndex(0);
                setRevealed(false);
                toast.success("Practice history cleared");
              },
            })
          }
        >
          <RotateCcw className="size-3.5" />
          Reset history
        </Button>
      </div>

      {progress ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-ink-muted">
              {progress.seen} of {progress.total} cards covered
            </span>
            <span className="text-ink-faint">{progress.confident} solid or better</span>
          </div>
          <ProgressBar
            value={progress.total === 0 ? 0 : (progress.seen / progress.total) * 100}
            label="Cards covered"
          />
        </div>
      ) : null}

      {finished ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Sparkles className="size-7" />}
              title="Session done"
              description="The next session leads with whatever you were least sure about."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIndex(0);
                      setRevealed(false);
                      void session.refetch();
                    }}
                  >
                    Another round
                  </Button>
                  <Button asChild>
                    <Link href={`/kits/${kitId}?tab=readiness`}>See weak spots</Link>
                  </Button>
                </div>
              }
            />
          </CardBody>
        </Card>
      ) : current ? (
        <Card>
          <CardHeader
            title={`Card ${index + 1} of ${cards.length}`}
            actions={
              <div className="flex gap-1.5">
                {current.record?.lastConfidence !== null && current.record ? (
                  <Badge tone="neutral">
                    last: {CONFIDENCE_OPTIONS[current.record.lastConfidence ?? 0]?.label}
                  </Badge>
                ) : (
                  <Badge tone="accent">new</Badge>
                )}
                {current.flashcard.requirement_ids.map((id) => (
                  <Badge key={id}>{id}</Badge>
                ))}
              </div>
            }
          />
          <CardBody className="space-y-6">
            <p className="text-lg leading-snug font-medium text-balance text-ink">
              {current.flashcard.front}
            </p>

            {revealed ? (
              <div className="rounded-xl border border-line bg-bg-subtle px-4 py-3.5">
                <p className="text-[14px] leading-relaxed whitespace-pre-line text-ink">
                  {current.flashcard.back || "This card has no answer written on the back yet."}
                </p>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                className="w-full justify-center"
                onClick={() => setRevealed(true)}
              >
                <Eye className="size-4" />
                Reveal answer
                <kbd className="ml-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-faint">
                  space
                </kbd>
              </Button>
            )}

            {revealed ? (
              <div>
                <p className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
                  How did that feel?
                </p>
                <div className="grid gap-2 sm:grid-cols-4">
                  {CONFIDENCE_OPTIONS.map((option, position) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => record(option.value)}
                      className={cn(
                        "rounded-xl border border-line px-3 py-2.5 text-left transition-colors",
                        "hover:border-accent hover:bg-accent-soft/40",
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-ink">{option.label}</span>
                        <kbd className="rounded border border-line px-1 text-[10px] text-ink-faint">
                          {position + 1}
                        </kbd>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-faint">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
