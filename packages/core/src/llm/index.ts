import { currentEnv, type EnvSource, readEnvNumber } from "../env.ts";
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

export type LlmEnv = EnvSource;

export function createProvider(env: LlmEnv = currentEnv()): LlmProvider {
  const provider = (env.LLM_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "gemini" || provider === "google") {
    const apiKey = env.GEMINI_API_KEY ?? env.LLM_API_KEY;
    if (!apiKey) throw new MissingCredentialsError("GEMINI_API_KEY");
    return new GeminiProvider({ apiKey, model: env.LLM_MODEL ?? "gemini-3.6-flash" });
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
  env: LlmEnv = currentEnv(),
  overrides: Partial<LlmClientOptions> = {},
): LlmClient {
  return new LlmClient({
    provider: overrides.provider ?? createProvider(env),
    requestsPerMinute: readEnvNumber(env.LLM_REQUESTS_PER_MINUTE, 5),
    tokensPerMinute: readEnvNumber(env.LLM_TOKENS_PER_MINUTE, 200_000),
    maxConcurrent: readEnvNumber(env.LLM_CONCURRENCY, 2),
    attempts: readEnvNumber(env.LLM_MAX_ATTEMPTS, 6),
    ...overrides,
  });
}
