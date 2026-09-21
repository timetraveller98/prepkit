"use client";

import { Printer, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ProgressBar, Skeleton } from "@/components/ui/feedback";
import { useReadiness } from "@/lib/queries";
import type { KitDetail } from "@/lib/types";

export function ReadinessPanel({ detail }: { detail: KitDetail }) {
  const readiness = useReadiness(detail.id);

  if (readiness.isPending) return <Skeleton className="h-64 rounded-[var(--radius-card)]" />;
  if (readiness.isError || !readiness.data) {
    return <EmptyState title="Readiness is not available yet" />;
  }

  const report = readiness.data;
  const tone = report.score >= 70 ? "success" : report.score >= 40 ? "warning" : "danger";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">
          Scored from how confident you felt on the cards behind each requirement, weighted by
          whether the posting called it a must.
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print one-pager
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title="If the interview were tomorrow" />
          <CardBody className="space-y-4">
            <div className="flex items-end gap-2">
              <span className="text-4xl font-semibold tracking-tight text-ink tabular-nums">
                {report.score}
              </span>
              <span className="pb-1.5 text-sm text-ink-faint">/ 100</span>
              <Badge tone={tone} className="mb-2 ml-auto">
                {report.score >= 70 ? "In shape" : report.score >= 40 ? "Getting there" : "Early"}
              </Badge>
            </div>
            <ProgressBar value={report.score} label="Readiness score" />

            <dl className="grid grid-cols-2 gap-3 pt-1 text-[13px]">
              <div className="rounded-lg bg-bg-subtle px-3 py-2">
                <dt className="text-xs text-ink-faint">Must-haves</dt>
                <dd className="mt-0.5 font-medium text-ink">{report.mustRequirements}</dd>
              </div>
              <div className="rounded-lg bg-bg-subtle px-3 py-2">
                <dt className="text-xs text-ink-faint">Never drilled</dt>
                <dd className="mt-0.5 font-medium text-ink">{report.untouchedMustRequirements}</dd>
              </div>
            </dl>

            {report.strengths.length > 0 ? (
              <div className="border-t border-line pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-faint uppercase">
                  <TrendingUp className="size-3.5" />
                  Solid
                </p>
                <ul className="space-y-1 text-[13px] text-ink-muted">
                  {report.strengths.map((item) => (
                    <li key={item.requirementId}>{item.text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Weak spots"
            description="Ranked by priority and how little evidence you have that you know it."
            actions={
              report.nextFlashcardIds.length > 0 ? (
                <Button asChild size="sm" variant="primary" className="no-print">
                  <Link href={`/kits/${detail.id}/practice`}>
                    <Target className="size-3.5" />
                    Drill these
                  </Link>
                </Button>
              ) : null
            }
          />
          <CardBody className="p-0">
            {report.weakSpots.length === 0 ? (
              <EmptyState
                title="Nothing flagged"
                description="Either you have practised everything, or there is nothing in the kit to practise yet."
              />
            ) : (
              <ol className="divide-y divide-[var(--border)]">
                {report.weakSpots.map((item, index) => (
                  <li key={item.requirementId} className="flex gap-3 px-5 py-3.5">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger-soft text-[11px] font-semibold text-danger">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={item.priority === "must" ? "accent" : "neutral"}>
                          {item.requirementId}
                        </Badge>
                        <Badge tone={item.priority === "must" ? "accent" : "neutral"}>
                          {item.priority === "must" ? "Must have" : "Nice to have"}
                        </Badge>
                        <Badge tone={item.drilled === 0 ? "danger" : "warning"}>
                          {item.drilled === 0
                            ? "never drilled"
                            : `confidence ${Math.round((item.confidence ?? 0) * 100)}%`}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[14px] leading-snug text-ink">{item.text}</p>
                      {item.questionIds.length > 0 ? (
                        <p className="mt-1 text-xs text-ink-faint">
                          Questions: {item.questionIds.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
