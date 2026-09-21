import { z } from "zod";
import type { LlmClient } from "../../llm/client.ts";
import { systemPrompt } from "../../prompts/base.ts";
import type { CrawledPage } from "../../retrieval/crawler.ts";
import type { SearchOutcome } from "../../retrieval/search.ts";
import { wrapUntrusted } from "../../util/untrusted.ts";

const hiringSchema = z.object({
  found: z.boolean(),
  summary: z.string().default(""),
  stages: z.array(z.object({ name: z.string(), what_happens: z.string().default("") })).default([]),
  signals: z.array(z.string()).default([]),
  used_sources: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low", "none"]).default("none"),
});

export interface HiringProcessResult {
  found: boolean;
  summary: string;
  stages: { name: string; what_happens: string }[];
  signals: string[];
  sources: string[];
  confidence: "high" | "medium" | "low" | "none";
  notes: string[];
  injectionFlags: string[];
}

export async function researchHiringProcess(
  llm: LlmClient,
  input: {
    companyName: string;
    roleTitle: string;
    sitePages: CrawledPage[];
    discussion: SearchOutcome;
    signal?: AbortSignal;
  },
): Promise<HiringProcessResult> {
  const hiringPages = input.sitePages
    .filter((page) => page.intent === "hiring" || page.looksLikeHiringProcess)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const discussionText = [
    ...input.discussion.hits.map((hit) => `${hit.title}\n${hit.url}\n${hit.snippet}`),
    ...input.discussion.fetchedPages.map((page) => `${page.url}\n${page.text.slice(0, 3000)}`),
  ].join("\n\n");

  if (hiringPages.length === 0 && discussionText.trim().length === 0) {
    return {
      found: false,
      summary: "",
      stages: [],
      signals: [],
      sources: [],
      confidence: "none",
      notes: [
        "No hiring or interview-process page was found on the company site, and no public discussion of their process turned up. The kit is built from the job description and company brief alone.",
      ],
      injectionFlags: [],
    };
  }

  const blocks = [
    ...hiringPages.map((page) =>
      wrapUntrusted(`company hiring page ${page.url}`, `${page.title}\n${page.text}`, 7000),
    ),
    ...(discussionText.trim()
      ? [wrapUntrusted("public discussion found via web search", discussionText, 8000)]
      : []),
  ];

  const system = systemPrompt(
    "You reconstruct how a company runs its interview process, using only the material supplied.",
    [
      "Company-published pages outrank anonymous discussion. Where they disagree, follow the company page and say the discussion differs.",
      "Public discussion is anecdotal and may be out of date. Reflect that in confidence, and never present an anecdote as policy.",
      'Set found to false and confidence to "none" when the material does not actually describe a hiring process.',
      "signals are concrete things a candidate should prepare for, such as a take-home, a system design round, or a values interview.",
      "Do not pad the answer. Two well-supported stages beat six invented ones.",
    ],
  );

  const user = [
    `Company: ${input.companyName || "unknown"}`,
    `Role being prepared for: ${input.roleTitle || "unknown"}`,
    "",
    ...blocks.map((block) => block.text),
    "",
    "Return JSON shaped exactly like:",
    JSON.stringify(
      {
        found: true,
        summary: "two or three sentences",
        stages: [{ name: "string", what_happens: "string" }],
        signals: ["short phrases naming what to prepare for"],
        used_sources: ["URLs you relied on"],
        confidence: "high | medium | low | none",
      },
      null,
      2,
    ),
  ].join("\n");

  const result = await llm.structured({
    label: "hiring-process",
    system,
    user,
    schema: hiringSchema,
    temperature: 0.2,
    signal: input.signal,
  });

  const knownUrls = new Set([
    ...hiringPages.map((page) => page.url),
    ...input.discussion.hits.map((hit) => hit.url),
    ...input.discussion.fetchedPages.map((page) => page.url),
  ]);

  const notes: string[] = [];
  if (!result.found) {
    notes.push(
      "The pages we could reach did not describe an interview process, so none is claimed here.",
    );
  }
  if (hiringPages.length === 0 && result.found) {
    notes.push(
      "The hiring process below comes from public discussion only, not from the company's own site.",
    );
  }

  return {
    found: result.found,
    summary: result.summary.trim(),
    stages: result.stages,
    signals: result.signals,
    sources: result.used_sources.filter((url) => knownUrls.has(url)),
    confidence: result.confidence,
    notes,
    injectionFlags: blocks.flatMap((block) => block.flags),
  };
}
