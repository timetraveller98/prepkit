import type { Kit, Requirement } from "./kit.ts";
import type { ReviewRecord } from "./practice.ts";

export interface RequirementReadiness {
  requirementId: string;
  text: string;
  priority: Requirement["priority"];
  kind: Requirement["kind"];
  questionIds: string[];
  flashcardIds: string[];
  drilled: number;
  confidence: number | null;
  risk: number;
}

export interface ReadinessReport {
  score: number;
  generatedAt: string;
  totalRequirements: number;
  mustRequirements: number;
  untouchedMustRequirements: number;
  byRequirement: RequirementReadiness[];
  weakSpots: RequirementReadiness[];
  strengths: RequirementReadiness[];
  nextFlashcardIds: string[];
}

const PRIORITY_WEIGHT: Record<Requirement["priority"], number> = { must: 1, nice: 0.35 };
const WEAK_SPOT_LIMIT = 5;

export function computeReadiness(
  kit: Kit,
  records: ReviewRecord[],
  options: { weakSpotLimit?: number } = {},
): ReadinessReport {
  const recordsById = new Map(records.map((record) => [record.flashcardId, record]));

  const byRequirement: RequirementReadiness[] = kit.role.requirements.map((requirement) => {
    const questionIds = kit.questions
      .filter((question) => question.requirement_ids.includes(requirement.id))
      .map((question) => question.id);
    const flashcards = kit.flashcards.filter((flashcard) =>
      flashcard.requirement_ids.includes(requirement.id),
    );

    const scored = flashcards
      .map((flashcard) => recordsById.get(flashcard.id))
      .filter(
        (record): record is ReviewRecord => Boolean(record) && record?.lastConfidence !== null,
      );

    const confidence =
      scored.length === 0
        ? null
        : scored.reduce((sum, record) => sum + (record.lastConfidence ?? 0), 0) / scored.length / 3;

    const gap = confidence === null ? 1 : 1 - confidence;
    const risk = Math.round(PRIORITY_WEIGHT[requirement.priority] * gap * 100) / 100;

    return {
      requirementId: requirement.id,
      text: requirement.text,
      priority: requirement.priority,
      kind: requirement.kind,
      questionIds,
      flashcardIds: flashcards.map((flashcard) => flashcard.id),
      drilled: scored.length,
      confidence: confidence === null ? null : Math.round(confidence * 100) / 100,
      risk,
    };
  });

  const weighted = byRequirement.reduce(
    (accumulator, item) => {
      const weight = PRIORITY_WEIGHT[item.priority];
      return {
        weight: accumulator.weight + weight,
        earned: accumulator.earned + weight * (item.confidence ?? 0),
      };
    },
    { weight: 0, earned: 0 },
  );

  const score = weighted.weight === 0 ? 0 : Math.round((weighted.earned / weighted.weight) * 100);

  const ranked = [...byRequirement].sort(
    (a, b) =>
      b.risk - a.risk ||
      a.drilled - b.drilled ||
      a.requirementId.localeCompare(b.requirementId, "en"),
  );
  const weakSpots = ranked
    .filter((item) => item.risk > 0.15)
    .slice(0, options.weakSpotLimit ?? WEAK_SPOT_LIMIT);

  return {
    score,
    generatedAt: new Date().toISOString(),
    totalRequirements: byRequirement.length,
    mustRequirements: byRequirement.filter((item) => item.priority === "must").length,
    untouchedMustRequirements: byRequirement.filter(
      (item) => item.priority === "must" && item.drilled === 0,
    ).length,
    byRequirement,
    weakSpots,
    strengths: [...byRequirement]
      .filter((item) => (item.confidence ?? 0) >= 0.66)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 3),
    nextFlashcardIds: weakSpots.flatMap((item) => item.flashcardIds),
  };
}
