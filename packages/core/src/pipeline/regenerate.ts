import type { Flashcard, Kit, Question, QuestionCategory } from "../kit.ts";
import type { LlmClient } from "../llm/client.ts";
import type { CrawledPage } from "../retrieval/crawler.ts";
import { type ItemMeta, isProtected, type KitItemState, newMeta } from "../state.ts";
import { nextFreeId } from "../util/ids.ts";
import { computeCoverage, dropUnknownRequirementLinks } from "./coverage.ts";
import { buildSchedule } from "./schedule.ts";
import { synthesizeQuestion } from "./steps/backstop.ts";
import { writeCompanyBrief } from "./steps/company-brief.ts";
import { generateFlashcards } from "./steps/flashcards.ts";
import {
  generateCategoryQuestions,
  type QuestionContext,
  requirementsForCategory,
  targetCountFor,
} from "./steps/generate-questions.ts";
import type { HiringProcessResult } from "./steps/hiring-process.ts";

export interface RegenerationContext {
  pages: CrawledPage[];
  hiring: HiringProcessResult;
}

export interface RegenerationResult {
  kit: Kit;
  state: KitItemState;
  preservedIds: string[];
  replacedIds: string[];
}

export async function regenerateCompanyBrief(
  llm: LlmClient,
  kit: Kit,
  state: KitItemState,
  context: RegenerationContext,
  signal?: AbortSignal,
): Promise<RegenerationResult> {
  const summaryLocked = isProtected(state.brief.summary);
  const whatLocked = isProtected(state.brief.what_they_do);

  if (summaryLocked && whatLocked) {
    return { kit, state, preservedIds: ["brief.summary", "brief.what_they_do"], replacedIds: [] };
  }

  const result = await writeCompanyBrief(llm, {
    companyName: kit.source.company,
    companyUrl: kit.source.company_url,
    pages: context.pages,
    preserved: summaryLocked ? { summary: kit.company_brief.summary } : undefined,
    signal,
  });

  const preservedIds: string[] = [];
  const replacedIds: string[] = [];

  const summary = summaryLocked ? kit.company_brief.summary : result.brief.summary;
  const whatTheyDo = whatLocked ? kit.company_brief.what_they_do : result.brief.what_they_do;
  (summaryLocked ? preservedIds : replacedIds).push("brief.summary");
  (whatLocked ? preservedIds : replacedIds).push("brief.what_they_do");

  return {
    kit: {
      ...kit,
      company_brief: { summary, what_they_do: whatTheyDo, sources: result.brief.sources },
      notes: mergeNotes(kit.notes, result.notes),
    },
    state: {
      ...state,
      brief: {
        summary: summaryLocked ? state.brief.summary : newMeta(),
        what_they_do: whatLocked ? state.brief.what_they_do : newMeta(),
      },
    },
    preservedIds,
    replacedIds,
  };
}

export async function regenerateQuestionCategory(
  llm: LlmClient,
  kit: Kit,
  state: KitItemState,
  category: QuestionCategory,
  context: RegenerationContext,
  signal?: AbortSignal,
): Promise<RegenerationResult> {
  const preserved: Question[] = [];
  const replacedIds: string[] = [];

  const retained = kit.questions.filter((question) => {
    if (question.category !== category) return true;
    if (isProtected(state.questions[question.id])) {
      preserved.push(question);
      return true;
    }
    replacedIds.push(question.id);
    return false;
  });

  const relevant = requirementsForCategory(category, kit.role.requirements);
  const baseTarget = targetCountFor(category, kit.role.requirements, kit.role.seniority);
  const targetCount = Math.max(2, baseTarget - preserved.length);

  const questionContext: QuestionContext = {
    companyName: kit.source.company,
    roleTitle: kit.role.title,
    seniority: kit.role.seniority,
    companyBrief: kit.company_brief,
    hiring: context.hiring,
  };

  const generated = await generateCategoryQuestions(llm, {
    category,
    requirements: relevant,
    context: questionContext,
    targetCount,
    existingPrompts: kit.questions.map((question) => question.prompt),
    signal,
  });

  const usedIds = new Set([...kit.questions.map((question) => question.id)]);
  const nextState: KitItemState = { ...state, questions: { ...state.questions } };
  for (const id of replacedIds) delete nextState.questions[id];

  const added: Question[] = generated.map((question) => {
    const id = nextFreeId("q", usedIds);
    usedIds.add(id);
    nextState.questions[id] = newMeta();
    return {
      id,
      requirement_ids: question.requirement_ids,
      category: question.category,
      prompt: question.prompt,
      answer_outline: question.answer_outline,
      difficulty: question.difficulty,
    };
  });

  const questions = dropUnknownRequirementLinks(kit.role.requirements, [...retained, ...added]);
  const sealed = sealCoverageGaps(kit, questions, nextState);

  return {
    kit: rebuildSchedule({ ...kit, questions: sealed.questions, notes: kit.notes }),
    state: sealed.state,
    preservedIds: preserved.map((question) => question.id),
    replacedIds,
  };
}

export async function regenerateFlashcards(
  llm: LlmClient,
  kit: Kit,
  state: KitItemState,
  signal?: AbortSignal,
): Promise<RegenerationResult> {
  const preserved: Flashcard[] = [];
  const replacedIds: string[] = [];

  for (const flashcard of kit.flashcards) {
    if (isProtected(state.flashcards[flashcard.id])) preserved.push(flashcard);
    else replacedIds.push(flashcard.id);
  }

  const generated = await generateFlashcards(llm, {
    requirements: kit.role.requirements,
    questions: kit.questions,
    roleTitle: kit.role.title,
    existingFronts: preserved.map((flashcard) => flashcard.front),
    signal,
  });

  const usedIds = new Set(preserved.map((flashcard) => flashcard.id));
  const nextState: KitItemState = { ...state, flashcards: { ...state.flashcards } };
  for (const id of replacedIds) delete nextState.flashcards[id];

  const added = generated.map((flashcard) => {
    const id = nextFreeId("f", usedIds);
    usedIds.add(id);
    nextState.flashcards[id] = newMeta();
    return { ...flashcard, id };
  });

  return {
    kit: { ...kit, flashcards: [...preserved, ...added] },
    state: nextState,
    preservedIds: preserved.map((flashcard) => flashcard.id),
    replacedIds,
  };
}

export function rebuildSchedule(kit: Kit, daysAvailable?: number): Kit {
  const schedule = buildSchedule({
    daysAvailable: daysAvailable ?? kit.schedule.days_available,
    requirements: kit.role.requirements,
    questions: kit.questions,
  });
  return { ...kit, schedule };
}

export function recomputeCoverage(kit: Kit): Kit {
  const coverage = computeCoverage(kit.role.requirements, kit.questions);
  return {
    ...kit,
    coverage: { uncovered_requirement_ids: coverage.uncovered, passes: kit.coverage.passes },
  };
}

function sealCoverageGaps(
  kit: Kit,
  questions: Question[],
  state: KitItemState,
): { questions: Question[]; state: KitItemState } {
  const coverage = computeCoverage(kit.role.requirements, questions);
  if (coverage.uncoveredMust.length === 0) return { questions, state };

  const usedIds = new Set(questions.map((question) => question.id));
  const nextState: KitItemState = { ...state, questions: { ...state.questions } };
  const filled = [...questions];

  for (const requirementId of coverage.uncoveredMust) {
    const requirement = kit.role.requirements.find((item) => item.id === requirementId);
    if (!requirement) continue;
    const synthesized = synthesizeQuestion(requirement);
    const id = nextFreeId("q", usedIds);
    usedIds.add(id);
    nextState.questions[id] = newMeta();
    filled.push({
      id,
      requirement_ids: synthesized.requirement_ids,
      category: synthesized.category,
      prompt: synthesized.prompt,
      answer_outline: synthesized.answer_outline,
      difficulty: synthesized.difficulty,
    });
  }

  return { questions: filled, state: nextState };
}

function mergeNotes(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

export type { ItemMeta };
