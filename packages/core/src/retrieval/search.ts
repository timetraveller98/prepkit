import * as cheerio from "cheerio";
import { collapseWhitespace } from "../util/text.ts";
import { type Fetcher, failureReason } from "./fetcher.ts";
import { parsePage } from "./html.ts";
import type { RobotsRegistry } from "./robots.ts";
import { normalizeUrl } from "./url-guard.ts";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOutcome {
  provider: string;
  hits: SearchHit[];
  fetchedPages: { url: string; text: string }[];
  failures: { url: string; reason: string }[];
  attemptedQueries: string[];
}

export type SearchEnv = import("../env.ts").EnvSource;

export interface PublicDiscussionOptions {
  company: string;
  roleTitle: string;
  fetcher: Fetcher;
  robots: RobotsRegistry;
  env?: SearchEnv;
  maxHits?: number;
  maxPagesToRead?: number;
  signal?: AbortSignal;
}

export async function searchPublicDiscussion(
  options: PublicDiscussionOptions,
): Promise<SearchOutcome> {
  const env = options.env ?? (process.env as SearchEnv);
  const maxHits = options.maxHits ?? 8;
  const queries = buildQueries(options.company, options.roleTitle);
  const failures: { url: string; reason: string }[] = [];

  const { provider, hits } = await runSearch(queries, options, env, maxHits, failures);
  const fetchedPages = await readAllowedPages(hits, options, failures);

  return { provider, hits, fetchedPages, failures, attemptedQueries: queries };
}

function buildQueries(company: string, roleTitle: string): string[] {
  const name = company.trim();
  if (!name) return [];
  return [
    `"${name}" interview process experience`,
    `${name} ${roleTitle} interview questions`.trim(),
  ];
}

async function runSearch(
  queries: string[],
  options: PublicDiscussionOptions,
  env: SearchEnv,
  maxHits: number,
  failures: { url: string; reason: string }[],
): Promise<{ provider: string; hits: SearchHit[] }> {
  if (queries.length === 0) return { provider: "none", hits: [] };

  const preferred = (env.SEARCH_PROVIDER ?? "").toLowerCase();
  if (preferred === "none" || preferred === "off") return { provider: "disabled", hits: [] };

  const chain: { name: string; run: (query: string) => Promise<SearchHit[]> }[] = [];

  if (env.BRAVE_API_KEY && preferred !== "duckduckgo") {
    chain.push({
      name: "brave",
      run: (query) => braveSearch(query, env.BRAVE_API_KEY ?? "", options),
    });
  }
  if (env.TAVILY_API_KEY && preferred !== "duckduckgo") {
    chain.push({
      name: "tavily",
      run: (query) => tavilySearch(query, env.TAVILY_API_KEY ?? "", options),
    });
  }
  chain.push({ name: "duckduckgo", run: (query) => duckDuckGoSearch(query, options) });

  for (const provider of chain) {
    const collected = new Map<string, SearchHit>();
    let providerFailed = false;

    for (const query of queries) {
      try {
        const hits = await provider.run(query);
        for (const hit of hits) {
          if (!collected.has(hit.url)) collected.set(hit.url, hit);
        }
      } catch (error) {
        providerFailed = true;
        failures.push({ url: `${provider.name}:${query}`, reason: failureReason(error) });
      }
      if (collected.size >= maxHits) break;
    }

    if (collected.size > 0) {
      return { provider: provider.name, hits: [...collected.values()].slice(0, maxHits) };
    }
    if (!providerFailed) {
      failures.push({ url: `${provider.name}`, reason: "NO_RESULTS: provider returned nothing" });
    }
  }

  return { provider: "none", hits: [] };
}

async function braveSearch(
  query: string,
  apiKey: string,
  options: PublicDiscussionOptions,
): Promise<SearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");

  const response = await fetch(url, {
    headers: { accept: "application/json", "x-subscription-token": apiKey },
    signal: options.signal ?? AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`brave responded ${response.status}`);

  const payload = (await response.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (payload.web?.results ?? [])
    .filter((result): result is { title: string; url: string; description?: string } =>
      Boolean(result.url),
    )
    .map((result) => ({
      title: collapseWhitespace(result.title ?? ""),
      url: result.url,
      snippet: collapseWhitespace(stripTags(result.description ?? "")),
    }));
}

async function tavilySearch(
  query: string,
  apiKey: string,
  options: PublicDiscussionOptions,
): Promise<SearchHit[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: 8, search_depth: "basic" }),
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`tavily responded ${response.status}`);

  const payload = (await response.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (payload.results ?? [])
    .filter((result): result is { title: string; url: string; content?: string } =>
      Boolean(result.url),
    )
    .map((result) => ({
      title: collapseWhitespace(result.title ?? ""),
      url: result.url,
      snippet: collapseWhitespace(result.content ?? "").slice(0, 400),
    }));
}

async function duckDuckGoSearch(
  query: string,
  options: PublicDiscussionOptions,
): Promise<SearchHit[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const document = await options.fetcher.fetchDocument(url, options.signal);
  const $ = cheerio.load(document.body);
  const hits: SearchHit[] = [];

  $(".result__body, .web-result").each((_, element) => {
    const anchor = $(element).find("a.result__a").first();
    const href = anchor.attr("href");
    if (!href) return;
    const resolved = decodeDuckDuckGoLink(href);
    if (!resolved) return;
    hits.push({
      title: collapseWhitespace(anchor.text()),
      url: resolved,
      snippet: collapseWhitespace($(element).find(".result__snippet").first().text()).slice(0, 400),
    });
  });

  return hits;
}

export function decodeDuckDuckGoLink(href: string): string | null {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    const candidate = target ?? url.href;
    const parsed = new URL(candidate);
    if (parsed.hostname.endsWith("duckduckgo.com")) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

async function readAllowedPages(
  hits: SearchHit[],
  options: PublicDiscussionOptions,
  failures: { url: string; reason: string }[],
): Promise<{ url: string; text: string }[]> {
  const budget = options.maxPagesToRead ?? 3;
  const pages: { url: string; text: string }[] = [];

  for (const hit of hits) {
    if (pages.length >= budget) break;
    try {
      const url = normalizeUrl(hit.url);
      const decision = await options.robots.check(url, options.signal);
      if (!decision.allowed) {
        failures.push({
          url: hit.url,
          reason: "ROBOTS_DISALLOWED: source does not permit automated access",
        });
        continue;
      }
      const document = await options.fetcher.fetchDocument(url, options.signal);
      const parsed = parsePage(document.body, document.finalUrl, url.hostname);
      if (parsed.text.length > 200)
        pages.push({ url: document.finalUrl, text: parsed.text.slice(0, 8000) });
    } catch (error) {
      failures.push({ url: hit.url, reason: failureReason(error) });
    }
  }

  return pages;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}
