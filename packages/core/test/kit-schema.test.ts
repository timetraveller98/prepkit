import { describe, expect, it } from "vitest";
import type { Kit } from "../src/kit.ts";
import { validateKit } from "../src/kit.ts";

function baseKit(): Kit {
  return {
    source: {
      company: "Acme",
      company_url: "https://acme.test",
      role: "Backend Engineer",
      location: "Remote",
      jd_chars: 400,
      researched_at: "2026-09-01T09:12:44Z",
      pages_used: ["https://acme.test/"],
    },
    company_brief: { summary: "s", what_they_do: "w", sources: ["https://acme.test/"] },
    role: {
      title: "Backend Engineer",
      seniority: "senior",
      responsibilities: ["ship"],
      requirements: [{ id: "r1", text: "5+ years with Node", kind: "technical", priority: "must" }],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "p",
        answer_outline: "o",
        difficulty: 2,
      },
    ],
    flashcards: [{ id: "f1", front: "front", back: "back", requirement_ids: ["r1"] }],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "Core technical", question_ids: ["q1"], minutes: 45 },
        { day: 2, focus: "Review", question_ids: ["q1"], minutes: 20 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 2 },
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

function issuePaths(candidate: unknown): string[] {
  const result = validateKit(candidate);
  return result.valid ? [] : result.issues.map((issue) => issue.path);
}

describe("validateKit", () => {
  it("accepts a well-formed kit", () => {
    const result = validateKit(baseKit());
    expect(result.valid).toBe(true);
  });

  it("rejects a question pointing at a requirement that does not exist", () => {
    const kit = baseKit();
    kit.questions[0]!.requirement_ids = ["r9"];
    expect(issuePaths(kit)).toContain("questions.0.requirement_ids");
  });

  it("rejects a schedule day pointing at a question that does not exist", () => {
    const kit = baseKit();
    kit.schedule.days[0]!.question_ids = ["q9"];
    expect(issuePaths(kit)).toContain("schedule.days.0.question_ids");
  });

  it("rejects a schedule whose length does not match days_available", () => {
    const kit = baseKit();
    kit.schedule.days_available = 5;
    expect(issuePaths(kit)).toContain("schedule.days");
  });

  it("rejects non-integer and fractional durations", () => {
    const kit = baseKit();
    kit.schedule.days[0]!.minutes = 45.5;
    expect(issuePaths(kit)).toContain("schedule.days.0.minutes");
  });

  it("rejects a difficulty outside 1 to 3", () => {
    const kit = baseKit();
    kit.questions[0]!.difficulty = 4;
    expect(issuePaths(kit)).toContain("questions.0.difficulty");
  });

  it("rejects duplicate ids", () => {
    const kit = baseKit();
    kit.questions.push({ ...kit.questions[0]! });
    expect(issuePaths(kit)).toContain("questions");
  });

  it("rejects an unknown requirement kind or priority", () => {
    const kit = baseKit();
    (kit.role.requirements[0] as { priority: string }).priority = "maybe";
    expect(issuePaths(kit)).toContain("role.requirements.0.priority");
  });

  it("strips unexpected keys so a stored kit never drifts from the agreed shape", () => {
    const kit = { ...baseKit(), _internal: { anything: true } };
    const result = validateKit(kit);
    expect(result.valid).toBe(true);
    if (result.valid) expect("_internal" in result.kit).toBe(false);
  });
});
