import { describe, expect, it } from "vitest";
import { computeCoverage, dropUnknownRequirementLinks } from "../src/pipeline/coverage.ts";
import { question, requirement } from "./helpers.ts";

const reqs = [
  requirement("r1", { priority: "must" }),
  requirement("r2", { priority: "must" }),
  requirement("r3", { priority: "nice" }),
];

describe("computeCoverage", () => {
  it("reports requirements with no question against them", () => {
    const report = computeCoverage(reqs, [question("q1", { requirement_ids: ["r1"] })]);

    expect(report.uncovered).toEqual(["r2", "r3"]);
    expect(report.uncoveredMust).toEqual(["r2"]);
    expect(report.uncoveredNice).toEqual(["r3"]);
    expect(report.byRequirement.r1).toEqual(["q1"]);
  });

  it("ignores links to requirements that do not exist", () => {
    const report = computeCoverage(reqs, [question("q1", { requirement_ids: ["r9"] })]);

    expect(report.uncoveredMust).toEqual(["r1", "r2"]);
    expect(report.orphanQuestionIds).toEqual(["q1"]);
  });

  it("counts a question against every requirement it names", () => {
    const report = computeCoverage(reqs, [question("q1", { requirement_ids: ["r1", "r2", "r3"] })]);

    expect(report.uncovered).toEqual([]);
  });

  it("treats a question with no links as covering nothing", () => {
    const report = computeCoverage(reqs, [question("q1")]);

    expect(report.uncovered).toEqual(["r1", "r2", "r3"]);
    expect(report.orphanQuestionIds).toEqual(["q1"]);
  });

  it("strips unknown requirement links so a saved kit stays referentially sound", () => {
    const cleaned = dropUnknownRequirementLinks(reqs, [
      question("q1", { requirement_ids: ["r1", "r42"] }),
    ]);

    expect(cleaned[0]?.requirement_ids).toEqual(["r1"]);
  });
});
