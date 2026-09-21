"use client";

import { AlertTriangle, ChevronLeft, ExternalLink, Play } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKit, useKitProgressStream } from "@/lib/queries";
import type { KitDetail } from "@/lib/types";
import { GenerationProgress } from "./generation-progress";
import { StatusPill } from "./status-pill";

const panelFallback = () => <Skeleton className="h-96 rounded-xl" />;

const OverviewPanel = dynamic(() => import("./overview-panel").then((m) => m.OverviewPanel), {
  loading: panelFallback,
});
const RequirementsPanel = dynamic(
  () => import("./requirements-panel").then((m) => m.RequirementsPanel),
  { loading: panelFallback },
);
const QuestionsPanel = dynamic(() => import("./questions-panel").then((m) => m.QuestionsPanel), {
  loading: panelFallback,
});
const FlashcardsPanel = dynamic(() => import("./flashcards-panel").then((m) => m.FlashcardsPanel), {
  loading: panelFallback,
});
const SchedulePanel = dynamic(() => import("./schedule-panel").then((m) => m.SchedulePanel), {
  loading: panelFallback,
});
const ReadinessPanel = dynamic(() => import("./readiness-panel").then((m) => m.ReadinessPanel), {
  loading: panelFallback,
});

const TABS = [
  { value: "overview", label: "Company" },
  { value: "requirements", label: "Requirements" },
  { value: "questions", label: "Questions" },
  { value: "flashcards", label: "Flashcards" },
  { value: "schedule", label: "Schedule" },
  { value: "readiness", label: "Readiness" },
] as const;

const TAB_VALUES = new Set<string>(TABS.map((entry) => entry.value));

export function KitWorkspace({ kitId }: { kitId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kit = useKit(kitId);
  const generating = kit.data?.status === "queued" || kit.data?.status === "running";

  useKitProgressStream(kitId, generating);

  if (kit.isPending) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-96 rounded-xl" />
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
  const requested = searchParams.get("tab") ?? "overview";
  const tab = TAB_VALUES.has(requested) ? requested : "overview";

  return (
    <div className="space-y-5">
      <KitHeader detail={detail} />

      {detail.status !== "ready" ? (
        <GenerationProgress detail={detail} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) =>
            router.replace(`/kits/${kitId}?tab=${value}`, { scroll: false })
          }
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

function KitHeader({ detail }: { detail: KitDetail }) {
  return (
    <div>
      <Link
        href="/kits"
        className="inline-flex items-center gap-1 text-small text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-3.5" />
        Your kits
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-heading font-semibold text-ink">{detail.title}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={detail.status} />
            <Badge tone="outline">{detail.daysAvailable}-day plan</Badge>
            {detail.kit ? (
              <>
                <Badge tone="outline">{detail.counts.questions} questions</Badge>
                <Badge tone="outline">{detail.counts.mustRequirements} must-haves</Badge>
              </>
            ) : null}
            {detail.counts.uncoveredMust > 0 ? (
              <Badge tone="warning">
                <AlertTriangle className="size-3" />
                {detail.counts.uncoveredMust} must-have without a question
              </Badge>
            ) : null}
            <a
              href={detail.companyUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md text-tiny text-ink-faint transition-colors hover:text-accent"
            >
              {hostOf(detail.companyUrl)}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
        </div>

        {detail.status === "ready" ? (
          <Button asChild variant="primary" size="lg">
            <Link href={`/kits/${detail.id}/practice`}>
              <Play className="size-4" />
              Practise
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
