import type { CompletionRequest, CompletionResult, LlmProvider } from "../src/llm/provider.ts";

export interface StubCall {
  label: string;
  user: string;
}

export class StubLlmProvider implements LlmProvider {
  readonly name = "stub";
  readonly model = "stub-1";
  readonly calls: StubCall[] = [];
  private readonly countsByLabel = new Map<string, number>();
  private readonly responder: (
    label: string,
    occurrence: number,
    request: CompletionRequest,
  ) => unknown;

  constructor(
    responder: (label: string, occurrence: number, request: CompletionRequest) => unknown,
  ) {
    this.responder = responder;
  }

  callsFor(label: string): StubCall[] {
    return this.calls.filter((call) => call.label === label);
  }

  labels(): string[] {
    return this.calls.map((call) => call.label);
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const label = request.label ?? "unknown";
    const occurrence = (this.countsByLabel.get(label) ?? 0) + 1;
    this.countsByLabel.set(label, occurrence);
    this.calls.push({ label, user: request.user });

    const payload = this.responder(label, occurrence, request);
    return {
      text: JSON.stringify(payload ?? {}),
      inputTokens: Math.ceil(request.user.length / 4),
      outputTokens: 200,
    };
  }
}
