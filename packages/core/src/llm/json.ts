export class JsonRecoveryError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = "JsonRecoveryError";
    this.raw = raw;
  }
}

export function extractJson(raw: string): unknown {
  const candidates = buildCandidates(raw);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(removeTrailingCommas(candidate));
      } catch {}
    }
  }
  throw new JsonRecoveryError("model output did not contain parseable JSON", raw);
}

function buildCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const candidates = new Set<string>();
  candidates.add(trimmed);

  const fenced = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.add(fenced[1].trim());

  for (const source of [...candidates]) {
    const sliced = sliceBalanced(source);
    if (sliced) candidates.add(sliced);
  }
  return [...candidates].filter((value) => value.length > 0);
}

function sliceBalanced(source: string): string | null {
  const start = firstStructuralIndex(source);
  if (start === -1) return null;

  const open = source[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

function firstStructuralIndex(source: string): number {
  const brace = source.indexOf("{");
  const bracket = source.indexOf("[");
  if (brace === -1) return bracket;
  if (bracket === -1) return brace;
  return Math.min(brace, bracket);
}

function removeTrailingCommas(source: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (escaped) {
      escaped = false;
      result += character;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      result += character;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      result += character;
      continue;
    }
    if (!inString && character === ",") {
      const rest = source.slice(index + 1);
      if (/^\s*[}\]]/.test(rest)) continue;
    }
    result += character;
  }
  return result;
}
