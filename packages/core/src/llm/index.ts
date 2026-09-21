import { LlmClient, type LlmClientOptions } from "./client.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAiCompatibleProvider } from "./openai-compatible.ts";
import type { LlmProvider } from "./provider.ts";

export * from "./client.ts";
export { GeminiProvider } from "./gemini.ts";
export * from "./json.ts";
export { OpenAiCompatibleProvider } from "./openai-compatible.ts";
export * from "./provider.ts";

export class MissingCredentialsError extends Error {
  constructor(variable: string) {
    super(`missing ${variable}. Copy .env.example to .env and fill it in.`);
    this.name = "MissingCredentialsError";
  }
}

export interface LlmEnv {
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  GEMINI_API_KEY?: string;
  LLM_REQUESTS_PER_MINUTE?: string;
  LLM_TOKENS_PER_MINUTE?: string;
  LLM_CONCURRENCY?: string;
  LLM_MAX_ATTEMPTS?: string;
}

export function createProvider(env: LlmEnv = process.env as LlmEnv): LlmProvider {
  const provider = (env.LLM_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "gemini" || provider === "google") {
    const apiKey = env.GEMINI_API_KEY ?? env.LLM_API_KEY;
    if (!apiKey) throw new MissingCredentialsError("GEMINI_API_KEY");
    return new GeminiProvider({ apiKey, model: env.LLM_MODEL ?? "gemini-2.5-flash" });
  }

  const apiKey = env.LLM_API_KEY;
  if (!apiKey) throw new MissingCredentialsError("LLM_API_KEY");
  if (!env.LLM_BASE_URL) throw new MissingCredentialsError("LLM_BASE_URL");
  return new OpenAiCompatibleProvider({
    apiKey,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL ?? "llama-3.3-70b-versatile",
    providerName: provider,
  });
}

export function createLlmClient(
  env: LlmEnv = process.env as LlmEnv,
  overrides: Partial<LlmClientOptions> = {},
): LlmClient {
  return new LlmClient({
    provider: overrides.provider ?? createProvider(env),
    requestsPerMinute: readNumber(env.LLM_REQUESTS_PER_MINUTE, 10),
    tokensPerMinute: readNumber(env.LLM_TOKENS_PER_MINUTE, 200_000),
    maxConcurrent: readNumber(env.LLM_CONCURRENCY, 2),
    attempts: readNumber(env.LLM_MAX_ATTEMPTS, 4),
    ...overrides,
  });
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
