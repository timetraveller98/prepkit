import type {
  Flashcard,
  ItemMeta,
  Kit,
  KitItemState,
  PipelineEvent,
  Question,
  QuestionCategory,
  ReadinessReport,
  Requirement,
  ReviewRecord,
  ScheduleDay,
} from "@prepkit/core";

export type {
  Flashcard,
  ItemMeta,
  Kit,
  KitItemState,
  PipelineEvent,
  Question,
  QuestionCategory,
  ReadinessReport,
  Requirement,
  ReviewRecord,
  ScheduleDay,
};

export type KitStatus = "queued" | "running" | "ready" | "failed";
export type RegenerateSection = "company_brief" | "questions" | "flashcards" | "schedule";

export interface SessionUser {
  id: string;
  email: string;
}

export interface KitCounts {
  requirements: number;
  mustRequirements: number;
  questions: number;
  flashcards: number;
  uncoveredMust: number;
}

export interface KitSummary {
  id: string;
  title: string;
  company: string;
  companyUrl: string;
  role: string;
  daysAvailable: number;
  status: KitStatus;
  regeneratingSection: string | null;
  progress: PipelineEvent | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  counts: KitCounts;
}

export interface HiringProcess {
  found: boolean;
  summary: string;
  stages: { name: string; what_happens: string }[];
  signals: string[];
  sources: string[];
  confidence: "high" | "medium" | "low" | "none";
}

export interface KitDetail extends KitSummary {
  jobDescription: string;
  kit: Kit | null;
  itemState: KitItemState | null;
  events: PipelineEvent[];
  usage: { calls: number; inputTokens: number; outputTokens: number } | null;
  hiringProcess: HiringProcess | null;
  researchedPages: {
    url: string;
    title: string;
    intent: string;
    looksLikeHiringProcess: boolean;
  }[];
}

export interface PracticeSessionEntry {
  flashcard: Flashcard;
  record: ReviewRecord | null;
  overdue: boolean;
}

export interface PracticeProgress {
  total: number;
  seen: number;
  due: number;
  confident: number;
  byConfidence: Record<string, number>;
}

export interface PracticeSession {
  session: PracticeSessionEntry[];
  progress: PracticeProgress;
}

export interface RegenerationOutcome {
  preservedIds: string[];
  replacedIds: string[];
  kit: KitDetail;
}

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: "Technical",
  "system-design": "System design",
  behavioural: "Behavioural",
  "company-fit": "Company fit",
};

export const CATEGORY_ORDER: QuestionCategory[] = [
  "technical",
  "system-design",
  "behavioural",
  "company-fit",
];

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Warm-up",
  2: "Standard",
  3: "Stretch",
};

export const CONFIDENCE_OPTIONS = [
  { value: 0, label: "No idea", hint: "Comes back in minutes" },
  { value: 1, label: "Shaky", hint: "Tomorrow" },
  { value: 2, label: "Solid", hint: "In a few days" },
  { value: 3, label: "Could teach it", hint: "Much later" },
] as const;
