"use client";

import { AlertCircle, Check, CircleDashed, Loader2, MinusCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, ProgressBar } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { useRetryKit } from "@/lib/queries";
import type { KitDetail, PipelineEvent } from "@/lib/types";
import { stepLabel } from "./status-pill";

const MAIN_STEPS = [
  "extract-requirements",
  "crawl-company-site",
  "search-public-discussion",
  "company-brief",
  "hiring-process",
  "questions",
  "coverage",
  "flashcards",
  "schedule",
  "validate",
] as const;

type StepStatus = "waiting" | "running" | "done" | "skipped" | "failed";

const STATUS_ICON: Record<StepStatus, typeof Check> = {
  waiting: CircleDashed,
  running: Loader2,
  done: Check,
  skipped: MinusCircle,
  failed: AlertCircle,
};

const STATUS_STYLE: Record<StepStatus, string> = {
  waiting: "text-ink-faint",
  running: "text-accent",
  done: "text-success",
  skipped: "text-ink-faint/70",
  failed: "text-danger",
};

export function GenerationProgress({ detail }: { detail: KitDetail }) {
  const retry = useRetryKit();
  const failed = detail.status === "failed";
  const statuses = deriveStatuses(detail.events, failed);
  const completed = MAIN_STEPS.filter(
    (step) => statuses.get(step)?.status === "done" || statuses.get(step)?.status === "skipped",
  ).length;

  return (
    <Card>
      <CardHeader
        title={failed ? "This kit did not finish" : "Researching and writing your kit"}
        description={
          failed
            ? "Everything it did reach is listed below."
            : "Each step depends on what the one before it found. You can leave this page open or come back later."
        }
        actions={
          failed ? (
            <Button
              size="md"
              variant="primary"
              loading={retry.isPending}
              onClick={() =>
                retry.mutate(detail.id, { onSuccess: () => toast.success("Generation restarted") })
              }
            >
              <RotateCw className="size-3.5" />
              Try again
            </Button>
          ) : (
            <span className="numeric text-tiny text-ink-faint">
              {completed} of {MAIN_STEPS.length}
            </span>
          )
        }
      />
      <CardBody className="space-y-5">
        {failed && detail.error ? (
          <ErrorState title={detail.error.code} message={detail.error.message} />
        ) : (
          <ProgressBar
            value={(completed / MAIN_STEPS.length) * 100}
            label="Kit generation progress"
          />
        )}

        <ol className="relative space-y-0.5" aria-live="polite">
          <span aria-hidden className="absolute top-3 bottom-3 left-[0.4375rem] w-px bg-line" />
          {MAIN_STEPS.map((step) => {
            const entry = statuses.get(step);
            const status = entry?.status ?? "waiting";
            const Icon = STATUS_ICON[status];

            return (
              <li key={step} className="relative flex items-start gap-3 py-1.5">
                <span
                  className={cn(
                    "relative z-10 mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full bg-surface",
                    STATUS_STYLE[status],
                  )}
                >
                  <Icon
                    className={cn("size-3.5", status === "running" && "animate-spin")}
                    aria-hidden
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-small transition-colors",
                      status === "waiting" ? "text-ink-faint" : "font-medium text-ink",
                    )}
                  >
                    {stepLabel(step)}
                  </p>
                  {entry?.message ? (
                    <p className="mt-0.5 text-tiny leading-relaxed text-ink-muted">
                      {entry.message}
                    </p>
                  ) : null}
                  {entry?.children.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {entry.children.map((child) => (
                        <li key={child.step} className="text-tiny text-ink-faint">
                          <span className="text-ink-muted">{stepLabel(child.step)}</span>
                          {child.message ? ` — ${child.message}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

interface StepEntry {
  status: StepStatus;
  message?: string;
  children: { step: string; message?: string }[];
}

function deriveStatuses(events: PipelineEvent[], aborted: boolean): Map<string, StepEntry> {
  const statuses = new Map<string, StepEntry>();

  for (const event of events) {
    const parent = event.step.includes(":") ? (event.step.split(":")[0] ?? event.step) : event.step;
    const entry = statuses.get(parent) ?? { status: "waiting", children: [] };

    if (event.step === parent) {
      entry.status = toStepStatus(event.status);
      entry.message = event.message ?? entry.message;
    } else if (event.status !== "started") {
      const existing = entry.children.find((child) => child.step === event.step);
      if (existing) existing.message = event.message;
      else entry.children.push({ step: event.step, message: event.message });
    }

    statuses.set(parent, entry);
  }

  if (aborted) {
    for (const entry of statuses.values()) {
      if (entry.status === "running") entry.status = "failed";
    }
  }

  return statuses;
}

function toStepStatus(status: PipelineEvent["status"]): StepStatus {
  switch (status) {
    case "started":
    case "retrying":
      return "running";
    case "completed":
      return "done";
    case "skipped":
      return "skipped";
    case "failed":
      return "failed";
  }
}
