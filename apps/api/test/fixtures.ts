import type {
  CompletionRequest,
  CompletionResult,
  CrawledPage,
  Kit,
  LlmProvider,
} from "@prepkit/core";

export class ScriptedLlmProvider implements LlmProvider {
  readonly name = "scripted";
  readonly model = "scripted-1";
  readonly labels: string[] = [];
  private readonly responder: (label: string) => unknown;

  constructor(responder: (label: string) => unknown) {
    this.responder = responder;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const label = request.label ?? "unknown";
    this.labels.push(label);
    return {
      text: JSON.stringify(this.responder(label) ?? {}),
      inputTokens: 10,
      outputTokens: 10,
    };
  }
}

export function readyKit(): Kit {
  return {
    source: {
      company: "Acme Freight",
      company_url: "https://acme.test",
      role: "Senior Backend Engineer",
      location: "Chicago",
      jd_chars: 420,
      researched_at: new Date().toISOString(),
      pages_used: ["https://acme.test/"],
    },
    company_brief: {
      summary: "Acme Freight builds dispatch software.",
      what_they_do: "Route planning for regional carriers.",
      sources: ["https://acme.test/"],
    },
    role: {
      title: "Senior Backend Engineer",
      seniority: "senior",
      responsibilities: ["Own the ingest pipeline"],
      requirements: [
        { id: "r1", text: "5+ years with Node.js", kind: "technical", priority: "must" },
        { id: "r2", text: "PostgreSQL schema design", kind: "technical", priority: "must" },
        { id: "r3", text: "Mentoring junior engineers", kind: "behavioural", priority: "must" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Tell me about a Node service you own.",
        answer_outline: "outline one",
        difficulty: 3,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "technical",
        prompt: "Describe a Postgres schema you designed.",
        answer_outline: "outline two",
        difficulty: 2,
      },
      {
        id: "q3",
        requirement_ids: ["r3"],
        category: "behavioural",
        prompt: "Tell me about someone you mentored.",
        answer_outline: "outline three",
        difficulty: 2,
      },
    ],
    flashcards: [
      { id: "f1", front: "Node depth", back: "Name the service", requirement_ids: ["r1"] },
      { id: "f2", front: "Schema design", back: "Name the schema", requirement_ids: ["r2"] },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: "Core technical: Node.js", question_ids: ["q1"], minutes: 25 },
        { day: 2, focus: "Core technical: PostgreSQL", question_ids: ["q2"], minutes: 15 },
        { day: 3, focus: "Behavioural stories", question_ids: ["q3"], minutes: 15 },
      ],
    },
    coverage: { uncovered_requirement_ids: [], passes: 2 },
    research: {
      hiring_process_found: true,
      hiring_process_summary: "Four stages.",
      hiring_pages: ["https://acme.test/handbook/how-we-hire"],
      public_discussion_found: false,
      public_discussion_sources: [],
      pages_failed: [],
      robots_blocked: [],
      suspicious_content_flags: [],
    },
    notes: [],
  };
}

export function researchedPages(): CrawledPage[] {
  return [
    {
      url: "https://acme.test/",
      title: "Acme Freight",
      description: "Dispatch software for regional carriers.",
      text: "Acme Freight replaces the whiteboard and the spreadsheet for regional carriers running fifty to eight hundred trucks. A Postgres core, an event log for telemetry and a React operations console.",
      intent: "about",
      score: 12,
      depth: 0,
      hiringSignals: [],
      looksLikeHiringProcess: false,
    },
  ];
}
