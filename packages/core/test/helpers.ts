import type { Question, Requirement } from "../src/kit.ts";

export function requirement(id: string, overrides: Partial<Requirement> = {}): Requirement {
  return {
    id,
    text: `requirement ${id}`,
    kind: "technical",
    priority: "must",
    ...overrides,
  };
}

export function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    requirement_ids: [],
    category: "technical",
    prompt: `prompt ${id}`,
    answer_outline: "outline",
    difficulty: 2,
    ...overrides,
  };
}

export function requirements(
  count: number,
  priority: Requirement["priority"] = "must",
): Requirement[] {
  return Array.from({ length: count }, (_, index) => requirement(`r${index + 1}`, { priority }));
}

export function questionsFor(requirementList: Requirement[], difficulty = 2): Question[] {
  return requirementList.map((item, index) =>
    question(`q${index + 1}`, { requirement_ids: [item.id], difficulty }),
  );
}
