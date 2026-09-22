import { initialKitState, LlmClient } from "@prepkit/core";
import type { Express } from "express";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { loadEnv } from "../src/config/env.ts";
import { KitModel } from "../src/db/models/kit.ts";
import { ReviewModel } from "../src/db/models/review.ts";
import { UserModel } from "../src/db/models/user.ts";
import { GenerationQueue } from "../src/jobs/generation-queue.ts";
import { fingerprintFor } from "../src/modules/kits/service.ts";
import { readyKit, researchedPages, ScriptedLlmProvider } from "./fixtures.ts";

let mongo: MongoMemoryServer;
let app: Express;
let provider: ScriptedLlmProvider;

const CREDENTIALS = { email: "ajay@example.test", password: "correct-horse-battery" };
const OTHER = { email: "someone@example.test", password: "another-long-password" };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri("prepkit-test"));

  provider = new ScriptedLlmProvider((label) => {
    if (label.startsWith("questions:")) {
      return {
        questions: [
          {
            requirement_ids: ["r1"],
            prompt: "Freshly generated question about Node.js internals.",
            answer_outline: "fresh outline",
            difficulty: 2,
          },
        ],
      };
    }
    if (label === "company-brief") {
      return {
        summary: "Regenerated summary.",
        what_they_do: "Regenerated description.",
        used_sources: [],
        unknowns: [],
      };
    }
    return { questions: [], flashcards: [] };
  });

  const env = loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: "test-secret-that-is-long-enough",
    CORS_ORIGIN: "http://localhost:3000",
    AUTH_ATTEMPTS_PER_WINDOW: "10000",
    API_REQUESTS_PER_MINUTE: "10000",
  } as NodeJS.ProcessEnv);

  const llm = new LlmClient({
    provider,
    requestsPerMinute: 10_000,
    tokensPerMinute: 10_000_000,
    maxConcurrent: 4,
  });

  app = createApp({ env, queue: new GenerationQueue({ concurrency: 1, llm }), llm });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    KitModel.deleteMany({}),
    ReviewModel.deleteMany({}),
  ]);
});

async function signIn(credentials = CREDENTIALS): Promise<string[]> {
  const registered = await request(app).post("/api/auth/register").send(credentials);
  const cookies: unknown = registered.headers["set-cookie"];
  if (Array.isArray(cookies)) return cookies as string[];
  return typeof cookies === "string" ? [cookies] : [];
}

async function seedKit(cookies: string[]) {
  const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
  const kit = readyKit();
  const document = await KitModel.create({
    userId: me.body.user.id,
    title: "Senior Backend Engineer at Acme Freight",
    companyUrl: "https://acme.test",
    jobDescription: "Senior Backend Engineer at Acme Freight. ".repeat(4),
    daysAvailable: 3,
    fingerprint: fingerprintFor(me.body.user.id, "seeded", "https://acme.test"),
    status: "ready",
    kit,
    itemState: initialKitState(kit),
    research: {
      pages: researchedPages(),
      hiring: {
        found: false,
        summary: "",
        stages: [],
        signals: [],
        sources: [],
        confidence: "none",
        notes: [],
        injectionFlags: [],
      },
    },
  });
  return document._id.toString();
}

describe("authentication", () => {
  it("registers, identifies and signs a user out", async () => {
    const cookies = await signIn();

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(CREDENTIALS.email);

    await request(app).post("/api/auth/logout").set("Cookie", cookies).expect(204);
  });

  it("refuses a duplicate email", async () => {
    await signIn();
    const again = await request(app).post("/api/auth/register").send(CREDENTIALS);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("refuses a weak password before touching the database", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@b.test", password: "short" });
    expect(response.status).toBe(400);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("answers an unknown email and a wrong password identically", async () => {
    await signIn();

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ ...CREDENTIALS, password: "wrong-but-long-enough" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.test", password: CREDENTIALS.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("keeps protected endpoints closed to signed-out visitors", async () => {
    for (const path of ["/api/auth/me", "/api/kits"]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
    }
  });

  it("rejects a tampered session cookie", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["prepkit_session=not-a-jwt"]);
    expect(response.status).toBe(401);
  });
});

describe("bearer tokens", () => {
  it("accepts a token minted by the web server for a signed-in user", async () => {
    const cookies = await signIn();
    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    const token = jwt.sign({ email: CREDENTIALS.email }, "test-secret-that-is-long-enough", {
      subject: me.body.user.id,
      expiresIn: "5m",
    });

    const response = await request(app).get("/api/kits").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.kits).toEqual([]);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = jwt.sign({ email: CREDENTIALS.email }, "a-completely-different-secret", {
      subject: "000000000000000000000000",
      expiresIn: "5m",
    });

    const response = await request(app).get("/api/kits").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const token = jwt.sign({ email: CREDENTIALS.email }, "test-secret-that-is-long-enough", {
      subject: "000000000000000000000000",
      expiresIn: "-1s",
    });

    const response = await request(app).get("/api/kits").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it("verifies credentials without issuing a cookie, for the web server to call", async () => {
    await signIn();

    const good = await request(app).post("/api/auth/verify").send(CREDENTIALS);
    expect(good.status).toBe(200);
    expect(good.body.user.email).toBe(CREDENTIALS.email);
    expect(good.headers["set-cookie"]).toBeUndefined();

    const bad = await request(app)
      .post("/api/auth/verify")
      .send({ ...CREDENTIALS, password: "wrong-but-long-enough" });
    expect(bad.status).toBe(401);
  });
});

describe("cross-origin requests", () => {
  it("omits the CORS headers for an origin that is not allow-listed, without erroring", async () => {
    const response = await request(app).get("/health").set("Origin", "https://evil.example.test");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("echoes an allow-listed origin back with credentials enabled", async () => {
    const response = await request(app).get("/health").set("Origin", "http://localhost:3000");

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});

describe("kit ownership", () => {
  it("never shows one user another user's kit", async () => {
    const owner = await signIn();
    const kitId = await seedKit(owner);

    const intruder = await signIn(OTHER);
    const read = await request(app).get(`/api/kits/${kitId}`).set("Cookie", intruder);
    expect(read.status).toBe(403);

    const list = await request(app).get("/api/kits").set("Cookie", intruder);
    expect(list.body.kits).toEqual([]);

    const destroy = await request(app).delete(`/api/kits/${kitId}`).set("Cookie", intruder);
    expect(destroy.status).toBe(403);
    expect(await KitModel.countDocuments()).toBe(1);
  });
});

describe("the builder", () => {
  it("marks an edited question and keeps it through a regeneration of its category", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    await request(app)
      .patch(`/api/kits/${kitId}/questions/q1`)
      .set("Cookie", cookies)
      .send({ prompt: "My own wording for the Node question." })
      .expect(200);

    const afterEdit = await request(app).get(`/api/kits/${kitId}`).set("Cookie", cookies);
    expect(afterEdit.body.kit.itemState.questions.q1.edited).toBe(true);

    const regenerated = await request(app)
      .post(`/api/kits/${kitId}/regenerate`)
      .set("Cookie", cookies)
      .send({ section: "questions", category: "technical" })
      .expect(200);

    const prompts = regenerated.body.kit.kit.questions.map(
      (question: { prompt: string }) => question.prompt,
    );
    expect(prompts).toContain("My own wording for the Node question.");
    expect(prompts).not.toContain("Describe a Postgres schema you designed.");
    expect(regenerated.body.preservedIds).toContain("q1");
    expect(regenerated.body.replacedIds).toContain("q2");

    const behavioural = regenerated.body.kit.kit.questions.find(
      (question: { id: string }) => question.id === "q3",
    );
    expect(behavioural).toBeDefined();
  });

  it("keeps a pinned question that was never edited", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    await request(app)
      .post(`/api/kits/${kitId}/questions/q2/pin`)
      .set("Cookie", cookies)
      .send({ pinned: true })
      .expect(200);

    const regenerated = await request(app)
      .post(`/api/kits/${kitId}/regenerate`)
      .set("Cookie", cookies)
      .send({ section: "questions", category: "technical" })
      .expect(200);

    expect(regenerated.body.preservedIds).toContain("q2");
  });

  it("keeps a hand-written question through a regeneration", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    const created = await request(app)
      .post(`/api/kits/${kitId}/questions`)
      .set("Cookie", cookies)
      .send({
        prompt: "A question I wrote myself.",
        category: "technical",
        requirement_ids: ["r1"],
      })
      .expect(201);

    const regenerated = await request(app)
      .post(`/api/kits/${kitId}/regenerate`)
      .set("Cookie", cookies)
      .send({ section: "questions", category: "technical" })
      .expect(200);

    expect(regenerated.body.preservedIds).toContain(created.body.id);
  });

  it("keeps an edited brief while refreshing the half that was untouched", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    await request(app)
      .patch(`/api/kits/${kitId}/brief`)
      .set("Cookie", cookies)
      .send({ summary: "My own summary." })
      .expect(200);

    const regenerated = await request(app)
      .post(`/api/kits/${kitId}/regenerate`)
      .set("Cookie", cookies)
      .send({ section: "company_brief" })
      .expect(200);

    expect(regenerated.body.kit.kit.company_brief.summary).toBe("My own summary.");
    expect(regenerated.body.kit.kit.company_brief.what_they_do).toBe("Regenerated description.");
  });

  it("reorders questions and rejects an order that invents an id", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    const reordered = await request(app)
      .put(`/api/kits/${kitId}/questions/order`)
      .set("Cookie", cookies)
      .send({ ids: ["q3", "q1", "q2"] })
      .expect(200);

    expect(reordered.body.kit.kit.questions.map((question: { id: string }) => question.id)).toEqual(
      ["q3", "q1", "q2"],
    );

    await request(app)
      .put(`/api/kits/${kitId}/questions/order`)
      .set("Cookie", cookies)
      .send({ ids: ["q9"] })
      .expect(400);
  });

  it("moves a question into another category", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    const moved = await request(app)
      .patch(`/api/kits/${kitId}/questions/q1`)
      .set("Cookie", cookies)
      .send({ category: "system-design" })
      .expect(200);

    const question = moved.body.kit.kit.questions.find((item: { id: string }) => item.id === "q1");
    expect(question.category).toBe("system-design");
  });

  it("reports the coverage gap a deletion opens rather than hiding it", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    const deleted = await request(app)
      .delete(`/api/kits/${kitId}/questions/q3`)
      .set("Cookie", cookies)
      .expect(200);

    expect(deleted.body.newGaps).toEqual(["r3"]);
    expect(deleted.body.kit.kit.coverage.uncovered_requirement_ids).toContain("r3");
    expect(deleted.body.kit.counts.uncoveredMust).toBe(1);
  });

  it("rebuilds the schedule when the interview date moves", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    const regenerated = await request(app)
      .post(`/api/kits/${kitId}/regenerate`)
      .set("Cookie", cookies)
      .send({ section: "schedule", daysAvailable: 7 })
      .expect(200);

    expect(regenerated.body.kit.kit.schedule.days).toHaveLength(7);
    expect(regenerated.body.kit.kit.schedule.days_available).toBe(7);
  });

  it("refuses an edit that would break the kit structure", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    await request(app)
      .patch(`/api/kits/${kitId}/questions/q1`)
      .set("Cookie", cookies)
      .send({ difficulty: 9 })
      .expect(400);
  });
});

describe("creating kits", () => {
  it("returns the existing kit when the same posting is submitted twice", async () => {
    const cookies = await signIn();
    const payload = {
      jobDescription: "Senior Backend Engineer. We need Node.js and PostgreSQL experience.",
      companyUrl: "https://acme.test",
      daysAvailable: 5,
    };

    const first = await request(app).post("/api/kits").set("Cookie", cookies).send(payload);
    expect(first.status).toBe(202);
    expect(first.body.duplicate).toBe(false);

    const second = await request(app).post("/api/kits").set("Cookie", cookies).send(payload);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.kit.id).toBe(first.body.kit.id);

    const forced = await request(app)
      .post("/api/kits")
      .set("Cookie", cookies)
      .send({ ...payload, force: true });
    expect(forced.body.duplicate).toBe(false);
    expect(forced.body.kit.id).not.toBe(first.body.kit.id);
  });

  it("rejects a company url that cannot be fetched", async () => {
    const cookies = await signIn();
    const response = await request(app).post("/api/kits").set("Cookie", cookies).send({
      jobDescription: "Senior Backend Engineer with Node.js and PostgreSQL.",
      companyUrl: "file:///etc/passwd",
      daysAvailable: 5,
    });

    expect(response.status).toBe(400);
  });

  it("queues several postings from one batch submission", async () => {
    const cookies = await signIn();
    const response = await request(app)
      .post("/api/kits/batch")
      .set("Cookie", cookies)
      .send({
        cases: [
          {
            jobDescription: "Backend engineer needing Node.js depth.",
            companyUrl: "https://one.test",
            daysAvailable: 3,
          },
          {
            jobDescription: "Frontend engineer needing React depth.",
            companyUrl: "https://two.test",
            daysAvailable: 4,
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body.created).toHaveLength(2);
    expect(await KitModel.countDocuments()).toBe(2);
  });
});

describe("practice", () => {
  it("orders unseen cards first and tracks what has been covered", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    const before = await request(app).get(`/api/kits/${kitId}/practice`).set("Cookie", cookies);
    expect(before.body.session).toHaveLength(2);
    expect(before.body.progress.seen).toBe(0);

    await request(app)
      .post(`/api/kits/${kitId}/practice/f1`)
      .set("Cookie", cookies)
      .send({ confidence: 3 })
      .expect(200);

    const after = await request(app).get(`/api/kits/${kitId}/practice`).set("Cookie", cookies);
    expect(after.body.progress.seen).toBe(1);
    expect(after.body.session[0].flashcard.id).toBe("f2");
  });

  it("rejects a confidence value it does not understand", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    await request(app)
      .post(`/api/kits/${kitId}/practice/f1`)
      .set("Cookie", cookies)
      .send({ confidence: 7 })
      .expect(400);
  });

  it("scores readiness and names the weakest must-have requirement", async () => {
    const cookies = await signIn();
    const kitId = await seedKit(cookies);

    await request(app)
      .post(`/api/kits/${kitId}/practice/f1`)
      .set("Cookie", cookies)
      .send({ confidence: 3 });
    await request(app)
      .post(`/api/kits/${kitId}/practice/f2`)
      .set("Cookie", cookies)
      .send({ confidence: 0 });

    const response = await request(app).get(`/api/kits/${kitId}/readiness`).set("Cookie", cookies);
    expect(response.status).toBe(200);
    expect(response.body.readiness.score).toBeGreaterThan(0);
    expect(response.body.readiness.weakSpots[0].requirementId).toBe("r3");
    expect(
      response.body.readiness.weakSpots.map(
        (item: { requirementId: string }) => item.requirementId,
      ),
    ).toEqual(["r3", "r2"]);
    expect(response.body.readiness.untouchedMustRequirements).toBe(1);
  });
});
