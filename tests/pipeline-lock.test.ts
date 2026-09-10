import { describe, expect, it } from "vitest";
import { isActiveGeneration, isStaleGeneration } from "../src/core/pipeline/lock.js";

describe("generation lock policy", () => {
  it("recognizes active stages and blocks duplicate triggers", () => {
    expect(isActiveGeneration("generating_questions")).toBe(true);
    expect(isActiveGeneration("completed")).toBe(false);
  });

  it("allows stale runs to recover but protects fresh runs", () => {
    const now = "2026-09-10T00:15:00.000Z";
    expect(isStaleGeneration("2026-09-10T00:00:00.000Z", now, 15)).toBe(true);
    expect(isStaleGeneration("2026-09-10T00:10:00.000Z", now, 15)).toBe(false);
    expect(isStaleGeneration(undefined, now, 15)).toBe(true);
  });

  it("permits retry after a failed run", () => {
    expect(isActiveGeneration("failed")).toBe(false);
    expect(isActiveGeneration("completed_with_warnings")).toBe(false);
  });
});
