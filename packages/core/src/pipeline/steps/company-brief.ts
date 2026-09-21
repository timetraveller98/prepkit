import { z } from "zod";
import type { CompanyBrief } from "../../kit.ts";
import type { LlmClient } from "../../llm/client.ts";
import { systemPrompt } from "../../prompts/base.ts";
import type { CrawledPage } from "../../retrieval/crawler.ts";
import { wrapUntrusted } from "../../util/untrusted.ts";

const briefSchema = z.object({
  summary: z.string().default(""),
  what_they_do: z.string().default(""),
  used_sources: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
});

export interface CompanyBriefResult {
  brief: CompanyBrief;
  notes: string[];
  injectionFlags: string[];
}

export async function writeCompanyBrief(
  llm: LlmClient,
  input: {
    companyName: string;
    companyUrl: string;
    pages: CrawledPage[];
    preserved?: { summary?: string; what_they_do?: string };
    signal?: AbortSignal;
  },
): Promise<CompanyBriefResult> {
  const usable = input.pages
    .filter((page) => page.text.length > 120)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (usable.length === 0) {
    return {
      brief: {
        summary: `Nothing could be retrieved from ${input.companyUrl}, so this brief is empty rather than guessed.`,
        what_they_do: "Unknown. No page on the company site could be read.",
        sources: [],
      },
      notes: ["Company brief is empty because no page on the company site could be retrieved."],
      injectionFlags: [],
    };
  }

  const blocks = usable.map((page) =>
    wrapUntrusted(
      `company page ${page.url}`,
      `${page.title}\n${page.description}\n${page.text}`,
      6000,
    ),
  );

  const system = systemPrompt(
    "You write a short, factual brief about a company using only pages fetched from that company's own website.",
    [
      "Write for a candidate who has an interview soon: what the company sells, who to, and how it positions itself.",
      "Marketing copy is evidence of positioning, not of fact. Report claims as claims.",
      "If the pages do not answer something, list it under unknowns instead of filling the gap.",
      "Keep summary under 90 words and what_they_do under 60 words.",
    ],
  );

  const user = [
    `Company name as far as we know it: ${input.companyName || "unknown"}`,
    `Company website: ${input.companyUrl}`,
    "",
    ...blocks.map((block) => block.text),
    "",
    input.preserved?.summary
      ? `The user has already edited this brief. Keep the following meaning intact and build around it:\n${input.preserved.summary}`
      : "",
    "",
    "Return JSON shaped exactly like:",
    JSON.stringify(
      {
        summary: "string",
        what_they_do: "string",
        used_sources: ["the page URLs you actually relied on"],
        unknowns: ["things the fetched pages did not answer"],
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const result = await llm.structured({
    label: "company-brief",
    system,
    user,
    schema: briefSchema,
    temperature: 0.3,
    signal: input.signal,
  });

  const fetchedUrls = new Set(usable.map((page) => page.url));
  const sources = result.used_sources.filter((url) => fetchedUrls.has(url));

  return {
    brief: {
      summary: result.summary.trim(),
      what_they_do: result.what_they_do.trim(),
      sources: sources.length > 0 ? sources : usable.map((page) => page.url),
    },
    notes: result.unknowns.map((unknown) => `Company brief gap: ${unknown}`),
    injectionFlags: blocks.flatMap((block) => block.flags),
  };
}
