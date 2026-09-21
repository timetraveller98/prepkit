import { fetchWithTimeout, safeText, toProviderError } from "./gemini.ts";
import {
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
  LlmProviderError,
} from "./provider.ts";

export interface OpenAiCompatibleOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerName?: string;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor({ apiKey, model, baseUrl, providerName }: OpenAiCompatibleOptions) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.name = providerName ?? "openai-compatible";
  }

  async complete(request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxOutputTokens ?? 8192,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        ...(request.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
    });

    if (!response.ok) throw toProviderError(response, await safeText(response));

    const payload = (await response.json()) as ChatCompletionResponse;
    const text = payload.choices?.[0]?.message?.content ?? "";
    if (!text) throw new LlmProviderError(`${this.name} returned no content`);

    return {
      text,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  }
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
