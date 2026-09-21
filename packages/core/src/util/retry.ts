export class RetryableError extends Error {
  readonly retryAfterMs: number | undefined;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableError";
    this.retryAfterMs = retryAfterMs;
  }
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 800;
  const maxDelayMs = options.maxDelayMs ?? 20_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!(error instanceof RetryableError) || attempt === attempts) throw error;

      const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jittered = Math.round(exponential * (0.5 + Math.random() * 0.5));
      const delayMs = Math.max(error.retryAfterMs ?? 0, jittered);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs, options.signal);
    }
  }
  throw lastError;
}

export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header);
  if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}
