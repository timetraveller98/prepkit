"use client";

import { Printer, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, SectionLabel, Stat } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/cn";
import { useReadiness } from "@/lib/queries";
import type { KitDetail } from "@/lib/types";

type Tone = "success" | "warning" | "danger";

export function ReadinessPanel({ detail }: { detail: KitDetail }) {
  const readiness = useReadiness(detail.id);

  if (readiness.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (readiness.isError || !readiness.data) {
    return <EmptyState title="Readiness is not available yet" />;
  }

  const report = readiness.data;
  const tone: Tone = report.score >= 70 ? "success" : report.score >= 40 ? "warning" : "danger";
  const verdict = report.score >= 70 ? "In shape" : report.score >= 40 ? "Getting there" : "Early";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-small text-ink-muted">
          Scored from how confident you felt on the cards behind each requirement, weighted by
          whether the posting called it a must.
        </p>
        <Button size="md" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print one-pager
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="If the interview were tomorrow" />
          <CardBody className="space-y-5">
            <div className="flex items-center gap-5">
              <ScoreRing value={report.score} tone={tone} />
              <div className="min-w-0">
                <Badge tone={tone}>{verdict}</Badge>
                <p className="mt-2 text-small leading-relaxed text-ink-muted">
                  {report.untouchedMustRequirements > 0
                    ? `${report.untouchedMustRequirements} must-have ${
                        report.untouchedMustRequirements === 1
                          ? "requirement has"
                          : "requirements have"
                      } no practice behind them yet.`
                    : "Every must-have has been drilled at least once."}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2.5">
              <Stat label="Must-haves" value={report.mustRequirements} />
              <Stat label="Never drilled" value={report.untouchedMustRequirements} />
            </dl>

            {report.strengths.length > 0 ? (
              <div className="border-t border-line pt-4">
                <SectionLabel className="mb-2 flex items-center gap-1.5">
                  <TrendingUp className="size-3.5" />
                  Solid
                </SectionLabel>
                <ul className="space-y-1.5">
                  {report.strengths.map((item) => (
                    <li key={item.requirementId} className="flex gap-2 text-small text-ink-muted">
                      <span
                        aria-hidden
                        className="mt-[0.4375rem] size-1 shrink-0 rounded-full bg-success"
                      />
                      {item.text}
                    </li>
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
                <Button asChild size="md" variant="primary" className="no-print">
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
              <ol className="divide-y divide-line">
                {report.weakSpots.map((item, index) => (
                  <li key={item.requirementId} className="flex gap-3 px-4 py-3.5 sm:px-5">
                    <span className="numeric mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-danger-soft text-micro font-semibold text-danger">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={item.priority === "must" ? "accent" : "outline"}>
                          {item.requirementId}
                        </Badge>
                        <Badge tone={item.priority === "must" ? "accent" : "outline"}>
                          {item.priority === "must" ? "Must have" : "Nice to have"}
                        </Badge>
                        <Badge tone={item.drilled === 0 ? "danger" : "warning"}>
                          {item.drilled === 0
                            ? "never drilled"
                            : `confidence ${Math.round((item.confidence ?? 0) * 100)}%`}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-body leading-snug text-ink">{item.text}</p>
                      {item.questionIds.length > 0 ? (
                        <p className="mt-1 text-tiny text-ink-faint">
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

const RING_SIZE = 92;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ value, tone }: { value: number; tone: Tone }) {
  const clamped = Math.max(0, Math.min(100, value));
  const strokes: Record<Tone, string> = {
    success: "stroke-success",
    warning: "stroke-warning",
    danger: "stroke-danger",
  };

  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-sunken"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - clamped / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", strokes[tone])}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="numeric text-display leading-none font-semibold text-ink">
          {Math.round(clamped)}
        </span>
      </div>
      <span className="sr-only">Readiness score {Math.round(clamped)} out of 100</span>
    </div>
  );
}
