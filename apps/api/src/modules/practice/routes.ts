import {
  type Confidence,
  computeReadiness,
  newReviewRecord,
  orderNextSession,
  practiceProgress,
  type ReviewRecord,
  reviewCard,
} from "@prepkit/core";
import { Router } from "express";
import { z } from "zod";
import { ReviewModel } from "../../db/models/review.ts";
import { ApiError } from "../../http/errors.ts";
import { parseBody, requireParam } from "../../http/validate.ts";
import { currentUser, requireUser } from "../auth/session.ts";
import { loadOwnedKit, requireReadyKit } from "../kits/service.ts";

const gradeSchema = z.object({
  confidence: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});
const sessionQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(60).default(20) });

export function createPracticeRouter(): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/:id/practice", async (request, response) => {
    const user = currentUser(request);
    const document = await loadOwnedKit(user.id, requireParam(request, "id"));
    const { kit } = requireReadyKit(document);
    const { limit } = sessionQuerySchema.parse(request.query);

    const records = await loadRecords(user.id, document._id.toString());
    const session = orderNextSession(kit.flashcards, records, { limit });

    response.json({
      session: session.map((entry) => ({
        flashcard: entry.flashcard,
        record: entry.record,
        overdue: Number.isFinite(entry.overdueMs) ? entry.overdueMs > 0 : true,
      })),
      progress: practiceProgress(kit.flashcards, records),
    });
  });

  router.post("/:id/practice/:flashcardId", async (request, response) => {
    const { confidence } = parseBody(gradeSchema, request);
    const user = currentUser(request);
    const document = await loadOwnedKit(user.id, requireParam(request, "id"));
    const { kit } = requireReadyKit(document);
    const flashcardId = requireParam(request, "flashcardId");

    if (!kit.flashcards.some((flashcard) => flashcard.id === flashcardId)) {
      throw ApiError.notFound("no flashcard with that id in this kit");
    }

    const kitId = document._id.toString();
    const existing = await ReviewModel.findOne({ kitId, flashcardId });
    const current = existing ? toReviewRecord(existing) : newReviewRecord(flashcardId);
    const next = reviewCard(current, confidence as Confidence, {
      maxIntervalDays: Math.max(1, kit.schedule.days_available),
    });

    await ReviewModel.updateOne(
      { kitId, flashcardId },
      {
        $set: {
          userId: user.id,
          kitId,
          flashcardId,
          repetitions: next.repetitions,
          intervalDays: next.intervalDays,
          ease: next.ease,
          lastConfidence: next.lastConfidence,
          lastReviewedAt: next.lastReviewedAt ? new Date(next.lastReviewedAt) : null,
          dueAt: new Date(next.dueAt),
        },
      },
      { upsert: true },
    );

    const records = await loadRecords(user.id, kitId);
    response.json({ record: next, progress: practiceProgress(kit.flashcards, records) });
  });

  router.post("/:id/practice/reset", async (request, response) => {
    const user = currentUser(request);
    const document = await loadOwnedKit(user.id, requireParam(request, "id"));
    await ReviewModel.deleteMany({ kitId: document._id.toString() });
    response.status(204).end();
  });

  router.get("/:id/readiness", async (request, response) => {
    const user = currentUser(request);
    const document = await loadOwnedKit(user.id, requireParam(request, "id"));
    const { kit } = requireReadyKit(document);
    const records = await loadRecords(user.id, document._id.toString());
    response.json({ readiness: computeReadiness(kit, records) });
  });

  return router;
}

async function loadRecords(userId: string, kitId: string): Promise<ReviewRecord[]> {
  const documents = await ReviewModel.find({ userId, kitId }).lean();
  return documents.map(toReviewRecord);
}

function toReviewRecord(document: {
  flashcardId: string;
  repetitions: number;
  intervalDays: number;
  ease: number;
  lastConfidence: number | null;
  lastReviewedAt: Date | null;
  dueAt: Date;
}): ReviewRecord {
  return {
    flashcardId: document.flashcardId,
    repetitions: document.repetitions,
    intervalDays: document.intervalDays,
    ease: document.ease,
    lastConfidence: (document.lastConfidence ?? null) as Confidence | null,
    lastReviewedAt: document.lastReviewedAt ? document.lastReviewedAt.toISOString() : null,
    dueAt: document.dueAt.toISOString(),
  };
}
