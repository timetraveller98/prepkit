import { sleep } from "./retry.ts";

interface Reservation {
  at: number;
  tokens: number;
}

export interface RateLimiterOptions {
  requestsPerMinute: number;
  tokensPerMinute: number;
  maxConcurrent: number;
  minGapMs?: number;
}

export class RateLimiter {
  private readonly options: RateLimiterOptions;
  private readonly history: Reservation[] = [];
  private active = 0;
  private queue: (() => void)[] = [];
  private lastStartedAt = 0;

  constructor(options: RateLimiterOptions) {
    this.options = options;
  }

  async run<T>(estimatedTokens: number, task: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      await this.waitForBudget(estimatedTokens);
      this.history.push({ at: Date.now(), tokens: estimatedTokens });
      this.lastStartedAt = Date.now();
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  recordUsage(tokens: number): void {
    this.history.push({ at: Date.now(), tokens });
  }

  private async acquireSlot(): Promise<void> {
    if (this.active < this.options.maxConcurrent) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active += 1;
  }

  private releaseSlot(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }

  private prune(): void {
    const cutoff = Date.now() - 60_000;
    while (this.history.length > 0 && (this.history[0]?.at ?? 0) < cutoff) this.history.shift();
  }

  private async waitForBudget(estimatedTokens: number): Promise<void> {
    const minGapMs = this.options.minGapMs ?? 0;
    for (;;) {
      this.prune();
      const usedTokens = this.history.reduce((sum, entry) => sum + entry.tokens, 0);
      const usedRequests = this.history.length;
      const gapWait = Math.max(0, this.lastStartedAt + minGapMs - Date.now());

      const overRequests = usedRequests >= this.options.requestsPerMinute;
      const overTokens = usedTokens + estimatedTokens > this.options.tokensPerMinute;

      if (!overRequests && !overTokens && gapWait === 0) return;

      const oldest = this.history[0]?.at ?? Date.now();
      const windowWait = overRequests || overTokens ? oldest + 60_000 - Date.now() + 50 : 0;
      await sleep(Math.max(gapWait, windowWait, 50));
    }
  }
}
