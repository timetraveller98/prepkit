import type { ZodTypeAny, z } from "zod";
import { RateLimiter } from "../util/rate-limit.ts";
import { RetryableError, withRetry } from "../util/retry.ts";
import { extractJson, JsonRecoveryError } from "./json.ts";
import type { CompletionRequest, LlmProvider } from "./provider.ts";

export class LlmStructureError extends Error {
  readonly label: string;
  readonly raw: string;
  constructor(label: string, message: string, raw: string) {
    super(message);
    this.name = "LlmStructureError";
    this.label = label;
    this.raw = raw;
  }
}

export interface LlmTelemetry {
  label: string;
  attempt: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  repaired: boolean;
}

export interface LlmClientOptions {
  provider: LlmProvider;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  maxConcurrent?: number;
  attempts?: number;
  onTelemetry?: (telemetry: LlmTelemetry) => void;
  onRetry?: (info: { label: string; attempt: number; delayMs: number; reason: string }) => void;
}

export interface StructuredCall<TSchema extends ZodTypeAny> {
  label: string;
  system: string;
  user: string;
  schema: TSchema;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export class LlmClient {
  readonly provider: LlmProvider;
  private readonly limiter: RateLimiter;
  private readonly attempts: number;
  private readonly onTelemetry: LlmClientOptions["onTelemetry"];
  private readonly onRetry: LlmClientOptions["onRetry"];
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private callCount = 0;

  constructor(options: LlmClientOptions) {
    this.provider = options.provider;
    this.attempts = options.attempts ?? 6;
    this.onTelemetry = options.onTelemetry;
    this.onRetry = options.onRetry;
    this.limiter = new RateLimiter({
      requestsPerMinute: options.requestsPerMinute ?? 5,
      tokensPerMinute: options.tokensPerMinute ?? 200_000,
      maxConcurrent: options.maxConcurrent ?? 2,
      minGapMs: 250,
    });
  }

  get usage() {
    return {
      calls: this.callCount,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
    };
  }

  async structured<TSchema extends ZodTypeAny>(
    call: StructuredCall<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const first = await this.rawCompletion(call, buildRequest(call), false);
    const parsed = this.tryParse(call, first);
    if (parsed.ok) return parsed.value;

    const repairRequest = buildRequest({
      ...call,
      user: [
        "A previous attempt produced output that failed validation.",
        `Validation problems: ${parsed.problems}`,
        "Return corrected JSON only. Do not add commentary, markdown fences or extra keys.",
        "",
        "Original task:",
        call.user,
        "",
        "Previous output:",
        first.slice(0, 6000),
      ].join("\n"),
      temperature: 0,
    });

    const second = await this.rawCompletion(call, repairRequest, true);
    const repaired = this.tryParse(call, second);
    if (repaired.ok) return repaired.value;

    throw new LlmStructureError(
      call.label,
      `structured output failed twice: ${repaired.problems}`,
      second,
    );
  }

  private tryParse<TSchema extends ZodTypeAny>(
    call: StructuredCall<TSchema>,
    raw: string,
  ): { ok: true; value: z.infer<TSchema> } | { ok: false; problems: string } {
    let candidate: unknown;
    try {
      candidate = extractJson(raw);
    } catch (error) {
      return {
        ok: false,
        problems: error instanceof JsonRecoveryError ? "output was not valid JSON" : String(error),
      };
    }
    const result = call.schema.safeParse(candidate);
    if (result.success) return { ok: true, value: result.data };
    return {
      ok: false,
      problems: result.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; "),
    };
  }

  private async rawCompletion<TSchema extends ZodTypeAny>(
    call: StructuredCall<TSchema>,
    request: CompletionRequest,
    repaired: boolean,
  ): Promise<string> {
    const estimatedTokens = Math.ceil((request.system.length + request.user.length) / 4) + 1500;

    return this.limiter.run(estimatedTokens, () =>
      withRetry(
        async (attempt) => {
          const startedAt = Date.now();
          const result = await this.provider.complete(request, call.signal);
          this.callCount += 1;
          this.totalInputTokens += result.inputTokens;
          this.totalOutputTokens += result.outputTokens;
          this.limiter.recordUsage(
            Math.max(0, result.inputTokens + result.outputTokens - estimatedTokens),
          );
          this.onTelemetry?.({
            label: call.label,
            attempt,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs: Date.now() - startedAt,
            repaired,
          });
          return result.text;
        },
        {
          attempts: this.attempts,
          signal: call.signal,
          onRetry: ({ attempt, delayMs, error }) =>
            this.onRetry?.({
              label: call.label,
              attempt,
              delayMs,
              reason: error instanceof RetryableError ? error.message : String(error),
            }),
        },
      ),
    );
  }
}

function buildRequest(call: StructuredCall<ZodTypeAny>): CompletionRequest {
  return {
    label: call.label,
    system: call.system,
    user: call.user,
    temperature: call.temperature ?? 0.25,
    maxOutputTokens: call.maxOutputTokens ?? 8192,
    json: true,
  };
}
