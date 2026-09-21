import { createHash } from "node:crypto";
import {
  computeCoverage,
  type Flashcard,
  type Kit,
  type KitItemState,
  type LlmClient,
  markEdited,
  newMeta,
  nextFreeId,
  pruneKitState,
  type Question,
  type QuestionCategory,
  rebuildSchedule,
  recomputeCoverage,
  regenerateCompanyBrief,
  regenerateFlashcards,
  regenerateQuestionCategory,
  setPinned,
  validateKit,
} from "@prepkit/core";
import type { HydratedDocument } from "mongoose";
import { Types } from "mongoose";
import { type KitDocument, KitModel } from "../../db/models/kit.ts";
import { ApiError } from "../../http/errors.ts";

export type KitRecord = HydratedDocument<KitDocument>;

export function fingerprintFor(userId: string, jobDescription: string, companyUrl: string): string {
  const normalized = [
    userId,
    jobDescription.replace(/\s+/g, " ").trim().toLowerCase(),
    companyUrl.trim().toLowerCase().replace(/\/+$/, ""),
  ].join("\u0000");
  return createHash("sha256").update(normalized).digest("hex");
}

export async function loadOwnedKit(userId: string, kitId: string): Promise<KitRecord> {
  if (!Types.ObjectId.isValid(kitId)) throw ApiError.notFound("no kit with that id");
  const document = await KitModel.findById(kitId);
  if (!document) throw ApiError.notFound("no kit with that id");
  if (document.userId.toString() !== userId) throw ApiError.forbidden();
  return document;
}

export function requireReadyKit(document: KitRecord): { kit: Kit; state: KitItemState } {
  if (document.status !== "ready" || !document.kit) {
    throw ApiError.conflict(
      "KIT_NOT_READY",
      `this kit is ${document.status}, so it cannot be edited yet`,
    );
  }
  return { kit: document.kit, state: document.itemState ?? emptyState(document.kit) };
}

function emptyState(kit: Kit): KitItemState {
  return {
    requirements: Object.fromEntries(kit.role.requirements.map((item) => [item.id, newMeta()])),
    questions: Object.fromEntries(kit.questions.map((item) => [item.id, newMeta()])),
    flashcards: Object.fromEntries(kit.flashcards.map((item) => [item.id, newMeta()])),
    brief: { summary: newMeta(), what_they_do: newMeta() },
    schedule: newMeta(),
  };
}

export async function persistKit(
  document: KitRecord,
  kit: Kit,
  state: KitItemState,
): Promise<KitRecord> {
  const withSchedule = rebuildSchedule(kit);
  const withCoverage = recomputeCoverage(withSchedule);
  const validation = validateKit(withCoverage);
  if (!validation.valid) {
    throw ApiError.badRequest(
      "that change would leave the kit in an invalid shape",
      validation.issues,
    );
  }

  document.kit = validation.kit;
  document.itemState = pruneKitState(validation.kit, state);
  document.markModified("kit");
  document.markModified("itemState");
  await document.save();
  return document;
}

export function updateBrief(
  kit: Kit,
  state: KitItemState,
  patch: { summary?: string; what_they_do?: string },
): { kit: Kit; state: KitItemState } {
  const brief = { ...kit.company_brief };
  const briefState = { ...state.brief };

  if (patch.summary !== undefined) {
    brief.summary = patch.summary;
    briefState.summary = markEdited(state.brief.summary, "user");
  }
  if (patch.what_they_do !== undefined) {
    brief.what_they_do = patch.what_they_do;
    briefState.what_they_do = markEdited(state.brief.what_they_do, "user");
  }

  return { kit: { ...kit, company_brief: brief }, state: { ...state, brief: briefState } };
}

export function updateQuestion(
  kit: Kit,
  state: KitItemState,
  questionId: string,
  patch: Partial<
    Pick<Question, "prompt" | "answer_outline" | "difficulty" | "category" | "requirement_ids">
  >,
): { kit: Kit; state: KitItemState } {
  const index = kit.questions.findIndex((question) => question.id === questionId);
  if (index === -1) throw ApiError.notFound("no question with that id in this kit");

  const current = kit.questions[index] as Question;
  const questions = [...kit.questions];
  questions[index] = { ...current, ...stripUndefined(patch) };

  return {
    kit: { ...kit, questions },
    state: {
      ...state,
      questions: { ...state.questions, [questionId]: markEdited(state.questions[questionId]) },
    },
  };
}

export function addQuestion(
  kit: Kit,
  state: KitItemState,
  input: {
    prompt: string;
    answer_outline?: string;
    difficulty?: number;
    category: QuestionCategory;
    requirement_ids?: string[];
  },
): { kit: Kit; state: KitItemState; id: string } {
  const id = nextFreeId(
    "q",
    kit.questions.map((question) => question.id),
  );
  const known = new Set(kit.role.requirements.map((requirement) => requirement.id));

  const question: Question = {
    id,
    prompt: input.prompt,
    answer_outline: input.answer_outline ?? "",
    difficulty: input.difficulty ?? 2,
    category: input.category,
    requirement_ids: (input.requirement_ids ?? []).filter((value) => known.has(value)),
  };

  return {
    id,
    kit: { ...kit, questions: [...kit.questions, question] },
    state: { ...state, questions: { ...state.questions, [id]: newMeta("user") } },
  };
}

export function deleteQuestion(
  kit: Kit,
  state: KitItemState,
  questionId: string,
): { kit: Kit; state: KitItemState; newGaps: string[] } {
  if (!kit.questions.some((question) => question.id === questionId)) {
    throw ApiError.notFound("no question with that id in this kit");
  }

  const questions = kit.questions.filter((question) => question.id !== questionId);
  const questionState = { ...state.questions };
  delete questionState[questionId];

  const before = new Set(computeCoverage(kit.role.requirements, kit.questions).uncoveredMust);
  const after = computeCoverage(kit.role.requirements, questions).uncoveredMust;

  return {
    kit: { ...kit, questions },
    state: { ...state, questions: questionState },
    newGaps: after.filter((id) => !before.has(id)),
  };
}

export function reorderQuestions(kit: Kit, orderedIds: string[]): Kit {
  return { ...kit, questions: reorder(kit.questions, orderedIds, "question") };
}

export function reorderFlashcards(kit: Kit, orderedIds: string[]): Kit {
  return { ...kit, flashcards: reorder(kit.flashcards, orderedIds, "flashcard") };
}

function reorder<T extends { id: string }>(items: T[], orderedIds: string[], label: string): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result: T[] = [];

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (!item) throw ApiError.badRequest(`no ${label} with id ${id} in this kit`);
    if (seen.has(id)) throw ApiError.badRequest(`${label} ${id} appears twice in the new order`);
    seen.add(id);
    result.push(item);
  }

  for (const item of items) if (!seen.has(item.id)) result.push(item);
  return result;
}

export function updateFlashcard(
  kit: Kit,
  state: KitItemState,
  flashcardId: string,
  patch: Partial<Pick<Flashcard, "front" | "back" | "requirement_ids">>,
): { kit: Kit; state: KitItemState } {
  const index = kit.flashcards.findIndex((flashcard) => flashcard.id === flashcardId);
  if (index === -1) throw ApiError.notFound("no flashcard with that id in this kit");

  const flashcards = [...kit.flashcards];
  flashcards[index] = { ...(kit.flashcards[index] as Flashcard), ...stripUndefined(patch) };

  return {
    kit: { ...kit, flashcards },
    state: {
      ...state,
      flashcards: { ...state.flashcards, [flashcardId]: markEdited(state.flashcards[flashcardId]) },
    },
  };
}

export function addFlashcard(
  kit: Kit,
  state: KitItemState,
  input: { front: string; back?: string; requirement_ids?: string[] },
): { kit: Kit; state: KitItemState; id: string } {
  const id = nextFreeId(
    "f",
    kit.flashcards.map((flashcard) => flashcard.id),
  );
  const known = new Set(kit.role.requirements.map((requirement) => requirement.id));

  const flashcard: Flashcard = {
    id,
    front: input.front,
    back: input.back ?? "",
    requirement_ids: (input.requirement_ids ?? []).filter((value) => known.has(value)),
  };

  return {
    id,
    kit: { ...kit, flashcards: [...kit.flashcards, flashcard] },
    state: { ...state, flashcards: { ...state.flashcards, [id]: newMeta("user") } },
  };
}

export function deleteFlashcard(
  kit: Kit,
  state: KitItemState,
  flashcardId: string,
): { kit: Kit; state: KitItemState } {
  if (!kit.flashcards.some((flashcard) => flashcard.id === flashcardId)) {
    throw ApiError.notFound("no flashcard with that id in this kit");
  }
  const flashcardState = { ...state.flashcards };
  delete flashcardState[flashcardId];

  return {
    kit: { ...kit, flashcards: kit.flashcards.filter((flashcard) => flashcard.id !== flashcardId) },
    state: { ...state, flashcards: flashcardState },
  };
}

export function setItemPinned(
  state: KitItemState,
  collection: "questions" | "flashcards",
  id: string,
  pinned: boolean,
): KitItemState {
  const existing = state[collection][id];
  if (!existing) throw ApiError.notFound(`no item with id ${id} in this kit`);
  return { ...state, [collection]: { ...state[collection], [id]: setPinned(existing, pinned) } };
}

export type RegenerateSection = "company_brief" | "questions" | "flashcards" | "schedule";

export interface RegenerateRequest {
  section: RegenerateSection;
  category?: QuestionCategory;
  daysAvailable?: number;
}

export async function regenerateSection(
  document: KitRecord,
  llm: LlmClient,
  request: RegenerateRequest,
): Promise<{ preservedIds: string[]; replacedIds: string[] }> {
  const { kit, state } = requireReadyKit(document);

  if (document.regeneratingSection) {
    throw ApiError.conflict(
      "REGENERATION_IN_FLIGHT",
      `${document.regeneratingSection} is already being regenerated`,
    );
  }

  const research = document.research ?? {
    pages: [],
    hiring: {
      found: false,
      summary: "",
      stages: [],
      signals: [],
      sources: [],
      confidence: "none" as const,
      notes: [],
      injectionFlags: [],
    },
  };

  document.regeneratingSection = request.section;
  await document.save();

  try {
    if (request.section === "schedule") {
      const days = request.daysAvailable ?? kit.schedule.days_available;
      await persistKit(document, rebuildSchedule(kit, days), {
        ...state,
        schedule: newMeta(),
      });
      return { preservedIds: [], replacedIds: ["schedule"] };
    }

    if (request.section === "company_brief") {
      const result = await regenerateCompanyBrief(llm, kit, state, research);
      await persistKit(document, result.kit, result.state);
      return { preservedIds: result.preservedIds, replacedIds: result.replacedIds };
    }

    if (request.section === "flashcards") {
      const result = await regenerateFlashcards(llm, kit, state);
      await persistKit(document, result.kit, result.state);
      return { preservedIds: result.preservedIds, replacedIds: result.replacedIds };
    }

    if (!request.category) {
      throw ApiError.badRequest("regenerating questions needs a category");
    }
    const result = await regenerateQuestionCategory(llm, kit, state, request.category, research);
    await persistKit(document, result.kit, result.state);
    return { preservedIds: result.preservedIds, replacedIds: result.replacedIds };
  } finally {
    document.regeneratingSection = null;
    await document.save().catch(() => undefined);
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
