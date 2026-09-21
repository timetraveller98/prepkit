import { z } from "zod";
import type { Requirement } from "../../kit.ts";
import type { LlmClient } from "../../llm/client.ts";
import { systemPrompt } from "../../prompts/base.ts";
import { createIdMinter } from "../../util/ids.ts";
import { wordCount } from "../../util/text.ts";
import { wrapUntrusted } from "../../util/untrusted.ts";
import { keepGrounded } from "../evidence.ts";

const THIN_POSTING_WORDS = 60;

const extractionSchema = z.object({
  company_name: z.string().default(""),
  role_title: z.string().default(""),
  seniority: z.string().default(""),
  location: z.string().default(""),
  responsibilities: z.array(z.string()).default([]),
  requirements: z
    .array(
      z.object({
        text: z.string().min(1),
        kind: z.enum(["technical", "behavioural", "domain"]),
        priority: z.enum(["must", "nice"]),
        evidence: z.string().default(""),
      }),
    )
    .default([]),
  notes: z.array(z.string()).default([]),
});

export interface ExtractionResult {
  companyName: string;
  roleTitle: string;
  seniority: string;
  location: string;
  responsibilities: string[];
  requirements: Requirement[];
  notes: string[];
  thinPosting: boolean;
  injectionFlags: string[];
}

export async function extractRequirements(
  llm: LlmClient,
  jobDescription: string,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const thinPosting = wordCount(jobDescription) < THIN_POSTING_WORDS;
  const posting = wrapUntrusted("job description pasted by the user", jobDescription, 24_000);

  const system = systemPrompt(
    "You read a single job posting and report exactly what it asks for. You are deliberately conservative: a short posting produces a short list.",
    [
      "A requirement is something the posting expects the candidate to bring. Responsibilities are what the job involves; keep them separate.",
      'Mark priority "must" only when the posting frames it as required, essential, expected or stated as plain fact about the person they want.',
      'Mark priority "nice" when the posting frames it as a bonus, a plus, preferred, desirable, an advantage, or "nice to have".',
      'kind is "technical" for tools, languages, systems and engineering practice; "behavioural" for collaboration, communication, mentoring, ownership and ways of working; "domain" for industry, market, regulatory or product knowledge.',
      "evidence must be a verbatim span copied from the posting that justifies the requirement. Never paraphrase inside evidence.",
      "Do not merge two distinct requirements into one entry, and do not split one requirement into several.",
      "If the posting is too thin to yield requirements, return an empty list and explain that in notes. An empty list is a correct answer; an invented list is not.",
    ],
  );

  const user = [
    "Extract the role and its requirements from the posting below.",
    "",
    posting.text,
    "",
    "Return JSON shaped exactly like:",
    JSON.stringify(
      {
        company_name: "string, empty if the posting does not name the employer",
        role_title: "string",
        seniority:
          "one of intern, junior, mid, senior, staff, principal, lead, manager, or empty if unstated",
        location: "string, empty if unstated",
        responsibilities: ["short phrases taken from the posting"],
        requirements: [
          {
            text: "the requirement in the posting's own words",
            kind: "technical",
            priority: "must",
            evidence: "verbatim span from the posting",
          },
        ],
        notes: ["anything the posting does not say that a candidate would want to know"],
      },
      null,
      2,
    ),
  ].join("\n");

  const raw = await llm.structured({
    label: "extract-requirements",
    system,
    user,
    schema: extractionSchema,
    temperature: 0.1,
    signal,
  });

  const grounded = keepGrounded(
    raw.requirements,
    jobDescription,
    (item) => item.evidence || item.text,
  );
  const mintId = createIdMinter("r");
  const requirements: Requirement[] = grounded.kept.map((item) => ({
    id: mintId(),
    text: item.text.trim(),
    kind: item.kind,
    priority: item.priority,
    ...(item.evidence ? { evidence: item.evidence.trim() } : {}),
  }));

  const notes = [...raw.notes];
  if (grounded.dropped.length > 0) {
    notes.push(
      `${grounded.dropped.length} extracted requirement(s) were dropped because their wording could not be traced back to the posting.`,
    );
  }
  if (thinPosting) {
    notes.push(
      `The posting is ${wordCount(jobDescription)} words. This kit is deliberately thin because the source material is thin.`,
    );
  }
  if (requirements.length === 0) {
    notes.push("No requirements could be extracted from this posting.");
  }

  return {
    companyName: raw.company_name.trim(),
    roleTitle: raw.role_title.trim(),
    seniority: raw.seniority.trim(),
    location: raw.location.trim(),
    responsibilities: raw.responsibilities.map((item) => item.trim()).filter(Boolean),
    requirements,
    notes,
    thinPosting,
    injectionFlags: posting.flags,
  };
}
