"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronLeft, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKit, useKitProgressStream } from "@/lib/queries";
import { FlashcardsPanel } from "./flashcards-panel";
import { GenerationProgress } from "./generation-progress";
import { OverviewPanel } from "./overview-panel";
import { QuestionsPanel } from "./questions-panel";
import { ReadinessPanel } from "./readiness-panel";
import { RequirementsPanel } from "./requirements-panel";
import { SchedulePanel } from "./schedule-panel";
import { StatusPill } from "./status-pill";

const TABS = [
  { value: "overview", label: "Company" },
  { value: "requirements", label: "Requirements" },
  { value: "questions", label: "Questions" },
  { value: "flashcards", label: "Flashcards" },
  { value: "schedule", label: "Schedule" },
  { value: "readiness", label: "Readiness" },
] as const;

export function KitWorkspace({ kitId }: { kitId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kit = useKit(kitId);
  const active = kit.data?.status === "queued" || kit.data?.status === "running";

  useKitProgressStream(kitId, active);

  if (kit.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (kit.isError || !kit.data) {
    return (
      <ErrorState
        title="Could not open this kit"
        message={kit.error instanceof Error ? kit.error.message : "Unknown error"}
        action={
          <Button size="sm" asChild>
            <Link href="/kits">Back to your kits</Link>
          </Button>
        }
      />
    );
  }

  const detail = kit.data;
  const tab = searchParams.get("tab") ?? "overview";

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/kits"
          className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-3.5" />
          Your kits
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{detail.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusPill status={detail.status} />
              <Badge>{detail.daysAvailable}-day plan</Badge>
              {detail.kit ? (
                <>
                  <Badge>{detail.counts.questions} questions</Badge>
                  <Badge>{detail.counts.mustRequirements} must-haves</Badge>
                </>
              ) : null}
              {detail.counts.uncoveredMust > 0 ? (
                <Badge tone="warning">
                  <AlertTriangle className="size-3" />
                  {detail.counts.uncoveredMust} must-have without a question
                </Badge>
              ) : null}
            </div>
          </div>

          {detail.status === "ready" ? (
            <Button asChild variant="primary">
              <Link href={`/kits/${detail.id}/practice`}>
                <Play className="size-4" />
                Practise
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {detail.status !== "ready" ? (
        <GenerationProgress detail={detail} />
      ) : (
        <Tabs
          value={TABS.some((entry) => entry.value === tab) ? tab : "overview"}
          onValueChange={(value) => router.replace(`/kits/${kitId}?tab=${value}`, { scroll: false })}
          className="space-y-5"
        >
          <TabsList>
            {TABS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <OverviewPanel detail={detail} />
          </TabsContent>
          <TabsContent value="requirements">
            <RequirementsPanel detail={detail} />
          </TabsContent>
          <TabsContent value="questions">
            <QuestionsPanel detail={detail} />
          </TabsContent>
          <TabsContent value="flashcards">
            <FlashcardsPanel detail={detail} />
          </TabsContent>
          <TabsContent value="schedule">
            <SchedulePanel detail={detail} />
          </TabsContent>
          <TabsContent value="readiness">
            <ReadinessPanel detail={detail} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
