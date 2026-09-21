import { z } from "zod";
import type { CompanyBrief, QuestionCategory, Requirement } from "../../kit.ts";
import type { LlmClient } from "../../llm/client.ts";
import { systemPrompt } from "../../prompts/base.ts";
import type { HiringProcessResult } from "./hiring-process.ts";

export interface GeneratedQuestion {
  requirement_ids: string[];
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty: number;
}

export interface QuestionContext {
  companyName: string;
  roleTitle: string;
  seniority: string;
  companyBrief: CompanyBrief;
  hiring: HiringProcessResult;
}

interface CategoryBrief {
  persona: string;
  rules: string[];
  requirementFilter: (requirement: Requirement) => boolean;
  usesCompanyContext: boolean;
}

const CATEGORY_BRIEFS: Record<QuestionCategory, CategoryBrief> = {
  technical: {
    persona:
      "You are the engineer who will run the technical screen. You probe whether the candidate has actually done the work, not whether they can recite definitions.",
    rules: [
      "Every question must be answerable in five minutes of talking, not an essay.",
      "Prefer questions that start from something the candidate has built and push into trade-offs, failure modes and debugging.",
      "Never ask trivia that a search engine answers in one line.",
      "answer_outline is three to five bullet points describing what a strong answer covers, written as plain lines separated by newlines.",
      "difficulty 1 is a warm-up, 2 is the normal screening bar, 3 is where a senior candidate is expected to show depth.",
    ],
    requirementFilter: (requirement) => requirement.kind === "technical",
    usesCompanyContext: false,
  },
  "system-design": {
    persona:
      "You are the interviewer who runs the design round. You care about how the candidate scopes a problem, reasons about constraints and defends trade-offs.",
    rules: [
      "Anchor each design prompt in the domain this company actually operates in, so the exercise feels like their real work.",
      "State the constraint that makes the problem interesting: scale, latency, consistency, cost or failure tolerance.",
      "Do not ask for a full architecture diagram; ask for the decision the candidate would defend.",
      "answer_outline lists the moving parts a strong answer names and the trade-off it resolves.",
      "Keep difficulty at 2 or 3. A design round has no warm-ups.",
    ],
    requirementFilter: (requirement) =>
      requirement.kind === "technical" || requirement.kind === "domain",
    usesCompanyContext: true,
  },
  behavioural: {
    persona:
      "You are the hiring manager. You are testing judgement, collaboration and how the candidate behaves when things go wrong.",
    rules: [
      "Ask for a specific past situation, never a hypothetical about how they 'would' behave.",
      "Each question must map to a named behaviour the posting asked for, such as mentoring, handling disagreement, or owning an outage.",
      "answer_outline describes the situation, action and result a convincing story contains, and the follow-up the interviewer will push on.",
      "Avoid clichés such as 'what is your greatest weakness'.",
    ],
    requirementFilter: (requirement) => requirement.kind === "behavioural",
    usesCompanyContext: false,
  },
  "company-fit": {
    persona:
      "You are the person who checks whether the candidate has done their homework on this company and wants this job specifically.",
    rules: [
      "Every question must be impossible to answer well without knowing what this company does.",
      "Use the company brief and, where it exists, their published hiring process. Do not invent facts about the company.",
      "If the company brief is thin, ask fewer questions rather than generic ones, and keep them answerable from what is known.",
      "answer_outline points at the specific facts from the brief that a strong answer uses.",
      "Keep difficulty at 1 or 2.",
    ],
    requirementFilter: (requirement) =>
      requirement.kind === "domain" || requirement.kind === "behavioural",
    usesCompanyContext: true,
  },
};

const responseSchema = z.object({
  questions: z
    .array(
      z.object({
        requirement_ids: z.array(z.string()).default([]),
        prompt: z.string().min(1),
        answer_outline: z.string().default(""),
        difficulty: z.number().int().min(1).max(3).default(2),
      }),
    )
    .default([]),
});

export interface GenerateQuestionsInput {
  category: QuestionCategory;
  requirements: Requirement[];
  context: QuestionContext;
  targetCount: number;
  existingPrompts?: string[];
  requiredRequirementIds?: string[];
  signal?: AbortSignal;
}

export function requirementsForCategory(
  category: QuestionCategory,
  requirements: Requirement[],
): Requirement[] {
  const filtered = requirements.filter(CATEGORY_BRIEFS[category].requirementFilter);
  return filtered.length > 0 ? filtered : requirements;
}

export async function generateCategoryQuestions(
  llm: LlmClient,
  input: GenerateQuestionsInput,
): Promise<GeneratedQuestion[]> {
  if (input.targetCount <= 0 || input.requirements.length === 0) return [];

  const brief = CATEGORY_BRIEFS[input.category];
  const allowed = new Set(input.requirements.map((requirement) => requirement.id));

  const system = systemPrompt(brief.persona, [
    ...brief.rules,
    "Attach every question to the requirement ids it genuinely tests. An empty list is better than a wrong link.",
    "Write questions an interviewer would actually say out loud.",
  ]);

  const user = [
    `Role: ${input.context.roleTitle || "unknown"}${input.context.seniority ? ` (${input.context.seniority})` : ""}`,
    `Company: ${input.context.companyName || "unknown"}`,
    "",
    "Requirements you may draw on:",
    ...input.requirements.map(
      (requirement) =>
        `- ${requirement.id} [${requirement.priority}/${requirement.kind}] ${requirement.text}`,
    ),
    ...(input.requiredRequirementIds?.length
      ? [
          "",
          `These requirement ids have no question yet and must each get one: ${input.requiredRequirementIds.join(", ")}`,
        ]
      : []),
    ...(brief.usesCompanyContext ? companyContextLines(input.context) : []),
    ...(input.existingPrompts?.length
      ? [
          "",
          "Questions that already exist. Do not repeat or lightly reword these:",
          ...input.existingPrompts.map((prompt) => `- ${prompt}`),
        ]
      : []),
    "",
    `Write ${input.targetCount} ${input.category} question(s).`,
    "Return JSON shaped exactly like:",
    JSON.stringify(
      {
        questions: [
          { requirement_ids: ["r1"], prompt: "string", answer_outline: "string", difficulty: 2 },
        ],
      },
      null,
      2,
    ),
  ].join("\n");

  const result = await llm.structured({
    label: `questions:${input.category}`,
    system,
    user,
    schema: responseSchema,
    temperature: 0.55,
    signal: input.signal,
  });

  return result.questions.map((question) => ({
    category: input.category,
    prompt: question.prompt.trim(),
    answer_outline: question.answer_outline.trim(),
    difficulty: clampDifficulty(question.difficulty, input.category),
    requirement_ids: [...new Set(question.requirement_ids.filter((id) => allowed.has(id)))],
  }));
}

function companyContextLines(context: QuestionContext): string[] {
  const lines = ["", "What we know about the company:"];
  if (context.companyBrief.what_they_do)
    lines.push(`- What they do: ${context.companyBrief.what_they_do}`);
  if (context.companyBrief.summary) lines.push(`- Summary: ${context.companyBrief.summary}`);
  if (context.hiring.found) {
    lines.push(
      `- Published hiring process (confidence ${context.hiring.confidence}): ${context.hiring.summary}`,
    );
    for (const stage of context.hiring.stages)
      lines.push(`  - Stage ${stage.name}: ${stage.what_happens}`);
    if (context.hiring.signals.length > 0) {
      lines.push(`- Prepare for: ${context.hiring.signals.join(", ")}`);
    }
  } else {
    lines.push("- No hiring process could be found. Do not pretend to know how they interview.");
  }
  return lines;
}

function clampDifficulty(value: number, category: QuestionCategory): number {
  if (category === "system-design") return Math.min(3, Math.max(2, value));
  if (category === "company-fit") return Math.min(2, Math.max(1, value));
  return Math.min(3, Math.max(1, value));
}

export function targetCountFor(
  category: QuestionCategory,
  requirements: Requirement[],
  seniority: string,
): number {
  const relevant = requirements.filter(CATEGORY_BRIEFS[category].requirementFilter);
  const musts = relevant.filter((requirement) => requirement.priority === "must").length;
  const senior = /senior|staff|principal|lead|head|manager/i.test(seniority);

  switch (category) {
    case "technical":
      return clamp(Math.ceil(musts * 1.2) + 2, 3, 10);
    case "behavioural":
      return clamp(musts + 2, 2, 6);
    case "system-design":
      if (relevant.length === 0) return 0;
      return senior ? 3 : 2;
    case "company-fit":
      return 3;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
