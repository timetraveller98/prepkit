import robotsParser, { type Robot } from "robots-parser";
import type { Fetcher } from "./fetcher.ts";

export interface RobotsDecision {
  allowed: boolean;
  crawlDelayMs: number;
}

export class RobotsRegistry {
  private readonly cache = new Map<string, Robot | null>();
  private readonly fetcher: Fetcher;

  constructor(fetcher: Fetcher) {
    this.fetcher = fetcher;
  }

  async check(url: URL, signal?: AbortSignal): Promise<RobotsDecision> {
    const robot = await this.load(url.origin, signal);
    if (!robot) return { allowed: true, crawlDelayMs: 0 };

    const allowed = robot.isAllowed(url.href, this.fetcher.userAgent);
    const crawlDelay = robot.getCrawlDelay(this.fetcher.userAgent) ?? 0;
    return {
      allowed: allowed !== false,
      crawlDelayMs: Math.min(5_000, Math.round(crawlDelay * 1000)),
    };
  }

  async sitemaps(origin: string, signal?: AbortSignal): Promise<string[]> {
    const robot = await this.load(origin, signal);
    return robot?.getSitemaps() ?? [];
  }

  private async load(origin: string, signal?: AbortSignal): Promise<Robot | null> {
    const cached = this.cache.get(origin);
    if (cached !== undefined) return cached;

    let robot: Robot | null = null;
    try {
      const robotsUrl = new URL("/robots.txt", origin);
      const document = await this.fetcher.fetchDocument(robotsUrl, signal);
      robot = robotsParser(robotsUrl.href, document.body);
    } catch {
      robot = null;
    }
    this.cache.set(origin, robot);
    return robot;
  }
}
