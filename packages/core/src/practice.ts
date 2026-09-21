import type { Flashcard, Kit } from "./kit.ts";

export const CONFIDENCE_LEVELS = [0, 1, 2, 3] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  0: "No idea",
  1: "Shaky",
  2: "Solid",
  3: "Could teach it",
};

export interface ReviewRecord {
  flashcardId: string;
  repetitions: number;
  intervalDays: number;
  ease: number;
  lastConfidence: Confidence | null;
  lastReviewedAt: string | null;
  dueAt: string;
}

const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const RELEARN_MINUTES = 10;

export function newReviewRecord(flashcardId: string, now = new Date()): ReviewRecord {
  return {
    flashcardId,
    repetitions: 0,
    intervalDays: 0,
    ease: 2.5,
    lastConfidence: null,
    lastReviewedAt: null,
    dueAt: now.toISOString(),
  };
}

export interface ReviewOptions {
  now?: Date;
  maxIntervalDays?: number;
}

export function reviewCard(
  record: ReviewRecord,
  confidence: Confidence,
  options: ReviewOptions = {},
): ReviewRecord {
  const now = options.now ?? new Date();
  const maxIntervalDays = Math.max(1, options.maxIntervalDays ?? 21);

  let { ease, intervalDays, repetitions } = record;

  switch (confidence) {
    case 0:
      ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      repetitions = 0;
      intervalDays = 0;
      break;
    case 1:
      ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      repetitions += 1;
      intervalDays = Math.max(1, Math.round(Math.max(1, intervalDays) * 1.2));
      break;
    case 2:
      repetitions += 1;
      intervalDays = repetitions <= 1 ? 1 : repetitions === 2 ? 3 : Math.round(intervalDays * ease);
      break;
    case 3:
      ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      repetitions += 1;
      intervalDays = repetitions <= 1 ? 2 : Math.round(Math.max(2, intervalDays) * ease * 1.3);
      break;
  }

  intervalDays = Math.min(intervalDays, maxIntervalDays);
  const dueAt =
    intervalDays === 0
      ? new Date(now.getTime() + RELEARN_MINUTES * 60_000)
      : new Date(now.getTime() + intervalDays * 86_400_000);

  return {
    flashcardId: record.flashcardId,
    repetitions,
    intervalDays,
    ease,
    lastConfidence: confidence,
    lastReviewedAt: now.toISOString(),
    dueAt: dueAt.toISOString(),
  };
}

export interface SessionCard {
  flashcard: Flashcard;
  record: ReviewRecord | null;
  overdueMs: number;
}

export function orderNextSession(
  flashcards: Flashcard[],
  records: ReviewRecord[],
  options: { now?: Date; limit?: number } = {},
): SessionCard[] {
  const now = options.now ?? new Date();
  const byId = new Map(records.map((record) => [record.flashcardId, record]));

  const ranked = flashcards
    .map((flashcard) => {
      const record = byId.get(flashcard.id) ?? null;
      const overdueMs = record
        ? now.getTime() - Date.parse(record.dueAt)
        : Number.POSITIVE_INFINITY;
      return { flashcard, record, overdueMs };
    })
    .sort((a, b) => {
      const aSeen = a.record !== null;
      const bSeen = b.record !== null;
      if (aSeen !== bSeen) return aSeen ? 1 : -1;

      const aConfidence = a.record?.lastConfidence ?? 0;
      const bConfidence = b.record?.lastConfidence ?? 0;
      if (aConfidence !== bConfidence) return aConfidence - bConfidence;

      if (a.overdueMs !== b.overdueMs) return b.overdueMs - a.overdueMs;
      return a.flashcard.id.localeCompare(b.flashcard.id, "en");
    });

  return options.limit ? ranked.slice(0, options.limit) : ranked;
}

export interface PracticeProgress {
  total: number;
  seen: number;
  due: number;
  confident: number;
  byConfidence: Record<Confidence, number>;
}

export function practiceProgress(
  flashcards: Flashcard[],
  records: ReviewRecord[],
  now = new Date(),
): PracticeProgress {
  const byId = new Map(records.map((record) => [record.flashcardId, record]));
  const byConfidence: Record<Confidence, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let seen = 0;
  let due = 0;
  let confident = 0;

  for (const flashcard of flashcards) {
    const record = byId.get(flashcard.id);
    if (!record || record.lastConfidence === null) {
      due += 1;
      continue;
    }
    seen += 1;
    byConfidence[record.lastConfidence] += 1;
    if (record.lastConfidence >= 2) confident += 1;
    if (Date.parse(record.dueAt) <= now.getTime()) due += 1;
  }

  return { total: flashcards.length, seen, due, confident, byConfidence };
}

export function flashcardsForKit(kit: Kit): Flashcard[] {
  return kit.flashcards;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
