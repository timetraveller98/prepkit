import { describe, expect, it } from "vitest";
import { buildSchedule, scheduleCoversRequirements, topicLabel } from "../src/pipeline/schedule.ts";
import { question, questionsFor, requirement, requirements } from "./helpers.ts";

describe("buildSchedule", () => {
  it("produces exactly the number of days requested", () => {
    const reqs = requirements(6);
    const questions = questionsFor(reqs);

    for (const days of [1, 2, 3, 5, 7, 14, 30, 60]) {
      const schedule = buildSchedule({ daysAvailable: days, requirements: reqs, questions });
      expect(schedule.days_available).toBe(days);
      expect(schedule.days).toHaveLength(days);
      expect(schedule.days.map((day) => day.day)).toEqual(
        Array.from({ length: days }, (_, index) => index + 1),
      );
    }
  });

  it("schedules every question when there are more days than questions", () => {
    const reqs = requirements(3);
    const questions = questionsFor(reqs);
    const schedule = buildSchedule({ daysAvailable: 60, requirements: reqs, questions });

    const scheduled = new Set(schedule.days.flatMap((day) => day.question_ids));
    expect([...scheduled].sort()).toEqual(["q1", "q2", "q3"]);
    expect(schedule.days.every((day) => day.question_ids.length > 0)).toBe(true);
  });

  it("schedules every question when there are more questions than days", () => {
    const reqs = requirements(12);
    const questions = questionsFor(reqs);
    const schedule = buildSchedule({ daysAvailable: 2, requirements: reqs, questions });

    const scheduled = schedule.days.flatMap((day) => day.question_ids);
    expect(new Set(scheduled).size).toBe(12);
  });

  it("puts every question on day one when only one day is available", () => {
    const reqs = requirements(5);
    const questions = questionsFor(reqs);
    const schedule = buildSchedule({ daysAvailable: 1, requirements: reqs, questions });

    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0]?.question_ids).toHaveLength(5);
    expect(schedule.days[0]?.minutes).toBeGreaterThan(0);
  });

  it("covers every must-have requirement", () => {
    const reqs = [
      requirement("r1", { priority: "must" }),
      requirement("r2", { priority: "nice" }),
      requirement("r3", { priority: "must", kind: "behavioural" }),
    ];
    const questions = questionsFor(reqs);
    const schedule = buildSchedule({ daysAvailable: 4, requirements: reqs, questions });

    expect(scheduleCoversRequirements(schedule, questions, reqs)).toEqual([]);
  });

  it("front-loads must-have and harder material", () => {
    const reqs = [requirement("r1", { priority: "nice" }), requirement("r2", { priority: "must" })];
    const questions = [
      question("q1", { requirement_ids: ["r1"], difficulty: 1 }),
      question("q2", { requirement_ids: ["r2"], difficulty: 3 }),
    ];
    const schedule = buildSchedule({ daysAvailable: 2, requirements: reqs, questions });

    expect(schedule.days[0]?.question_ids).toContain("q2");
    expect(schedule.days[1]?.question_ids).toContain("q1");
  });

  it("uses integer minutes everywhere", () => {
    const reqs = requirements(7);
    const questions = reqs.map((item, index) =>
      question(`q${index + 1}`, { requirement_ids: [item.id], difficulty: (index % 3) + 1 }),
    );

    for (const days of [1, 3, 9, 31]) {
      const schedule = buildSchedule({ daysAvailable: days, requirements: reqs, questions });
      for (const day of schedule.days) {
        expect(Number.isInteger(day.minutes)).toBe(true);
        expect(day.minutes).toBeGreaterThan(0);
      }
    }
  });

  it("still returns the requested days when there is nothing to study", () => {
    const schedule = buildSchedule({ daysAvailable: 3, requirements: [], questions: [] });

    expect(schedule.days).toHaveLength(3);
    expect(schedule.days.every((day) => day.question_ids.length === 0)).toBe(true);
    expect(schedule.days.every((day) => day.focus.length > 0)).toBe(true);
  });

  it("gives every day a non-empty focus", () => {
    const reqs = requirements(4);
    const schedule = buildSchedule({
      daysAvailable: 10,
      requirements: reqs,
      questions: questionsFor(reqs),
    });
    expect(schedule.days.every((day) => day.focus.trim().length > 0)).toBe(true);
  });
});

describe("topicLabel", () => {
  it("strips experience boilerplate", () => {
    expect(topicLabel("5+ years with React")).toBe("React");
    expect(topicLabel("Strong experience in distributed systems")).toBe("distributed systems");
    expect(topicLabel("Ability to mentor junior engineers")).toBe("mentor junior engineers");
  });
});
