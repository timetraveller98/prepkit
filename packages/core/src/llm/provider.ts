export interface CompletionRequest {
  label?: string;
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResult>;
}

export class LlmProviderError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmProviderError";
    this.status = status;
  }
}
