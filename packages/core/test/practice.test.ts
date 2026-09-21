import { describe, expect, it } from "vitest";
import type { Flashcard } from "../src/kit.ts";
import {
  newReviewRecord,
  orderNextSession,
  practiceProgress,
  reviewCard,
} from "../src/practice.ts";

const card = (id: string): Flashcard => ({ id, front: id, back: id, requirement_ids: ["r1"] });
const now = new Date("2026-09-21T09:00:00.000Z");

describe("reviewCard", () => {
  it("brings a forgotten card back within the hour", () => {
    const record = reviewCard(newReviewRecord("f1", now), 0, { now });
    expect(record.intervalDays).toBe(0);
    expect(Date.parse(record.dueAt) - now.getTime()).toBeLessThanOrEqual(15 * 60_000);
    expect(record.repetitions).toBe(0);
  });

  it("stretches the interval as confidence holds", () => {
    let record = newReviewRecord("f1", now);
    const intervals: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      record = reviewCard(record, 2, { now, maxIntervalDays: 60 });
      intervals.push(record.intervalDays);
    }
    expect(intervals).toEqual([...intervals].sort((a, b) => a - b));
    expect(intervals.at(-1)).toBeGreaterThan(intervals[0] ?? 0);
  });

  it("never schedules past the interview", () => {
    let record = newReviewRecord("f1", now);
    for (let index = 0; index < 6; index += 1)
      record = reviewCard(record, 3, { now, maxIntervalDays: 4 });
    expect(record.intervalDays).toBeLessThanOrEqual(4);
  });

  it("lowers ease when a card keeps being hard and raises it when it is easy", () => {
    const hard = reviewCard(newReviewRecord("f1", now), 1, { now });
    const easy = reviewCard(newReviewRecord("f2", now), 3, { now });
    expect(hard.ease).toBeLessThan(2.5);
    expect(easy.ease).toBeGreaterThan(2.5);
  });
});

describe("orderNextSession", () => {
  it("puts never-seen cards first, then the least confident", () => {
    const cards = [card("f1"), card("f2"), card("f3")];
    const records = [
      reviewCard(newReviewRecord("f1", now), 3, { now }),
      reviewCard(newReviewRecord("f2", now), 1, { now }),
    ];

    const ordered = orderNextSession(cards, records, { now });
    expect(ordered.map((entry) => entry.flashcard.id)).toEqual(["f3", "f2", "f1"]);
  });

  it("respects the session limit", () => {
    const cards = [card("f1"), card("f2"), card("f3")];
    expect(orderNextSession(cards, [], { now, limit: 2 })).toHaveLength(2);
  });
});

describe("practiceProgress", () => {
  it("separates what has been covered from what has not", () => {
    const cards = [card("f1"), card("f2"), card("f3")];
    const records = [
      reviewCard(newReviewRecord("f1", now), 3, { now }),
      reviewCard(newReviewRecord("f2", now), 0, { now }),
    ];

    const progress = practiceProgress(cards, records, now);
    expect(progress.total).toBe(3);
    expect(progress.seen).toBe(2);
    expect(progress.confident).toBe(1);
    expect(progress.due).toBe(1);

    const quarterHourLater = new Date(now.getTime() + 15 * 60_000);
    expect(practiceProgress(cards, records, quarterHourLater).due).toBe(2);
  });
});
