export const PIPELINE_STEPS = [
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

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export type PipelineEventStatus = "started" | "completed" | "skipped" | "failed" | "retrying";

export interface PipelineEvent {
  step: PipelineStep | string;
  status: PipelineEventStatus;
  message?: string;
  at: string;
  index: number;
  total: number;
}

export type PipelineReporter = (event: PipelineEvent) => void;

export function createReporter(onProgress?: PipelineReporter) {
  const events: PipelineEvent[] = [];
  let index = 0;

  const emit = (step: string, status: PipelineEventStatus, message?: string) => {
    if (status === "started") index += 1;
    const event: PipelineEvent = {
      step,
      status,
      at: new Date().toISOString(),
      index,
      total: PIPELINE_STEPS.length,
      ...(message ? { message } : {}),
    };
    events.push(event);
    onProgress?.(event);
  };

  return { events, emit };
}
