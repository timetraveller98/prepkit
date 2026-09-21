import { z } from "zod";
import type { Flashcard, Question, Requirement } from "../../kit.ts";
import type { LlmClient } from "../../llm/client.ts";
import { systemPrompt } from "../../prompts/base.ts";
import { createIdMinter } from "../../util/ids.ts";
import { topicLabel } from "../schedule.ts";

const flashcardResponseSchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().default(""),
        requirement_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export interface FlashcardInput {
  requirements: Requirement[];
  questions: Question[];
  roleTitle: string;
  existingFronts?: string[];
  startId?: number;
  signal?: AbortSignal;
}

export async function generateFlashcards(
  llm: LlmClient,
  input: FlashcardInput,
): Promise<Flashcard[]> {
  if (input.requirements.length === 0) return [];

  const allowed = new Set(input.requirements.map((requirement) => requirement.id));
  const target = Math.min(18, Math.max(6, input.requirements.length * 2));

  const system = systemPrompt(
    "You turn interview requirements into recall cards a candidate can drill in a spare ten minutes.",
    [
      "A good front is a single question or cue that has one retrievable answer. Never put two questions on one card.",
      "A good back is two or three lines: the answer, plus the one detail that proves you actually know it.",
      "Cards test recall, not opinion. If a requirement is about behaviour, the card should cue the story, not the feeling.",
      "Cover the must-have requirements before anything else.",
    ],
  );

  const user = [
    `Role: ${input.roleTitle || "unknown"}`,
    "",
    "Requirements:",
    ...input.requirements.map(
      (requirement) =>
        `- ${requirement.id} [${requirement.priority}/${requirement.kind}] ${requirement.text}`,
    ),
    "",
    "Interview questions already written, for context:",
    ...input.questions.slice(0, 20).map((question) => `- ${question.prompt}`),
    ...(input.existingFronts?.length
      ? [
          "",
          "Cards that already exist. Do not repeat these:",
          ...input.existingFronts.map((front) => `- ${front}`),
        ]
      : []),
    "",
    `Write ${target} flashcards.`,
    "Return JSON shaped exactly like:",
    JSON.stringify(
      { flashcards: [{ front: "string", back: "string", requirement_ids: ["r1"] }] },
      null,
      2,
    ),
  ].join("\n");

  const result = await llm.structured({
    label: "flashcards",
    system,
    user,
    schema: flashcardResponseSchema,
    temperature: 0.45,
    signal: input.signal,
  });

  const mintId = createIdMinter("f", input.startId ?? 1);
  return result.flashcards.map((card) => ({
    id: mintId(),
    front: card.front.trim(),
    back: card.back.trim(),
    requirement_ids: [...new Set(card.requirement_ids.filter((id) => allowed.has(id)))],
  }));
}

export function synthesizeFlashcards(requirements: Requirement[], startId = 1): Flashcard[] {
  const mintId = createIdMinter("f", startId);
  return requirements
    .filter((requirement) => requirement.priority === "must")
    .map((requirement) => ({
      id: mintId(),
      front: `What can you show for: ${topicLabel(requirement.text) || requirement.text}?`,
      back: `Name one project, the decision you owned, and the result. Requirement as written: ${requirement.text}`,
      requirement_ids: [requirement.id],
    }));
}
