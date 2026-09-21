import type { Question, Requirement } from "../kit.ts";

export interface CoverageReport {
  byRequirement: Record<string, string[]>;
  uncovered: string[];
  uncoveredMust: string[];
  uncoveredNice: string[];
  orphanQuestionIds: string[];
}

export function computeCoverage(
  requirements: Requirement[],
  questions: Question[],
): CoverageReport {
  const known = new Set(requirements.map((requirement) => requirement.id));
  const byRequirement: Record<string, string[]> = {};
  for (const requirement of requirements) byRequirement[requirement.id] = [];

  const orphanQuestionIds: string[] = [];
  for (const question of questions) {
    const valid = question.requirement_ids.filter((id) => known.has(id));
    if (valid.length === 0) orphanQuestionIds.push(question.id);
    for (const id of valid) byRequirement[id]?.push(question.id);
  }

  const uncovered = requirements
    .filter((requirement) => (byRequirement[requirement.id] ?? []).length === 0)
    .map((requirement) => requirement.id);

  const priorityOf = new Map(requirements.map((r) => [r.id, r.priority]));

  return {
    byRequirement,
    uncovered,
    uncoveredMust: uncovered.filter((id) => priorityOf.get(id) === "must"),
    uncoveredNice: uncovered.filter((id) => priorityOf.get(id) === "nice"),
    orphanQuestionIds,
  };
}

export function dropUnknownRequirementLinks(
  requirements: Requirement[],
  questions: Question[],
): Question[] {
  const known = new Set(requirements.map((requirement) => requirement.id));
  return questions.map((question) => ({
    ...question,
    requirement_ids: question.requirement_ids.filter((id) => known.has(id)),
  }));
}
