const WORD_PATTERN = /[a-z0-9+#.]+/g;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalize(value).match(WORD_PATTERN) ?? [];
}

export function evidenceSupport(sourceText: string, evidence: string): number {
  const haystack = normalize(sourceText);
  const needle = normalize(evidence);
  if (!needle) return 0;
  if (haystack.includes(needle)) return 1;

  const haystackTokens = new Set(tokens(sourceText));
  const needleTokens = tokens(evidence).filter((token) => token.length > 2);
  if (needleTokens.length === 0) return 0;

  const matched = needleTokens.filter((token) => haystackTokens.has(token)).length;
  return matched / needleTokens.length;
}

export interface GroundingResult<T> {
  kept: T[];
  dropped: { item: T; support: number }[];
}

export function keepGrounded<T>(
  items: T[],
  sourceText: string,
  getEvidence: (item: T) => string,
  threshold = 0.5,
): GroundingResult<T> {
  const kept: T[] = [];
  const dropped: { item: T; support: number }[] = [];

  for (const item of items) {
    const support = evidenceSupport(sourceText, getEvidence(item));
    if (support >= threshold) kept.push(item);
    else dropped.push({ item, support });
  }

  return { kept, dropped };
}
