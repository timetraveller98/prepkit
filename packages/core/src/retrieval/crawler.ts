import pLimit from "p-limit";
import { sleep } from "../util/retry.ts";
import { truncate } from "../util/text.ts";
import { type FetchedDocument, type Fetcher, failureReason } from "./fetcher.ts";
import { extractSitemapUrls, isSameSite, type PageLink, parsePage } from "./html.ts";
import {
  canonicalKey,
  classifyPageContent,
  type PageIntent,
  rankLinks,
  scoreLink,
} from "./link-score.ts";
import type { RobotsRegistry } from "./robots.ts";
import { normalizeUrl } from "./url-guard.ts";

const MAX_TEXT_PER_PAGE = 12_000;

export class CompanySiteUnreachableError extends Error {
  readonly attempts: { url: string; reason: string }[];
  constructor(message: string, attempts: { url: string; reason: string }[]) {
    super(message);
    this.name = "CompanySiteUnreachableError";
    this.attempts = attempts;
  }
}

export interface CrawledPage {
  url: string;
  title: string;
  description: string;
  text: string;
  intent: PageIntent;
  score: number;
  depth: number;
  hiringSignals: string[];
  looksLikeHiringProcess: boolean;
}

export interface CrawlFailure {
  url: string;
  reason: string;
}

export interface CrawlResult {
  origin: string;
  siteHost: string;
  homepage: CrawledPage;
  pages: CrawledPage[];
  failures: CrawlFailure[];
  robotsBlocked: string[];
  sitemapCandidates: number;
  budgetExhausted: boolean;
}

export type CrawlEvent =
  | { type: "fetched"; url: string; intent: PageIntent }
  | { type: "failed"; url: string; reason: string }
  | { type: "blocked"; url: string };

export interface CrawlOptions {
  startUrl: string;
  fetcher: Fetcher;
  robots: RobotsRegistry;
  maxPages?: number;
  concurrency?: number;
  timeBudgetMs?: number;
  signal?: AbortSignal;
  onEvent?: (event: CrawlEvent) => void;
}

export async function crawlCompanySite(options: CrawlOptions): Promise<CrawlResult> {
  const maxPages = options.maxPages ?? 12;
  const concurrency = options.concurrency ?? 3;
  const deadline = Date.now() + (options.timeBudgetMs ?? 60_000);

  const failures: CrawlFailure[] = [];
  const robotsBlocked: string[] = [];
  const visited = new Set<string>();

  const homepageDocument = await resolveHomepage(options, failures);
  const siteHost = new URL(homepageDocument.finalUrl).hostname;
  const origin = new URL(homepageDocument.finalUrl).origin;

  const homepage = toCrawledPage(homepageDocument, siteHost, 0);
  visited.add(canonicalKey(homepage.url) ?? homepage.url);

  const pages: CrawledPage[] = [homepage];
  const limit = pLimit(concurrency);
  let lastRequestAt = 0;

  const fetchPage = async (link: PageLink, depth: number): Promise<CrawledPage | null> => {
    const key = canonicalKey(link.url);
    if (!key || visited.has(key)) return null;
    visited.add(key);

    let url: URL;
    try {
      url = normalizeUrl(link.url);
    } catch (error) {
      failures.push({ url: link.url, reason: failureReason(error) });
      return null;
    }

    const decision = await options.robots
      .check(url, options.signal)
      .catch(() => ({ allowed: true, crawlDelayMs: 0 }));
    if (!decision.allowed) {
      robotsBlocked.push(url.href);
      options.onEvent?.({ type: "blocked", url: url.href });
      return null;
    }

    const gap = Math.max(decision.crawlDelayMs, 200) - (Date.now() - lastRequestAt);
    if (gap > 0) await sleep(gap, options.signal);
    lastRequestAt = Date.now();

    try {
      const document = await options.fetcher.fetchDocument(url, options.signal);
      const page = toCrawledPage(document, siteHost, depth);
      options.onEvent?.({ type: "fetched", url: page.url, intent: page.intent });
      return page;
    } catch (error) {
      const reason = failureReason(error);
      failures.push({ url: url.href, reason });
      options.onEvent?.({ type: "failed", url: url.href, reason });
      return null;
    }
  };

  const sitemapLinks = await collectSitemapLinks(options, origin, siteHost, failures);
  const frontier = rankLinks([...cachedLinks(homepage), ...sitemapLinks], {
    depth: 1,
    limit: Math.max(4, maxPages),
    exclude: visited,
  });

  const firstWave = frontier.slice(0, Math.min(frontier.length, maxPages - pages.length));
  const firstResults = await Promise.all(
    firstWave.map((link) =>
      limit(() => (Date.now() < deadline ? fetchPage(link, 1) : Promise.resolve(null))),
    ),
  );
  for (const page of firstResults) if (page) pages.push(page);

  const hubs = pages.filter(
    (page) => page.depth === 1 && (page.intent === "hiring" || page.looksLikeHiringProcess),
  );

  if (hubs.length > 0 && pages.length < maxPages && Date.now() < deadline) {
    const secondWave = rankLinks(
      hubs.flatMap((page) => cachedLinks(page)),
      { depth: 2, limit: maxPages - pages.length, exclude: visited, minScore: 6 },
    );
    const secondResults = await Promise.all(
      secondWave.map((link) =>
        limit(() => (Date.now() < deadline ? fetchPage(link, 2) : Promise.resolve(null))),
      ),
    );
    for (const page of secondResults) if (page) pages.push(page);
  }

  return {
    origin,
    siteHost,
    homepage,
    pages,
    failures,
    robotsBlocked,
    sitemapCandidates: sitemapLinks.length,
    budgetExhausted: Date.now() >= deadline,
  };
}

const linkCache = new WeakMap<CrawledPage, PageLink[]>();

function cachedLinks(page: CrawledPage): PageLink[] {
  return linkCache.get(page) ?? [];
}

function toCrawledPage(document: FetchedDocument, siteHost: string, depth: number): CrawledPage {
  const parsed = parsePage(document.body, document.finalUrl, siteHost);
  const classification = classifyPageContent(parsed.text);
  const linkScore = scoreLink({ url: document.finalUrl, text: parsed.title }, depth);

  const page: CrawledPage = {
    url: document.finalUrl,
    title: parsed.title,
    description: parsed.description,
    text: truncate(parsed.text, MAX_TEXT_PER_PAGE),
    intent: classification.looksLikeHiringProcess ? "hiring" : linkScore.intent,
    score: linkScore.score + classification.hiringSignalCount * 4,
    depth,
    hiringSignals: classification.matchedSignals,
    looksLikeHiringProcess: classification.looksLikeHiringProcess,
  };

  linkCache.set(
    page,
    parsed.links.filter((link) => link.sameSite),
  );
  return page;
}

async function resolveHomepage(
  options: CrawlOptions,
  failures: CrawlFailure[],
): Promise<FetchedDocument> {
  const attempts: { url: string; reason: string }[] = [];

  for (const candidate of homepageCandidates(options.startUrl)) {
    if (options.signal?.aborted) break;
    try {
      const url = normalizeUrl(candidate);
      const decision = await options.robots
        .check(url, options.signal)
        .catch(() => ({ allowed: true, crawlDelayMs: 0 }));
      if (!decision.allowed) {
        attempts.push({ url: candidate, reason: "ROBOTS_DISALLOWED: robots.txt blocks this path" });
        continue;
      }
      return await options.fetcher.fetchDocument(url, options.signal);
    } catch (error) {
      const reason = failureReason(error);
      attempts.push({ url: candidate, reason });
      options.onEvent?.({ type: "failed", url: candidate, reason });
    }
  }

  failures.push(...attempts);
  throw new CompanySiteUnreachableError(
    `company site could not be retrieved after ${attempts.length} attempts`,
    attempts,
  );
}

export function homepageCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const push = (value: string) => {
    if (!candidates.includes(value)) candidates.push(value);
  };

  let parsed: URL;
  try {
    parsed = normalizeUrl(raw);
  } catch {
    return [raw];
  }

  push(parsed.href);

  const swapped = new URL(parsed.href);
  swapped.hostname = parsed.hostname.startsWith("www.")
    ? parsed.hostname.slice(4)
    : `www.${parsed.hostname}`;
  push(swapped.href);

  if (parsed.protocol === "https:") {
    const insecure = new URL(parsed.href);
    insecure.protocol = "http:";
    push(insecure.href);
  }

  if (parsed.pathname !== "/") {
    const root = new URL(parsed.origin);
    push(root.href);
  }

  return candidates;
}

async function collectSitemapLinks(
  options: CrawlOptions,
  origin: string,
  siteHost: string,
  failures: CrawlFailure[],
): Promise<PageLink[]> {
  const declared = await options.robots.sitemaps(origin, options.signal).catch(() => []);
  const sources = [...declared, new URL("/sitemap.xml", origin).href].slice(0, 2);
  const links: PageLink[] = [];

  for (const source of sources) {
    try {
      const document = await options.fetcher.fetchDocument(source, options.signal);
      const urls = extractSitemapUrls(document.body).slice(0, 300);
      for (const url of urls) {
        try {
          const parsed = new URL(url);
          if (!isSameSite(parsed.hostname, siteHost)) continue;
          links.push({ url: parsed.href, text: "", sameSite: true });
        } catch {}
      }
      if (links.length > 0) break;
    } catch (error) {
      failures.push({ url: source, reason: failureReason(error) });
    }
  }

  return links;
}
