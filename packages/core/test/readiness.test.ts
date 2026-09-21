import { describe, expect, it } from "vitest";
import type { Kit } from "../src/kit.ts";
import { newReviewRecord, reviewCard } from "../src/practice.ts";
import { computeReadiness } from "../src/readiness.ts";

function kitWith(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.test",
      role: "Engineer",
      location: "",
      jd_chars: 100,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: { summary: "", what_they_do: "", sources: [] },
    role: {
      title: "Engineer",
      seniority: "senior",
      responsibilities: [],
      requirements: [
        { id: "r1", text: "Node.js", kind: "technical", priority: "must" },
        { id: "r2", text: "Postgres", kind: "technical", priority: "must" },
        { id: "r3", text: "Kubernetes", kind: "technical", priority: "nice" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "p",
        answer_outline: "",
        difficulty: 2,
      },
    ],
    flashcards: [
      { id: "f1", front: "a", back: "b", requirement_ids: ["r1"] },
      { id: "f2", front: "c", back: "d", requirement_ids: ["r2"] },
      { id: "f3", front: "e", back: "f", requirement_ids: ["r3"] },
    ],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: "f", question_ids: ["q1"], minutes: 30 }],
    },
    coverage: { uncovered_requirement_ids: ["r2", "r3"], passes: 1 },
    research: {
      hiring_process_found: false,
      hiring_process_summary: "",
      hiring_pages: [],
      public_discussion_found: false,
      public_discussion_sources: [],
      pages_failed: [],
      robots_blocked: [],
      suspicious_content_flags: [],
    },
    notes: [],
  };
}

const now = new Date("2026-09-21T09:00:00.000Z");

describe("computeReadiness", () => {
  it("scores zero before anything has been practised", () => {
    const report = computeReadiness(kitWith(), []);
    expect(report.score).toBe(0);
    expect(report.untouchedMustRequirements).toBe(2);
  });

  it("weights an unprepared must-have above an unprepared nice-to-have", () => {
    const report = computeReadiness(kitWith(), []);

    const must = report.byRequirement.find((item) => item.requirementId === "r1");
    const nice = report.byRequirement.find((item) => item.requirementId === "r3");
    expect(must?.risk).toBeGreaterThan(nice?.risk ?? 0);
  });

  it("clears the risk on a requirement the user can now teach", () => {
    const confident = reviewCard(newReviewRecord("f1", now), 3, { now });
    const report = computeReadiness(kitWith(), [confident]);

    const must = report.byRequirement.find((item) => item.requirementId === "r1");
    expect(must?.confidence).toBe(1);
    expect(must?.risk).toBe(0);
    expect(report.weakSpots.map((item) => item.requirementId)).not.toContain("r1");
  });

  it("ranks a requirement with no evidence above one that was drilled badly", () => {
    const drilledBadly = reviewCard(newReviewRecord("f2", now), 0, { now });
    const report = computeReadiness(kitWith(), [drilledBadly]);

    expect(report.weakSpots[0]?.requirementId).toBe("r1");
    expect(report.weakSpots.map((item) => item.requirementId)).toContain("r2");
  });

  it("offers the weak spots as the next cards to drill", () => {
    const report = computeReadiness(kitWith(), []);
    expect(report.nextFlashcardIds).toContain("f1");
    expect(report.nextFlashcardIds).toContain("f2");
  });
});
