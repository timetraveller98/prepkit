import { parseRetryAfter, RetryableError } from "../util/retry.ts";
import {
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  LlmProviderError,
} from "./provider.ts";

const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 90_000;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  endpoint?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "google-gemini";
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor({ apiKey, model, endpoint }: GeminiOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint ?? DEFAULT_ENDPOINT;
  }

  async complete(request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResult> {
    const url = `${this.endpoint}/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.user }] }],
      generationConfig: {
        temperature: request.temperature ?? 0.3,
        maxOutputTokens: request.maxOutputTokens ?? 8192,
        ...(request.json ? { responseMimeType: "application/json" } : {}),
      },
    };

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) throw toProviderError(response, await safeText(response));

    const payload = (await response.json()) as GeminiResponse;
    const candidate = payload.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    if (!text) {
      const reason = candidate?.finishReason ?? payload.promptFeedback?.blockReason ?? "empty";
      throw new LlmProviderError(`gemini returned no content (${reason})`);
    }

    return {
      text,
      inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}

interface GeminiResponse {
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("llm request timed out")),
    REQUEST_TIMEOUT_MS,
  );
  const external = init.signal;
  const onAbort = () => controller.abort(external?.reason);
  external?.addEventListener("abort", onAbort, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new RetryableError(`llm request failed: ${describe(error)}`);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

export function toProviderError(response: Response, body: string): Error {
  const detail = body.slice(0, 400);
  if (response.status === 429 || response.status >= 500) {
    return new RetryableError(
      `llm provider responded ${response.status}: ${detail}`,
      parseRetryAfter(response.headers.get("retry-after")) ?? retryDelayFromBody(body),
    );
  }
  return new LlmProviderError(
    `llm provider responded ${response.status}: ${detail}`,
    response.status,
  );
}

function retryDelayFromBody(body: string): number | undefined {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!match?.[1]) return undefined;
  return Math.round(Number.parseFloat(match[1]) * 1000);
}

export async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
