import { type LlmClient, normalizeUrl, QUESTION_CATEGORIES } from "@prepkit/core";
import { Router } from "express";
import { z } from "zod";
import { KitModel } from "../../db/models/kit.ts";
import { ApiError } from "../../http/errors.ts";
import { parseBody, requireParam } from "../../http/validate.ts";
import type { GenerationQueue } from "../../jobs/generation-queue.ts";
import { kitTitle } from "../../jobs/generation-queue.ts";
import { currentUser, requireUser } from "../auth/session.ts";
import { toKitDetail, toKitSummary } from "./presenters.ts";
import {
  addFlashcard,
  addQuestion,
  deleteFlashcard,
  deleteQuestion,
  fingerprintFor,
  loadOwnedKit,
  persistKit,
  regenerateSection,
  reorderFlashcards,
  reorderQuestions,
  requireReadyKit,
  setItemPinned,
  updateBrief,
  updateFlashcard,
  updateQuestion,
} from "./service.ts";

const MAX_BATCH_CASES = 10;
const MAX_LISTED_KITS = 100;
const LIST_PROJECTION = "-events -research -itemState -jobDescription";

const caseSchema = z.object({
  jobDescription: z.string().trim().min(20, "paste a little more of the posting").max(40_000),
  companyUrl: z.string().trim().min(3).max(2048),
  daysAvailable: z.coerce.number().int().min(1).max(90),
});

const createSchema = caseSchema.extend({ force: z.boolean().optional() });
const batchSchema = z.object({
  cases: z.array(caseSchema).min(1).max(MAX_BATCH_CASES),
  force: z.boolean().optional(),
});

const briefPatchSchema = z
  .object({ summary: z.string().max(4000), what_they_do: z.string().max(4000) })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "nothing to update");

const questionPatchSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    answer_outline: z.string().max(6000),
    difficulty: z.number().int().min(1).max(3),
    category: z.enum(QUESTION_CATEGORIES),
    requirement_ids: z.array(z.string()).max(20),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "nothing to update");

const questionCreateSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  answer_outline: z.string().max(6000).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  category: z.enum(QUESTION_CATEGORIES),
  requirement_ids: z.array(z.string()).max(20).optional(),
});

const flashcardPatchSchema = z
  .object({
    front: z.string().trim().min(1).max(1000),
    back: z.string().max(4000),
    requirement_ids: z.array(z.string()).max(20),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "nothing to update");

const flashcardCreateSchema = z.object({
  front: z.string().trim().min(1).max(1000),
  back: z.string().max(4000).optional(),
  requirement_ids: z.array(z.string()).max(20).optional(),
});

const orderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });
const pinSchema = z.object({ pinned: z.boolean() });
const regenerateSchema = z.object({
  section: z.enum(["company_brief", "questions", "flashcards", "schedule"]),
  category: z.enum(QUESTION_CATEGORIES).optional(),
  daysAvailable: z.number().int().min(1).max(90).optional(),
});

export function createKitsRouter(queue: GenerationQueue, llmFactory: () => LlmClient): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/", async (request, response) => {
    const user = currentUser(request);
    const documents = await KitModel.find({ userId: user.id })
      .select(LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(MAX_LISTED_KITS);
    response.json({ kits: documents.map(toKitSummary) });
  });

  router.post("/", async (request, response) => {
    const body = parseBody(createSchema, request);
    const user = currentUser(request);

    const existing = body.force ? null : await findDuplicate(user.id, body);
    if (existing) {
      response.status(200).json({
        duplicate: true,
        message: "you already have a kit for this posting and company",
        kit: toKitSummary(existing),
      });
      return;
    }

    const document = await createKit(user.id, body);
    queue.enqueue(document._id.toString());
    response.status(202).json({ duplicate: false, kit: toKitSummary(document) });
  });

  router.post("/batch", async (request, response) => {
    const body = parseBody(batchSchema, request);
    const user = currentUser(request);

    const created: unknown[] = [];
    const skipped: { companyUrl: string; reason: string }[] = [];

    for (const item of body.cases) {
      const existing = body.force ? null : await findDuplicate(user.id, item);
      if (existing) {
        skipped.push({ companyUrl: item.companyUrl, reason: "already prepared" });
        continue;
      }
      const document = await createKit(user.id, item);
      queue.enqueue(document._id.toString());
      created.push(toKitSummary(document));
    }

    response.status(202).json({ created, skipped });
  });

  router.get("/:id", async (request, response) => {
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    response.json({ kit: toKitDetail(document) });
  });

  router.delete("/:id", async (request, response) => {
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    queue.cancel(document._id.toString());
    await document.deleteOne();
    response.status(204).end();
  });

  router.post("/:id/retry", async (request, response) => {
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    if (document.status === "running" || document.status === "queued") {
      throw ApiError.conflict("ALREADY_RUNNING", "this kit is already generating");
    }
    document.status = "queued";
    document.error = null;
    await document.save();
    queue.enqueue(document._id.toString());
    response.status(202).json({ kit: toKitSummary(document) });
  });

  router.get("/:id/events", async (request, response) => {
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const kitId = document._id.toString();

    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    const send = (payload: unknown) => {
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    send({ type: "status", kitId, status: document.status, error: document.error });
    for (const event of document.events.slice(-20)) send({ type: "progress", kitId, event });

    const unsubscribe = queue.subscribe(kitId, send);
    const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 25_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  });

  router.patch("/:id/brief", async (request, response) => {
    const patch = parseBody(briefPatchSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = updateBrief(kit, state, patch);
    await persistKit(document, next.kit, next.state);
    response.json({ kit: toKitDetail(document) });
  });

  router.post("/:id/questions", async (request, response) => {
    const body = parseBody(questionCreateSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = addQuestion(kit, state, body);
    await persistKit(document, next.kit, next.state);
    response.status(201).json({ id: next.id, kit: toKitDetail(document) });
  });

  router.patch("/:id/questions/:questionId", async (request, response) => {
    const patch = parseBody(questionPatchSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = updateQuestion(kit, state, requireParam(request, "questionId"), patch);
    await persistKit(document, next.kit, next.state);
    response.json({ kit: toKitDetail(document) });
  });

  router.delete("/:id/questions/:questionId", async (request, response) => {
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = deleteQuestion(kit, state, requireParam(request, "questionId"));
    await persistKit(document, next.kit, next.state);
    response.json({ newGaps: next.newGaps, kit: toKitDetail(document) });
  });

  router.put("/:id/questions/order", async (request, response) => {
    const { ids } = parseBody(orderSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    await persistKit(document, reorderQuestions(kit, ids), state);
    response.json({ kit: toKitDetail(document) });
  });

  router.post("/:id/questions/:questionId/pin", async (request, response) => {
    const { pinned } = parseBody(pinSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = setItemPinned(state, "questions", requireParam(request, "questionId"), pinned);
    await persistKit(document, kit, next);
    response.json({ kit: toKitDetail(document) });
  });

  router.post("/:id/flashcards", async (request, response) => {
    const body = parseBody(flashcardCreateSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = addFlashcard(kit, state, body);
    await persistKit(document, next.kit, next.state);
    response.status(201).json({ id: next.id, kit: toKitDetail(document) });
  });

  router.patch("/:id/flashcards/:flashcardId", async (request, response) => {
    const patch = parseBody(flashcardPatchSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = updateFlashcard(kit, state, requireParam(request, "flashcardId"), patch);
    await persistKit(document, next.kit, next.state);
    response.json({ kit: toKitDetail(document) });
  });

  router.delete("/:id/flashcards/:flashcardId", async (request, response) => {
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = deleteFlashcard(kit, state, requireParam(request, "flashcardId"));
    await persistKit(document, next.kit, next.state);
    response.json({ kit: toKitDetail(document) });
  });

  router.put("/:id/flashcards/order", async (request, response) => {
    const { ids } = parseBody(orderSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    await persistKit(document, reorderFlashcards(kit, ids), state);
    response.json({ kit: toKitDetail(document) });
  });

  router.post("/:id/flashcards/:flashcardId/pin", async (request, response) => {
    const { pinned } = parseBody(pinSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const { kit, state } = requireReadyKit(document);
    const next = setItemPinned(state, "flashcards", requireParam(request, "flashcardId"), pinned);
    await persistKit(document, kit, next);
    response.json({ kit: toKitDetail(document) });
  });

  router.post("/:id/regenerate", async (request, response) => {
    const body = parseBody(regenerateSchema, request);
    const document = await loadOwnedKit(currentUser(request).id, requireParam(request, "id"));
    const outcome = await regenerateSection(document, llmFactory(), body);
    response.json({ ...outcome, kit: toKitDetail(document) });
  });

  return router;
}

async function findDuplicate(
  userId: string,
  input: { jobDescription: string; companyUrl: string },
) {
  return KitModel.findOne({
    userId,
    fingerprint: fingerprintFor(userId, input.jobDescription, input.companyUrl),
    status: { $ne: "failed" },
  });
}

async function createKit(
  userId: string,
  input: { jobDescription: string; companyUrl: string; daysAvailable: number },
) {
  let companyUrl: string;
  try {
    companyUrl = normalizeUrl(input.companyUrl).href;
  } catch {
    throw ApiError.badRequest("that company website address cannot be fetched");
  }

  return KitModel.create({
    userId,
    title: provisionalTitle(input.jobDescription, companyUrl),
    companyUrl,
    jobDescription: input.jobDescription,
    daysAvailable: input.daysAvailable,
    fingerprint: fingerprintFor(userId, input.jobDescription, input.companyUrl),
    status: "queued",
  });
}

export function provisionalTitle(jobDescription: string, companyUrl: string): string {
  const firstLine = jobDescription
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 2);
  const host = new URL(companyUrl).hostname.replace(/^www\./, "");
  return kitTitle(firstLine ? firstLine.slice(0, 80) : "Untitled role", host);
}
