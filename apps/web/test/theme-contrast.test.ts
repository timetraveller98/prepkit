import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../app/globals.css"),
  "utf8",
);

interface Oklch {
  l: number;
  c: number;
  h: number;
}

function readTokens(selector: string): Record<string, Oklch> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(start, css.indexOf("}", start));

  const tokens: Record<string, Oklch> = {};
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*--([a-z-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (!match) continue;
    const [, name, l, c, h] = match;
    tokens[name as string] = { l: Number(l), c: Number(c), h: Number(h) };
  }
  return tokens;
}

function toLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ].map((value) => Math.min(1, Math.max(0, value))) as [number, number, number];
}

function relativeLuminance(colour: Oklch): number {
  const [r, g, b] = toLinearRgb(colour);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: Oklch, background: Oklch): number {
  const a = relativeLuminance(foreground) + 0.05;
  const b = relativeLuminance(background) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

const TEXT_PAIRS: [string, string, number][] = [
  ["ink", "canvas", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "surface-sunken", 4.5],
  ["ink-muted", "surface", 4.5],
  ["ink-muted", "canvas", 4.5],
  ["ink-faint", "surface", 3],
  ["accent", "surface", 4.5],
  ["accent-fg", "accent", 4.5],
  ["accent", "accent-soft", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "warning-soft", 4.5],
  ["danger", "danger-soft", 4.5],
];

const BORDER_PAIRS: [string, string, number][] = [
  ["line", "surface", 1.2],
  ["line-strong", "surface", 1.5],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme", (_name, selector) => {
  const tokens = readTokens(selector);

  it("defines every token the other theme defines", () => {
    const other = readTokens(selector === ":root" ? ".dark" : ":root");
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_PAIRS)("%s on %s meets %s:1", (foreground, background, minimum) => {
    const fg = tokens[foreground];
    const bg = tokens[background];
    expect(fg, `missing token --${foreground}`).toBeDefined();
    expect(bg, `missing token --${background}`).toBeDefined();
    expect(contrast(fg as Oklch, bg as Oklch)).toBeGreaterThanOrEqual(minimum);
  });

  it.each(BORDER_PAIRS)("%s is visible against %s", (foreground, background, minimum) => {
    expect(
      contrast(tokens[foreground] as Oklch, tokens[background] as Oklch),
    ).toBeGreaterThanOrEqual(minimum);
  });
});
