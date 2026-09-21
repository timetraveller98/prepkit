import { describe, expect, it } from "vitest";
import { extractJson, JsonRecoveryError } from "../src/llm/json.ts";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON inside a markdown fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses JSON wrapped in commentary", () => {
    expect(extractJson('Sure! Here is the result:\n{"a":[1,2]}\nHope that helps.')).toEqual({
      a: [1, 2],
    });
  });

  it("repairs trailing commas", () => {
    expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it("does not mistake a brace inside a string for structure", () => {
    expect(extractJson('{"a":"} not the end {","b":2}')).toEqual({ a: "} not the end {", b: 2 });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(JsonRecoveryError);
  });
});
