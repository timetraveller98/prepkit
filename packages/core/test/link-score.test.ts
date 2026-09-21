import { describe, expect, it } from "vitest";
import { classifyPageContent, rankLinks, scoreLink } from "../src/retrieval/link-score.ts";

const link = (url: string, text = "") => ({ url, text, sameSite: true });

describe("scoreLink", () => {
  it("ranks an explicit hiring-process path above a generic careers page", () => {
    const hiring = scoreLink(
      link("https://acme.test/company/handbook/how-we-hire/", "How we hire"),
    );
    const careers = scoreLink(link("https://acme.test/careers/", "Careers"));

    expect(hiring.intent).toBe("hiring");
    expect(hiring.score).toBeGreaterThan(careers.score);
  });

  it("finds hiring intent from anchor text when the path says nothing", () => {
    const scored = scoreLink(link("https://acme.test/p/42", "How we interview engineers"));
    expect(scored.intent).toBe("hiring");
    expect(scored.score).toBeGreaterThan(0);
  });

  it("pushes legal, auth and asset links below the threshold", () => {
    for (const url of [
      "https://acme.test/legal/privacy/",
      "https://acme.test/login",
      "https://acme.test/brochure.pdf",
      "https://acme.test/terms",
    ]) {
      expect(scoreLink(link(url)).score).toBeLessThan(3);
    }
  });

  it("prefers shallow paths over deeply nested ones", () => {
    const shallow = scoreLink(link("https://acme.test/about/"));
    const deep = scoreLink(link("https://acme.test/a/b/c/d/about/"));
    expect(shallow.score).toBeGreaterThan(deep.score);
  });

  it("recognises a handbook as a hiring lead", () => {
    expect(scoreLink(link("https://acme.test/handbook/", "Handbook")).intent).toBe("hiring");
  });
});

describe("rankLinks", () => {
  it("drops off-site links, deduplicates and orders by score", () => {
    const ranked = rankLinks(
      [
        link("https://acme.test/careers/", "Careers"),
        link("https://acme.test/careers", "Open roles"),
        { url: "https://other.test/careers", text: "Careers", sameSite: false },
        link("https://acme.test/handbook/how-we-hire/", "How we hire"),
        link("https://acme.test/legal/privacy", "Privacy"),
      ],
      { depth: 1 },
    );

    expect(ranked.map((item) => item.url)).toEqual([
      "https://acme.test/handbook/how-we-hire/",
      "https://acme.test/careers/",
    ]);
  });

  it("honours the exclusion set so a page is never fetched twice", () => {
    const ranked = rankLinks([link("https://acme.test/careers/", "Careers")], {
      depth: 1,
      exclude: new Set(["acme.test/careers"]),
    });
    expect(ranked).toEqual([]);
  });
});

describe("classifyPageContent", () => {
  it("detects a real hiring process description", () => {
    const result = classifyPageContent(
      "Our hiring process has four stages. A recruiter screen, a paid take-home exercise, a system design interview and a values interview.",
    );
    expect(result.looksLikeHiringProcess).toBe(true);
    expect(result.hiringSignalCount).toBeGreaterThanOrEqual(3);
  });

  it("does not claim a hiring process from marketing copy", () => {
    const result = classifyPageContent(
      "Acme Freight replaces the whiteboard and the spreadsheet for regional carriers.",
    );
    expect(result.looksLikeHiringProcess).toBe(false);
  });
});
