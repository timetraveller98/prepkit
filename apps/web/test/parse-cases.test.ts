import { describe, expect, it } from "vitest";
import { parseCaseFile, parseCsv } from "../lib/parse-cases";

const POSTING = "Senior Backend Engineer. We need Node.js and PostgreSQL experience.";

describe("parseCaseFile with JSON", () => {
  it("reads the same shape the batch command takes", () => {
    const result = parseCaseFile(
      "cases.json",
      JSON.stringify([{ id: "case-01", jd: POSTING, company_url: "https://acme.test", days: 5 }]),
    );

    expect(result.problems).toEqual([]);
    expect(result.cases).toEqual([
      { jobDescription: POSTING, companyUrl: "https://acme.test", daysAvailable: 5 },
    ]);
  });

  it("accepts the camelCase spelling the interface uses", () => {
    const result = parseCaseFile(
      "cases.json",
      JSON.stringify([
        { jobDescription: POSTING, companyUrl: "https://acme.test", daysAvailable: 3 },
      ]),
    );

    expect(result.cases[0]?.daysAvailable).toBe(3);
  });

  it("defaults a missing day count rather than rejecting the row", () => {
    const result = parseCaseFile(
      "cases.json",
      JSON.stringify([{ jd: POSTING, company_url: "https://acme.test" }]),
    );

    expect(result.cases[0]?.daysAvailable).toBe(5);
  });

  it("clamps a day count that is out of range", () => {
    const result = parseCaseFile(
      "cases.json",
      JSON.stringify([
        { jd: POSTING, company_url: "https://a.test", days: 900 },
        { jd: POSTING, company_url: "https://b.test", days: 0 },
      ]),
    );

    expect(result.cases.map((entry) => entry.daysAvailable)).toEqual([90, 1]);
  });

  it("reports the rows it skipped and keeps the rest", () => {
    const result = parseCaseFile(
      "cases.json",
      JSON.stringify([
        { jd: "too short", company_url: "https://acme.test", days: 5 },
        { jd: POSTING, company_url: "", days: 5 },
        { jd: POSTING, company_url: "https://acme.test", days: 5 },
      ]),
    );

    expect(result.cases).toHaveLength(1);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toMatch(/Row 1/);
    expect(result.problems[1]).toMatch(/Row 2/);
  });

  it("rejects a file that is not an array of cases", () => {
    expect(parseCaseFile("cases.json", "{}").problems[0]).toMatch(/array/i);
    expect(parseCaseFile("cases.json", "not json").problems[0]).toMatch(/valid JSON/i);
    expect(parseCaseFile("cases.json", "   ").problems[0]).toMatch(/empty/i);
  });
});

describe("parseCaseFile with CSV", () => {
  it("reads a header row and its columns in any supported spelling", () => {
    const result = parseCaseFile(
      "cases.csv",
      `jd,company_url,days\n"${POSTING}",https://acme.test,7\n`,
    );

    expect(result.cases).toEqual([
      { jobDescription: POSTING, companyUrl: "https://acme.test", daysAvailable: 7 },
    ]);
  });

  it("keeps a posting that contains commas and newlines inside quotes", () => {
    const posting =
      "Backend Engineer\n\nRequirements:\n- Node.js, PostgreSQL, and Redis experience";
    const result = parseCaseFile("cases.csv", `description,url\n"${posting}",https://acme.test\n`);

    expect(result.cases[0]?.jobDescription).toBe(posting);
  });

  it("unescapes a doubled quote", () => {
    const result = parseCaseFile(
      "cases.csv",
      `jd,url\n"They call it ""the platform"". ${POSTING}",https://acme.test\n`,
    );

    expect(result.cases[0]?.jobDescription).toContain('"the platform"');
  });

  it("refuses a CSV without the columns it needs", () => {
    const result = parseCaseFile("cases.csv", "role,salary\nEngineer,100\n");
    expect(result.cases).toEqual([]);
    expect(result.problems[0]).toMatch(/needs a job description column/i);
  });

  it("numbers skipped rows from the header, so they match the file", () => {
    const result = parseCaseFile(
      "cases.csv",
      `jd,url\n"${POSTING}",https://acme.test\nshort,https://b.test\n`,
    );

    expect(result.cases).toHaveLength(1);
    expect(result.problems[0]).toMatch(/Row 3/);
  });
});

describe("parseCsv", () => {
  it("handles quotes, embedded separators and blank lines", () => {
    expect(parseCsv('a,b\n"one,two",three\n\n"line\nbreak",four\n')).toEqual([
      ["a", "b"],
      ["one,two", "three"],
      ["line\nbreak", "four"],
    ]);
  });
});
