import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { KitStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  KitStatus,
  { tone: "neutral" | "accent" | "success" | "danger"; label: string; icon: typeof Clock }
> = {
  queued: { tone: "neutral", label: "Queued", icon: Clock },
  running: { tone: "accent", label: "Researching", icon: Loader2 },
  ready: { tone: "success", label: "Ready", icon: CheckCircle2 },
  failed: { tone: "danger", label: "Failed", icon: AlertTriangle },
};

export function StatusPill({ status }: { status: KitStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <Badge tone={config.tone}>
      <Icon className={`size-3 ${status === "running" ? "animate-spin" : ""}`} aria-hidden />
      {config.label}
    </Badge>
  );
}

export const STEP_LABELS: Record<string, string> = {
  "extract-requirements": "Reading the job description",
  "crawl-company-site": "Crawling the company site",
  "search-public-discussion": "Looking for public discussion",
  "company-brief": "Writing the company brief",
  "hiring-process": "Reconstructing their hiring process",
  questions: "Writing questions",
  "questions:technical": "Technical questions",
  "questions:behavioural": "Behavioural questions",
  "questions:system-design": "System design questions",
  "questions:company-fit": "Company fit questions",
  coverage: "Checking every requirement is covered",
  flashcards: "Building flashcards",
  schedule: "Allocating your study days",
  validate: "Validating the kit",
};

export function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step.replace(/[-:]/g, " ");
}
