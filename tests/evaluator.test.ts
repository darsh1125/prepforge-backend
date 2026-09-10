import { describe, expect, it } from "vitest";
import { validateEvaluatorBatch, validateEvaluatorCases } from "../src/cli/evaluator-input.js";
import { runEvaluatorCases } from "../src/cli/evaluator-runner.js";
import { failureOutput, successOutput } from "../src/cli/evaluator-output.js";

describe("evaluator input contract", () => {
  it("preserves case IDs and accepts thin JDs and day boundaries", () => {
    const cases = validateEvaluatorCases([{ id: "case-01", jd: "Backend developer.\nNode.js required.", company_url: "http://localhost:8099/acme/", days: 1 }, { id: "case-02", jd: "React developer", company_url: "https://example.com", days: 60 }]);
    expect(cases.map((item) => item.id)).toEqual(["case-01", "case-02"]);
    expect(cases[0]?.jd).toContain("\n");
  });

  it("rejects duplicate or blank IDs", () => {
    expect(() => validateEvaluatorCases([{ id: "a", jd: "x", company_url: "https://example.com", days: 5 }, { id: "a", jd: "y", company_url: "https://example.com", days: 5 }])).toThrow("Duplicate case id");
    expect(() => validateEvaluatorCases([{ id: " ", jd: "x", company_url: "https://example.com", days: 5 }])).toThrow();
  });

  it("keeps identified invalid cases isolated", async () => {
    const batch = validateEvaluatorBatch([{ id: "bad", jd: "x", company_url: "https://example.com", days: 0 }, { id: "also-bad", jd: "x", company_url: "https://example.com", days: 0 }]);
    const output = await runEvaluatorCases(batch, 2);
    expect(output).toHaveLength(2);
    expect(output.every((item) => item.status === "failed")).toBe(true);
    expect(output.map((item) => item.id)).toEqual(["bad", "also-bad"]);
  });
});

describe("evaluator output contract", () => {
  const input = { id: "case-01", jd: "x", company_url: "https://example.com", days: 5 };
  it("emits exact outer status shapes", () => {
    expect(failureOutput(input, "INVALID_INPUT", "Invalid case")).toEqual({ id: "case-01", status: "failed", kit: null, error: { code: "INVALID_INPUT", message: "Invalid case" } });
    expect(successOutput(input, {} as never)).toEqual({ id: "case-01", status: "ok", kit: {}, error: null });
  });
});
