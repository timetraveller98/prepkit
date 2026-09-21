import { UNTRUSTED_CONTENT_RULE } from "../util/untrusted.ts";

export function systemPrompt(role: string, rules: string[]): string {
  return [
    role,
    "",
    "Standing rules:",
    ...[
      UNTRUSTED_CONTENT_RULE,
      "Ground every statement in the supplied material. If the material does not support a claim, leave the field empty or say plainly that it is unknown.",
      "Never invent companies, products, people, metrics or requirements.",
      "Reply with a single JSON object and nothing else: no prose, no markdown fences, no trailing commentary.",
      ...rules,
    ].map((rule) => `- ${rule}`),
  ].join("\n");
}

export function section(title: string, body: string): string {
  return `## ${title}\n${body}`;
}
