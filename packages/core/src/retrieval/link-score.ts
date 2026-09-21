import type { PageLink } from "./html.ts";

export type PageIntent = "hiring" | "about" | "engineering" | "other";

export interface LinkScore {
  score: number;
  intent: PageIntent;
  reasons: string[];
}

interface Signal {
  pattern: RegExp;
  weight: number;
  intent: PageIntent | null;
  reason: string;
}

const SIGNALS: Signal[] = [
  {
    pattern:
      /how-we-hire|hiring-process|interview-process|our-hiring|recruiting-process|interview-guide|candidate-guide|hiring-faq|what-to-expect/,
    weight: 16,
    intent: "hiring",
    reason: "explicit hiring-process path",
  },
  {
    pattern: /\b(interview|interviewing|interviews)\b/,
    weight: 8,
    intent: "hiring",
    reason: "interview wording",
  },
  {
    pattern:
      /\b(careers?|jobs?|open-roles?|open-positions?|vacancies|join-us|join-the-team|work-with-us|were-hiring|we-are-hiring)\b/,
    weight: 9,
    intent: "hiring",
    reason: "careers entry point",
  },
  { pattern: /\b(handbook|playbook)\b/, weight: 8, intent: "hiring", reason: "public handbook" },
  {
    pattern: /\b(hiring|recruit|recruiting|recruitment|candidate|candidates|applicants?)\b/,
    weight: 7,
    intent: "hiring",
    reason: "hiring vocabulary",
  },
  {
    pattern:
      /\b(life-at|working-at|life-here|work-here|culture|values|people|benefits|onboarding)\b/,
    weight: 5,
    intent: "hiring",
    reason: "culture or onboarding page",
  },
  {
    pattern: /\b(about|about-us|company|our-story|mission|who-we-are|what-we-do|overview)\b/,
    weight: 8,
    intent: "about",
    reason: "about page",
  },
  {
    pattern: /\b(products?|platform|solutions?|services?|features?|how-it-works|use-cases?)\b/,
    weight: 4,
    intent: "about",
    reason: "product page",
  },
  {
    pattern: /\b(customers?|case-stud(y|ies)|why-us)\b/,
    weight: 2,
    intent: "about",
    reason: "positioning page",
  },
  {
    pattern: /\b(engineering|developers?|docs|documentation|tech-blog)\b/,
    weight: 4,
    intent: "engineering",
    reason: "engineering surface",
  },
  { pattern: /\b(blog|posts?|articles?)\b/, weight: 1, intent: "engineering", reason: "blog" },
  {
    pattern:
      /\b(login|log-in|signin|sign-in|signup|sign-up|register|account|dashboard|admin|portal)\b/,
    weight: -14,
    intent: null,
    reason: "authenticated surface",
  },
  {
    pattern:
      /\b(privacy|terms|legal|cookies?|gdpr|dpa|imprint|impressum|trust|compliance|sitemap)\b/,
    weight: -12,
    intent: null,
    reason: "legal or boilerplate",
  },
  {
    pattern: /\b(pricing|checkout|cart|billing|subscribe|newsletter|shop|store)\b/,
    weight: -7,
    intent: null,
    reason: "commerce",
  },
  {
    pattern: /\b(press|newsroom|investors?|media-kit)\b/,
    weight: -3,
    intent: null,
    reason: "press",
  },
  {
    pattern: /-20\d{2}-\d{2}-|\/20\d{2}\/\d{2}\//,
    weight: -6,
    intent: null,
    reason: "dated permalink",
  },
  {
    pattern: /\/(de|fr|es|ja|zh|pt|it|ko|ru|nl|pl|tr)(\/|$)/,
    weight: -9,
    intent: null,
    reason: "localised duplicate",
  },
  {
    pattern: /\.(pdf|zip|jpe?g|png|svg|gif|webp|mp4|mp3|css|js|xml|rss)(\?|$)/,
    weight: -40,
    intent: null,
    reason: "non-html asset",
  },
];

const ANCHOR_WEIGHT = 0.8;
const DEPTH_PENALTY = 1.6;
const HOMEPAGE_BONUS = 6;

export function scoreLink(link: Pick<PageLink, "url" | "text">, depth = 0): LinkScore {
  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return { score: Number.NEGATIVE_INFINITY, intent: "other", reasons: ["unparseable url"] };
  }

  const path = normalizeHaystack(`${url.pathname}${url.search}`);
  const anchor = normalizeHaystack(link.text);
  const byIntent: Record<PageIntent, number> = { hiring: 0, about: 0, engineering: 0, other: 0 };
  const reasons: string[] = [];
  let score = 0;

  for (const signal of SIGNALS) {
    const inPath = signal.pattern.test(path);
    const inAnchor = signal.pattern.test(anchor);
    if (!inPath && !inAnchor) continue;

    const applied = (inPath ? signal.weight : 0) + (inAnchor ? signal.weight * ANCHOR_WEIGHT : 0);
    score += applied;
    if (signal.intent && applied > 0) byIntent[signal.intent] += applied;
    reasons.push(signal.reason);
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    score += HOMEPAGE_BONUS;
    byIntent.about += HOMEPAGE_BONUS;
    reasons.push("site root");
  }
  score -= Math.max(0, segments.length - 2) * DEPTH_PENALTY;
  score -= depth * 2;
  if (url.search) score -= 2;

  const intent =
    (Object.entries(byIntent) as [PageIntent, number][])
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";

  return { score: Math.round(score * 100) / 100, intent, reasons: [...new Set(reasons)] };
}

export interface RankedLink extends PageLink, LinkScore {
  depth: number;
}

export function rankLinks(
  links: PageLink[],
  options: { depth: number; minScore?: number; limit?: number; exclude?: Set<string> },
): RankedLink[] {
  const minScore = options.minScore ?? 3;
  const exclude = options.exclude ?? new Set<string>();
  const byKey = new Map<string, RankedLink>();

  for (const link of links) {
    if (!link.sameSite) continue;
    const key = canonicalKey(link.url);
    if (!key || exclude.has(key)) continue;

    const scored = scoreLink(link, options.depth);
    if (scored.score < minScore) continue;

    const existing = byKey.get(key);
    if (!existing || scored.score > existing.score) {
      byKey.set(key, { ...link, ...scored, depth: options.depth });
    }
  }

  const ranked = [...byKey.values()].sort(
    (a, b) => b.score - a.score || a.url.length - b.url.length,
  );
  return options.limit ? ranked.slice(0, options.limit) : ranked;
}

export function canonicalKey(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

function normalizeHaystack(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/[\s_/.?=&+]+/g, "-")
    .replace(/-+/g, "-")} `;
}

const HIRING_CONTENT_SIGNALS: RegExp[] = [
  /hiring process/i,
  /interview process/i,
  /how we (hire|interview)/i,
  /take[- ]home/i,
  /technical screen/i,
  /coding (challenge|exercise|interview)/i,
  /system design (interview|round)/i,
  /pair(ing)? (programming|session)/i,
  /recruiter (screen|call|conversation)/i,
  /(onsite|on-site|final) (interview|round|loop)/i,
  /interview (loop|rounds?|stages?|panel)/i,
  /values interview/i,
  /offer stage/i,
  /what to expect (in|from|during) (the|your) (interview|process)/i,
];

export interface ContentClassification {
  hiringSignalCount: number;
  matchedSignals: string[];
  looksLikeHiringProcess: boolean;
}

export function classifyPageContent(text: string): ContentClassification {
  const matched: string[] = [];
  for (const signal of HIRING_CONTENT_SIGNALS) {
    const match = signal.exec(text);
    if (match?.[0]) matched.push(match[0].toLowerCase());
  }
  const unique = [...new Set(matched)];
  return {
    hiringSignalCount: unique.length,
    matchedSignals: unique,
    looksLikeHiringProcess: unique.length >= 2,
  };
}
