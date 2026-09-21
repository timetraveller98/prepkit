export function collapseWhitespace(value: string): string {
  return value
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n[truncated at ${maxChars} characters]`;
}

export function wordCount(value: string): number {
  const matched = value.trim().match(/\S+/g);
  return matched ? matched.length : 0;
}

const ALLOWED_CONTROL_CODES = new Set([9, 10, 13]);

export function stripControlCharacters(value: string): string {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = (code < 32 && !ALLOWED_CONTROL_CODES.has(code)) || code === 127;
    result += isControl ? " " : character;
  }
  return result;
}

export function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}
