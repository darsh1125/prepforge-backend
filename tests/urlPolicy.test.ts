import { describe, expect, it } from "vitest";
import { inspectUrlPolicy, isUrlAllowed } from "../src/core/retrieval/urlPolicy.js";

describe("URL retrieval policy", () => {
  it("allows public HTTPS URLs in production", () => {
    expect(isUrlAllowed("https://acme.example", "production")).toBe(true);
  });

  it("blocks loopback URLs in production", () => {
    const issues = inspectUrlPolicy("http://localhost:8099/acme/", "production");
    expect(issues.some((issue) => issue.code === "PRIVATE_ADDRESS_BLOCKED")).toBe(true);
    expect(isUrlAllowed("http://localhost:8099/acme/", "production")).toBe(false);
  });

  it("allows evaluator-provided localhost fixtures in evaluator mode only", () => {
    expect(isUrlAllowed("http://localhost:8099/acme/", "evaluator")).toBe(true);
  });

  it("rejects non-http(s) protocols in both modes", () => {
    expect(isUrlAllowed("file:///etc/passwd", "production")).toBe(false);
    expect(isUrlAllowed("file:///etc/passwd", "evaluator")).toBe(false);
  });
});
