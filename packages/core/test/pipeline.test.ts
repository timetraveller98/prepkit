import type { Server } from "node:http";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, listen } from "../src/dev/fixture-server.ts";
import { validateKit } from "../src/kit.ts";
import { LlmClient } from "../src/llm/client.ts";
import { generateKit } from "../src/pipeline/run.ts";
import { StubLlmProvider } from "./stub-llm.ts";

const JOB_DESCRIPTION = `Senior Backend Engineer — Acme Freight

We are looking for a senior backend engineer to own our telemetry ingest pipeline.

Requirements:
- 5+ years building production services in Node.js
- Strong experience with PostgreSQL and schema design
- Experience mentoring junior engineers
Bonus points for:
- Familiarity with the logistics or freight domain`;

const REQUIREMENTS = [
  {
    text: "5+ years building production services in Node.js",
    kind: "technical",
    priority: "must",
    evidence: "5+ years building production services in Node.js",
  },
  {
    text: "Strong experience with PostgreSQL and schema design",
    kind: "technical",
    priority: "must",
    evidence: "Strong experience with PostgreSQL and schema design",
  },
  {
    text: "Experience mentoring junior engineers",
    kind: "behavioural",
    priority: "must",
    evidence: "Experience mentoring junior engineers",
  },
  {
    text: "Familiarity with the logistics or freight domain",
    kind: "domain",
    priority: "nice",
    evidence: "Familiarity with the logistics or freight domain",
  },
];

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createFixtureServer(resolve(import.meta.dirname, "fixtures/sites"));
  const port = await listen(server, 0);
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

function stubProvider() {
  return new StubLlmProvider((label, occurrence, request) => {
    if (label === "extract-requirements") {
      return {
        company_name: "Acme Freight",
        role_title: "Senior Backend Engineer",
        seniority: "senior",
        location: "Chicago or remote",
        responsibilities: ["Own the telemetry ingest pipeline"],
        requirements: REQUIREMENTS,
        notes: [],
      };
    }
    if (label === "company-brief") {
      return {
        summary: "Acme Freight builds dispatch software for regional carriers.",
        what_they_do: "Route planning and dispatch for carriers running 50 to 800 trucks.",
        used_sources: [],
        unknowns: [],
      };
    }
    if (label === "hiring-process") {
      return {
        found: true,
        summary: "Four stages: recruiter screen, paid take-home, system design, values interview.",
        stages: [
          { name: "Recruiter screen", what_happens: "30 minutes, no technical questions" },
          { name: "Take-home", what_happens: "Three hour paid dispatch exercise" },
          { name: "System design", what_happens: "Telemetry ingest at scale" },
          { name: "Values interview", what_happens: "Disagreement, ownership, mentoring" },
        ],
        signals: ["take-home", "system design round", "values interview"],
        used_sources: [],
        confidence: "high",
      };
    }
    if (label === "questions:technical") {
      if (occurrence === 1) {
        return {
          questions: [
            {
              requirement_ids: ["r1"],
              prompt: "Walk me through the Node service you are proudest of.",
              answer_outline: "a",
              difficulty: 3,
            },
            {
              requirement_ids: ["r1"],
              prompt: "How do you keep an ingest path from falling over under burst load?",
              answer_outline: "b",
              difficulty: 3,
            },
          ],
        };
      }
      return {
        questions: [
          {
            requirement_ids: ["r2"],
            prompt: "Describe a Postgres schema you designed and what you would change now.",
            answer_outline: "c",
            difficulty: 2,
          },
        ],
      };
    }
    if (label === "questions:behavioural") {
      if (occurrence === 1) return { questions: [] };
      return {
        questions: [
          {
            requirement_ids: ["r3"],
            prompt: "Tell me about a junior engineer you brought up to speed.",
            answer_outline: "d",
            difficulty: 2,
          },
        ],
      };
    }
    if (label === "questions:system-design") {
      return {
        questions: [
          {
            requirement_ids: ["r1"],
            prompt: "Design the telemetry ingest path for 800 trucks reporting every ten seconds.",
            answer_outline: "e",
            difficulty: 3,
          },
        ],
      };
    }
    if (label === "questions:company-fit") {
      return {
        questions: [
          {
            requirement_ids: ["r4"],
            prompt: "Why dispatch software rather than any other backend job?",
            answer_outline: "f",
            difficulty: 1,
          },
        ],
      };
    }
    if (label === "flashcards") {
      return {
        flashcards: REQUIREMENTS.map((item, index) => ({
          front: `Recall: ${item.text}`,
          back: "Name the project and the outcome.",
          requirement_ids: [`r${index + 1}`],
        })),
      };
    }
    return { questions: [], flashcards: [], ...(request.label ? {} : {}) };
  });
}

function client(provider: StubLlmProvider) {
  return new LlmClient({
    provider,
    requestsPerMinute: 10_000,
    tokensPerMinute: 10_000_000,
    maxConcurrent: 4,
  });
}

describe("generateKit", () => {
  it("researches, generates, closes coverage gaps and validates", async () => {
    const provider = stubProvider();
    const { kit, events } = await generateKit({
      jobDescription: JOB_DESCRIPTION,
      companyUrl: `${baseUrl}/acme/`,
      daysAvailable: 5,
      llm: client(provider),
      env: { ...process.env, SEARCH_PROVIDER: "none", ALLOW_PRIVATE_URLS: "true" },
    });

    expect(validateKit(kit).valid).toBe(true);

    expect(kit.role.requirements).toHaveLength(4);
    expect(kit.role.requirements.filter((item) => item.priority === "must")).toHaveLength(3);
    expect(kit.role.requirements.at(-1)?.priority).toBe("nice");

    expect(provider.callsFor("questions:technical").length).toBeGreaterThanOrEqual(1);
    expect(provider.labels()).toContain("questions:behavioural");
    expect(provider.labels()).toContain("questions:system-design");
    expect(provider.labels()).toContain("questions:company-fit");

    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.coverage.passes).toBeGreaterThanOrEqual(2);

    expect(kit.schedule.days).toHaveLength(5);
    expect(kit.schedule.days.every((day) => Number.isInteger(day.minutes))).toBe(true);

    const questionIds = new Set(kit.questions.map((question) => question.id));
    for (const day of kit.schedule.days) {
      for (const id of day.question_ids) expect(questionIds.has(id)).toBe(true);
    }

    expect(
      events.some((event) => event.step === "crawl-company-site" && event.status === "completed"),
    ).toBe(true);
    expect(events.some((event) => event.step === "coverage" && event.status === "completed")).toBe(
      true,
    );
  });

  it("finds the hiring page even though it is buried in a handbook", async () => {
    const provider = stubProvider();
    const { kit } = await generateKit({
      jobDescription: JOB_DESCRIPTION,
      companyUrl: `${baseUrl}/acme/`,
      daysAvailable: 3,
      llm: client(provider),
      env: { ...process.env, SEARCH_PROVIDER: "none", ALLOW_PRIVATE_URLS: "true" },
    });

    expect(kit.source.pages_used.some((url) => url.includes("how-we-hire"))).toBe(true);

    const hiringPrompt = (provider.callsFor("hiring-process")[0]?.user ?? "").toLowerCase();
    expect(hiringPrompt).toContain("take-home exercise");
    expect(hiringPrompt).toContain("system design interview");
  });

  it("reports an honest kit when the company has no hiring page", async () => {
    const provider = new StubLlmProvider((label) => {
      if (label === "extract-requirements") {
        return {
          company_name: "Northwind Analytics",
          role_title: "Data Engineer",
          seniority: "mid",
          location: "Leeds",
          responsibilities: [],
          requirements: [REQUIREMENTS[0]],
          notes: [],
        };
      }
      if (label === "company-brief") {
        return {
          summary: "Forecasting for grocery chains.",
          what_they_do: "Demand forecasts.",
          used_sources: [],
          unknowns: [],
        };
      }
      if (label === "hiring-process") {
        return {
          found: false,
          summary: "",
          stages: [],
          signals: [],
          used_sources: [],
          confidence: "none",
        };
      }
      if (label.startsWith("questions:")) {
        return {
          questions: [
            {
              requirement_ids: ["r1"],
              prompt: `Question for ${label}`,
              answer_outline: "",
              difficulty: 2,
            },
          ],
        };
      }
      return { flashcards: [{ front: "front", back: "back", requirement_ids: ["r1"] }] };
    });

    const { kit } = await generateKit({
      jobDescription: JOB_DESCRIPTION,
      companyUrl: `${baseUrl}/northwind/`,
      daysAvailable: 4,
      llm: client(provider),
      env: { ...process.env, SEARCH_PROVIDER: "none", ALLOW_PRIVATE_URLS: "true" },
    });

    expect(kit.research.hiring_process_found).toBe(false);
    expect(kit.notes.join(" ")).toMatch(/no public discussion|hiring/i);
    expect(validateKit(kit).valid).toBe(true);
  });

  it("still produces a kit when the company site cannot be reached", async () => {
    const provider = stubProvider();
    const { kit } = await generateKit({
      jobDescription: JOB_DESCRIPTION,
      companyUrl: "http://127.0.0.1:1/",
      daysAvailable: 2,
      llm: client(provider),
      env: { ...process.env, SEARCH_PROVIDER: "none", ALLOW_PRIVATE_URLS: "true" },
    });

    expect(kit.source.pages_used).toEqual([]);
    expect(kit.company_brief.summary).toMatch(/could be retrieved|empty/i);
    expect(kit.research.pages_failed.length).toBeGreaterThan(0);
    expect(kit.notes.join(" ")).toMatch(/could not be reached/i);
    expect(validateKit(kit).valid).toBe(true);
  }, 40_000);

  it("produces a thin, honest kit from a two-line posting", async () => {
    const provider = new StubLlmProvider((label) => {
      if (label === "extract-requirements") {
        return {
          company_name: "",
          role_title: "Engineer",
          seniority: "",
          location: "",
          responsibilities: [],
          requirements: [],
          notes: [],
        };
      }
      if (label === "company-brief") {
        return {
          summary: "Dispatch software.",
          what_they_do: "Dispatch.",
          used_sources: [],
          unknowns: [],
        };
      }
      if (label === "hiring-process") {
        return {
          found: false,
          summary: "",
          stages: [],
          signals: [],
          used_sources: [],
          confidence: "none",
        };
      }
      return { questions: [], flashcards: [] };
    });

    const { kit } = await generateKit({
      jobDescription: "Engineer wanted. Must be good at computers and available soon.",
      companyUrl: `${baseUrl}/acme/`,
      daysAvailable: 7,
      llm: client(provider),
      env: { ...process.env, SEARCH_PROVIDER: "none", ALLOW_PRIVATE_URLS: "true" },
    });

    expect(kit.role.requirements).toEqual([]);
    expect(kit.questions).toEqual([]);
    expect(kit.schedule.days).toHaveLength(7);
    expect(kit.notes.join(" ")).toMatch(/thin|No requirements/i);
    expect(validateKit(kit).valid).toBe(true);
  });

  it("rejects a job description that is effectively empty", async () => {
    await expect(
      generateKit({
        jobDescription: "  ",
        companyUrl: `${baseUrl}/acme/`,
        daysAvailable: 3,
        llm: client(stubProvider()),
        env: { ...process.env, SEARCH_PROVIDER: "none" },
      }),
    ).rejects.toMatchObject({ code: "EMPTY_JOB_DESCRIPTION" });
  });
});
