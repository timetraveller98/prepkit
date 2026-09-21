import { parseRetryAfter, RetryableError, withRetry } from "../util/retry.ts";
import {
  assertFetchable,
  normalizeUrl,
  type UrlGuardOptions,
  UrlNotAllowedError,
} from "./url-guard.ts";

export type FetchFailureCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "BLOCKED_ADDRESS"
  | "DNS_FAILURE"
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP_ERROR"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "TOO_LARGE"
  | "TOO_MANY_REDIRECTS"
  | "ROBOTS_DISALLOWED";

export class FetchFailure extends Error {
  readonly code: FetchFailureCode;
  readonly url: string;
  readonly status: number | undefined;
  constructor(code: FetchFailureCode, url: string, message: string, status?: number) {
    super(message);
    this.name = "FetchFailure";
    this.code = code;
    this.url = url;
    this.status = status;
  }
}

export interface FetchedDocument {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  bytes: number;
  truncated: boolean;
}

export interface FetcherOptions extends UrlGuardOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  attempts?: number;
  acceptedContentTypes?: string[];
}

const DEFAULT_ACCEPTED = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "application/xml",
  "text/xml",
];

export class Fetcher {
  private readonly options: Required<Omit<FetcherOptions, "allowPrivateAddresses">> &
    UrlGuardOptions;

  constructor(options: FetcherOptions) {
    this.options = {
      allowPrivateAddresses: options.allowPrivateAddresses,
      userAgent:
        options.userAgent ??
        "PrepKitBot/1.0 (+interview prep kit research; contact via repository)",
      timeoutMs: options.timeoutMs ?? 12_000,
      maxBytes: options.maxBytes ?? 2_000_000,
      maxRedirects: options.maxRedirects ?? 5,
      attempts: options.attempts ?? 3,
      acceptedContentTypes: options.acceptedContentTypes ?? DEFAULT_ACCEPTED,
    };
  }

  get userAgent(): string {
    return this.options.userAgent;
  }

  async fetchDocument(rawUrl: string | URL, signal?: AbortSignal): Promise<FetchedDocument> {
    const requested = rawUrl instanceof URL ? rawUrl : normalizeUrl(String(rawUrl));

    return withRetry(() => this.fetchOnce(requested, signal), {
      attempts: this.options.attempts,
      baseDelayMs: 600,
      maxDelayMs: 8_000,
      signal,
    });
  }

  private async fetchOnce(requested: URL, signal?: AbortSignal): Promise<FetchedDocument> {
    let current = requested;
    let redirects = 0;

    for (;;) {
      const target = await this.guard(current);
      const response = await this.send(target, signal);

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        response.body?.cancel().catch(() => undefined);
        if (!location) {
          throw new FetchFailure(
            "HTTP_ERROR",
            target.href,
            `redirect without location`,
            response.status,
          );
        }
        if (redirects >= this.options.maxRedirects) {
          throw new FetchFailure("TOO_MANY_REDIRECTS", target.href, "too many redirects");
        }
        redirects += 1;
        current = new URL(location, target);
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        response.body?.cancel().catch(() => undefined);
        throw new RetryableError(
          `${target.href} responded ${response.status}`,
          parseRetryAfter(response.headers.get("retry-after")),
        );
      }

      if (!response.ok) {
        response.body?.cancel().catch(() => undefined);
        throw new FetchFailure(
          "HTTP_ERROR",
          target.href,
          `responded ${response.status}`,
          response.status,
        );
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      const mime = contentType.split(";")[0]?.trim() ?? "";
      if (mime && !this.options.acceptedContentTypes.includes(mime)) {
        response.body?.cancel().catch(() => undefined);
        throw new FetchFailure(
          "UNSUPPORTED_CONTENT_TYPE",
          target.href,
          `content-type ${mime} is not processed`,
        );
      }

      const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
      if (Number.isFinite(declaredLength) && declaredLength > this.options.maxBytes) {
        response.body?.cancel().catch(() => undefined);
        throw new FetchFailure("TOO_LARGE", target.href, `declared ${declaredLength} bytes`);
      }

      const { text, bytes, truncated } = await this.readCapped(response, target);

      return {
        requestedUrl: requested.href,
        finalUrl: response.url || target.href,
        status: response.status,
        contentType: mime,
        body: text,
        bytes,
        truncated,
      };
    }
  }

  private async guard(url: URL): Promise<URL> {
    try {
      return await assertFetchable(url, {
        allowPrivateAddresses: this.options.allowPrivateAddresses,
      });
    } catch (error) {
      if (error instanceof UrlNotAllowedError) {
        throw new FetchFailure(error.code, url.href, error.message);
      }
      throw error;
    }
  }

  private async send(target: URL, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      return await fetch(target, {
        method: "GET",
        redirect: "manual",
        signal: composed,
        headers: {
          "user-agent": this.options.userAgent,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "accept-language": "en",
        },
      });
    } catch (error) {
      if (timeout.aborted) {
        throw new RetryableError(`${target.href} timed out after ${this.options.timeoutMs}ms`);
      }
      if (signal?.aborted) throw signal.reason;
      throw new RetryableError(`${target.href} failed: ${describe(error)}`);
    }
  }

  private async readCapped(
    response: Response,
    target: URL,
  ): Promise<{ text: string; bytes: number; truncated: boolean }> {
    const reader = response.body?.getReader();
    if (!reader) return { text: "", bytes: 0, truncated: false };

    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let truncated = false;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        bytes += value.byteLength;
        if (bytes > this.options.maxBytes) {
          truncated = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }
    } catch (error) {
      throw new FetchFailure("NETWORK", target.href, `stream failed: ${describe(error)}`);
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    return { text: buffer.toString("utf8"), bytes, truncated };
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function failureReason(error: unknown): string {
  if (error instanceof FetchFailure) return `${error.code}: ${error.message}`;
  if (error instanceof RetryableError) return `RETRY_EXHAUSTED: ${error.message}`;
  return `UNKNOWN: ${describe(error)}`;
}
