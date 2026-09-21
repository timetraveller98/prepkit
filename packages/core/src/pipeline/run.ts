import {
  type Kit,
  QUESTION_CATEGORIES,
  type Question,
  type QuestionCategory,
  type Requirement,
  validateKit,
} from "../kit.ts";
import type { LlmClient } from "../llm/client.ts";
import { type EnvSource, currentEnv, readEnvNumber } from "../env.ts";
import { createLlmClient } from "../llm/index.ts";
import {
  CompanySiteUnreachableError,
  type CrawledPage,
  type CrawlResult,
  crawlCompanySite,
} from "../retrieval/crawler.ts";
import { Fetcher } from "../retrieval/fetcher.ts";
import { RobotsRegistry } from "../retrieval/robots.ts";
import { type SearchOutcome, searchPublicDiscussion } from "../retrieval/search.ts";
import { createIdMinter } from "../util/ids.ts";
import { computeCoverage, dropUnknownRequirementLinks } from "./coverage.ts";
import { createReporter, type PipelineEvent, type PipelineReporter } from "./events.ts";
import { buildSchedule, scheduleCoversRequirements } from "./schedule.ts";
import { synthesizeQuestion } from "./steps/backstop.ts";
import { writeCompanyBrief } from "./steps/company-brief.ts";
import { extractRequirements } from "./steps/extract-requirements.ts";
import { generateFlashcards, synthesizeFlashcards } from "./steps/flashcards.ts";
import {
  type GeneratedQuestion,
  generateCategoryQuestions,
  type QuestionContext,
  requirementsForCategory,
  targetCountFor,
} from "./steps/generate-questions.ts";
import { type HiringProcessResult, researchHiringProcess } from "./steps/hiring-process.ts";

export type KitFailureCode =
  | "EMPTY_JOB_DESCRIPTION"
  | "LLM_UNAVAILABLE"
  | "KIT_INVALID"
  | "ABORTED";

export class KitGenerationError extends Error {
  readonly code: KitFailureCode;
  readonly detail: string | undefined;
  constructor(code: KitFailureCode, message: string, detail?: string) {
    super(message);
    this.name = "KitGenerationError";
    this.code = code;
    this.detail = detail;
  }
}

export interface GenerateKitInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  llm?: LlmClient;
  env?: EnvSource;
  signal?: AbortSignal;
  onProgress?: PipelineReporter;
  crawlBudgetMs?: number;
  searchBudgetMs?: number;
  maxCoveragePasses?: number;
}

export interface ResearchSnapshot {
  pages: CrawledPage[];
  hiring: HiringProcessResult;
}

export interface KitGenerationResult {
  kit: Kit;
  events: PipelineEvent[];
  usage: { calls: number; inputTokens: number; outputTokens: number };
  research: ResearchSnapshot;
}

const SNAPSHOT_PAGE_LIMIT = 6;
const SNAPSHOT_TEXT_LIMIT = 6000;

export function compactPages(pages: CrawledPage[]): CrawledPage[] {
  return [...pages]
    .sort((a, b) => b.score - a.score)
    .slice(0, SNAPSHOT_PAGE_LIMIT)
    .map((page) => ({ ...page, text: page.text.slice(0, SNAPSHOT_TEXT_LIMIT) }));
}

const DEFAULT_MAX_COVERAGE_PASSES = 3;

export async function generateKit(input: GenerateKitInput): Promise<KitGenerationResult> {
  const env = input.env ?? currentEnv();
  const jobDescription = input.jobDescription.trim();
  if (jobDescription.length < 20) {
    throw new KitGenerationError(
      "EMPTY_JOB_DESCRIPTION",
      "the job description is empty or too short to work from",
    );
  }

  const { events, emit } = createReporter(input.onProgress);
  const llm = input.llm ?? createLlmClient(env);
  const notes: string[] = [];
  const injectionFlags = new Set<string>();

  const fetcher = new Fetcher({
    allowPrivateAddresses: allowPrivateAddresses(env),
    timeoutMs: readEnvNumber(env.FETCH_TIMEOUT_MS, 12_000),
    maxBytes: readEnvNumber(env.FETCH_MAX_BYTES, 2_000_000),
  });
  const robots = new RobotsRegistry(fetcher);

  emit("extract-requirements", "started");
  const extraction = await extractRequirements(llm, jobDescription, input.signal).catch((error) => {
    emit("extract-requirements", "failed", describe(error));
    throw asGenerationError(error);
  });
  emit(
    "extract-requirements",
    "completed",
    `${extraction.requirements.length} requirement(s), ${extraction.requirements.filter((r) => r.priority === "must").length} must-have`,
  );
  notes.push(...extraction.notes);
  for (const flag of extraction.injectionFlags) injectionFlags.add(flag);

  emit("crawl-company-site", "started");
  let crawl: CrawlResult | null = null;
  const crawlFailures: { url: string; reason: string }[] = [];
  try {
    crawl = await crawlCompanySite({
      startUrl: input.companyUrl,
      fetcher,
      robots,
      signal: input.signal,
      timeBudgetMs: input.crawlBudgetMs ?? 45_000,
      maxPages: readEnvNumber(env.CRAWL_MAX_PAGES, 12),
    });
    emit(
      "crawl-company-site",
      "completed",
      `${crawl.pages.length} page(s) read, ${crawl.failures.length} skipped`,
    );
  } catch (error) {
    if (error instanceof CompanySiteUnreachableError) {
      crawlFailures.push(...error.attempts);
      notes.push(
        `The company site at ${input.companyUrl} could not be reached, so the brief and company-fit questions are built without it.`,
      );
      emit("crawl-company-site", "failed", error.message);
    } else {
      throw asGenerationError(error);
    }
  }

  const companyName = extraction.companyName || deriveCompanyName(input.companyUrl);

  emit("search-public-discussion", "started");
  let discussion: SearchOutcome = {
    provider: "none",
    hits: [],
    fetchedPages: [],
    failures: [],
    attemptedQueries: [],
  };
  try {
    discussion = await withTimeout(
      searchPublicDiscussion({
        company: companyName,
        roleTitle: extraction.roleTitle,
        fetcher,
        robots,
        env,
        signal: input.signal,
      }),
      input.searchBudgetMs ?? 30_000,
    );
    emit(
      "search-public-discussion",
      "completed",
      discussion.hits.length > 0
        ? `${discussion.hits.length} result(s) via ${discussion.provider}`
        : "no public discussion found",
    );
  } catch (error) {
    emit("search-public-discussion", "failed", describe(error));
  }
  if (discussion.hits.length === 0) {
    notes.push("No public discussion of this company's interview process could be found.");
  }

  emit("company-brief", "started");
  const briefResult = await writeCompanyBrief(llm, {
    companyName,
    companyUrl: input.companyUrl,
    pages: crawl?.pages ?? [],
    signal: input.signal,
  }).catch((error) => {
    emit("company-brief", "failed", describe(error));
    return {
      brief: { summary: "", what_they_do: "", sources: [] },
      notes: ["The company brief could not be generated."],
      injectionFlags: [] as string[],
    };
  });
  notes.push(...briefResult.notes);
  for (const flag of briefResult.injectionFlags) injectionFlags.add(flag);
  emit("company-brief", "completed", briefResult.brief.summary ? undefined : "brief left empty");

  emit("hiring-process", "started");
  const hiring: HiringProcessResult = await researchHiringProcess(llm, {
    companyName,
    roleTitle: extraction.roleTitle,
    sitePages: crawl?.pages ?? [],
    discussion,
    signal: input.signal,
  }).catch((error) => {
    emit("hiring-process", "failed", describe(error));
    return {
      found: false,
      summary: "",
      stages: [],
      signals: [],
      sources: [],
      confidence: "none" as const,
      notes: [
        "The hiring process step failed, so the kit assumes nothing about how they interview.",
      ],
      injectionFlags: [] as string[],
    };
  });
  notes.push(...hiring.notes);
  for (const flag of hiring.injectionFlags) injectionFlags.add(flag);
  emit(
    "hiring-process",
    "completed",
    hiring.found ? `confidence ${hiring.confidence}` : "not found",
  );

  const context: QuestionContext = {
    companyName,
    roleTitle: extraction.roleTitle,
    seniority: extraction.seniority,
    companyBrief: briefResult.brief,
    hiring,
  };

  emit("questions", "started");
  const drafted: GeneratedQuestion[] = [];
  for (const category of QUESTION_CATEGORIES) {
    const relevant = requirementsForCategory(category, extraction.requirements);
    const targetCount = targetCountFor(category, extraction.requirements, extraction.seniority);
    if (targetCount === 0 || relevant.length === 0) {
      emit(`questions:${category}`, "skipped", "no relevant requirements");
      continue;
    }
    try {
      const generated = await generateCategoryQuestions(llm, {
        category,
        requirements: relevant,
        context,
        targetCount,
        existingPrompts: drafted.map((question) => question.prompt),
        signal: input.signal,
      });
      drafted.push(...generated);
      emit(`questions:${category}`, "completed", `${generated.length} question(s)`);
    } catch (error) {
      emit(`questions:${category}`, "failed", describe(error));
      notes.push(`The ${category} question set could not be generated.`);
    }
  }
  emit("questions", "completed", `${drafted.length} question(s) drafted`);

  const mintQuestionId = createIdMinter("q");
  let questions: Question[] = dedupeQuestions(drafted).map((question) => ({
    id: mintQuestionId(),
    requirement_ids: question.requirement_ids,
    category: question.category,
    prompt: question.prompt,
    answer_outline: question.answer_outline,
    difficulty: question.difficulty,
  }));

  const maxPasses = input.maxCoveragePasses ?? DEFAULT_MAX_COVERAGE_PASSES;
  let passes = 0;
  let coverage = computeCoverage(extraction.requirements, questions);
  passes += 1;
  emit(
    "coverage",
    "started",
    `${coverage.uncoveredMust.length} must-have gap(s) after the first draft`,
  );

  while (coverage.uncoveredMust.length > 0 && passes < maxPasses) {
    const gaps = extraction.requirements.filter((requirement) =>
      coverage.uncoveredMust.includes(requirement.id),
    );
    const byCategory = groupGapsByCategory(gaps);

    for (const [category, gapRequirements] of byCategory) {
      try {
        const generated = await generateCategoryQuestions(llm, {
          category,
          requirements: gapRequirements,
          context,
          targetCount: gapRequirements.length,
          existingPrompts: questions.map((question) => question.prompt),
          requiredRequirementIds: gapRequirements.map((requirement) => requirement.id),
          signal: input.signal,
        });
        for (const question of dedupeQuestions(
          generated,
          questions.map((item) => item.prompt),
        )) {
          questions.push({
            id: mintQuestionId(),
            requirement_ids: question.requirement_ids,
            category: question.category,
            prompt: question.prompt,
            answer_outline: question.answer_outline,
            difficulty: question.difficulty,
          });
        }
      } catch (error) {
        emit(`coverage:gap-fill:${category}`, "failed", describe(error));
      }
    }

    coverage = computeCoverage(extraction.requirements, questions);
    passes += 1;
    emit(
      "coverage",
      "retrying",
      `pass ${passes}: ${coverage.uncoveredMust.length} must-have gap(s) remaining`,
    );
  }

  if (coverage.uncoveredMust.length > 0) {
    const stillMissing = extraction.requirements.filter((requirement) =>
      coverage.uncoveredMust.includes(requirement.id),
    );
    for (const requirement of stillMissing) {
      const synthesized = synthesizeQuestion(requirement);
      questions.push({
        id: mintQuestionId(),
        requirement_ids: synthesized.requirement_ids,
        category: synthesized.category,
        prompt: synthesized.prompt,
        answer_outline: synthesized.answer_outline,
        difficulty: synthesized.difficulty,
      });
    }
    notes.push(
      `${stillMissing.length} must-have requirement(s) were still uncovered after ${passes} generation passes, so the application wrote a direct question for each rather than shipping a gap.`,
    );
    coverage = computeCoverage(extraction.requirements, questions);
    passes += 1;
  }

  questions = dropUnknownRequirementLinks(extraction.requirements, questions);
  emit(
    "coverage",
    "completed",
    `${passes} pass(es), ${coverage.uncovered.length} requirement(s) still uncovered`,
  );

  emit("flashcards", "started");
  let flashcards = await generateFlashcards(llm, {
    requirements: extraction.requirements,
    questions,
    roleTitle: extraction.roleTitle,
    signal: input.signal,
  }).catch((error) => {
    emit("flashcards", "failed", describe(error));
    return synthesizeFlashcards(extraction.requirements);
  });
  if (flashcards.length === 0 && extraction.requirements.length > 0) {
    flashcards = synthesizeFlashcards(extraction.requirements);
  }
  emit("flashcards", "completed", `${flashcards.length} card(s)`);

  emit("schedule", "started");
  const schedule = buildSchedule({
    daysAvailable: input.daysAvailable,
    requirements: extraction.requirements,
    questions,
  });
  const unscheduledMust = scheduleCoversRequirements(schedule, questions, extraction.requirements);
  if (unscheduledMust.length > 0) {
    notes.push(`Schedule does not reach must-have requirement(s): ${unscheduledMust.join(", ")}.`);
  }
  emit("schedule", "completed", `${schedule.days.length} day(s)`);

  const pagesUsed = [
    ...(crawl?.pages.map((page) => page.url) ?? []),
    ...discussion.fetchedPages.map((page) => page.url),
  ];

  const kitCandidate: Kit = {
    source: {
      company: companyName,
      company_url: input.companyUrl,
      role: extraction.roleTitle,
      location: extraction.location,
      jd_chars: jobDescription.length,
      researched_at: new Date().toISOString(),
      pages_used: [...new Set(pagesUsed)],
    },
    company_brief: briefResult.brief,
    role: {
      title: extraction.roleTitle,
      seniority: extraction.seniority,
      responsibilities: extraction.responsibilities,
      requirements: extraction.requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered,
      passes,
    },
    research: {
      hiring_process_found: hiring.found,
      hiring_process_summary: hiring.summary,
      hiring_pages: hiring.sources,
      public_discussion_found: discussion.hits.length > 0,
      public_discussion_sources: discussion.hits.map((hit) => hit.url),
      pages_failed: [...crawlFailures, ...(crawl?.failures ?? []), ...discussion.failures],
      robots_blocked: crawl?.robotsBlocked ?? [],
      suspicious_content_flags: [...injectionFlags],
    },
    notes: [...new Set(notes)],
  };

  emit("validate", "started");
  const validation = validateKit(kitCandidate);
  if (!validation.valid) {
    emit(
      "validate",
      "failed",
      validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
    throw new KitGenerationError(
      "KIT_INVALID",
      "the generated kit did not match the expected structure",
      validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
    );
  }
  emit("validate", "completed");

  return {
    kit: validation.kit,
    events,
    usage: llm.usage,
    research: { pages: compactPages(crawl?.pages ?? []), hiring },
  };
}

function groupGapsByCategory(requirements: Requirement[]): Map<QuestionCategory, Requirement[]> {
  const grouped = new Map<QuestionCategory, Requirement[]>();
  for (const requirement of requirements) {
    const category: QuestionCategory =
      requirement.kind === "behavioural"
        ? "behavioural"
        : requirement.kind === "domain"
          ? "company-fit"
          : "technical";
    const bucket = grouped.get(category) ?? [];
    bucket.push(requirement);
    grouped.set(category, bucket);
  }
  return grouped;
}

export function dedupeQuestions(
  questions: GeneratedQuestion[],
  alreadyUsed: string[] = [],
): GeneratedQuestion[] {
  const seen = new Set(alreadyUsed.map(fingerprint));
  const unique: GeneratedQuestion[] = [];
  for (const question of questions) {
    const key = fingerprint(question.prompt);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(question);
  }
  return unique;
}

function fingerprint(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 12)
    .join(" ");
}

export function deriveCompanyName(companyUrl: string): string {
  try {
    const host = new URL(companyUrl.includes("://") ? companyUrl : `https://${companyUrl}`)
      .hostname;
    const withoutWww = host.replace(/^www\./, "");
    const label = withoutWww.split(".")[0] ?? withoutWww;
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return "";
  }
}

export function allowPrivateAddresses(env: EnvSource): boolean {
  if (env.ALLOW_PRIVATE_URLS === "true") return true;
  if (env.ALLOW_PRIVATE_URLS === "false") return false;
  return env.NODE_ENV !== "production";
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`step exceeded ${ms}ms budget`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asGenerationError(error: unknown): KitGenerationError {
  if (error instanceof KitGenerationError) return error;
  const message = describe(error);
  if (/aborted/i.test(message)) return new KitGenerationError("ABORTED", message);
  return new KitGenerationError("LLM_UNAVAILABLE", message);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

