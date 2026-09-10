import { z } from "zod";

export const evaluatorCaseSchema = z.object({ id: z.string().min(1).refine((value) => value.trim().length > 0, "ID must not be blank"), jd: z.string().min(1).refine((value) => value.trim().length > 0, "jd must not be blank"), company_url: z.string().url().refine((value) => { const protocol = new URL(value).protocol; return protocol === "http:" || protocol === "https:"; }, "company_url must use HTTP or HTTPS"), days: z.number().int().min(1).max(60) }).strict();
export const evaluatorInputSchema = z.array(evaluatorCaseSchema);
export type EvaluatorCase = z.infer<typeof evaluatorCaseSchema>;

export type EvaluatorBatchCase = { id: string; input?: EvaluatorCase; error?: { code: string; message: string } };

export function validateEvaluatorBatch(value: unknown): EvaluatorBatchCase[] {
  if (!Array.isArray(value)) throw new Error("Input must be a JSON array of cases.");
  const ids = new Set<string>();
  const records: EvaluatorBatchCase[] = [];
  for (const item of value) {
    const candidateId = typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" ? item.id : "";
    if (!candidateId.trim()) throw new Error("Every case must have a non-empty id.");
    if (ids.has(candidateId)) throw new Error(`Duplicate case id: ${candidateId}`);
    ids.add(candidateId);
    const parsed = evaluatorCaseSchema.safeParse(item);
    records.push(parsed.success ? { id: candidateId, input: parsed.data } : { id: candidateId, error: { code: "INVALID_INPUT", message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") } });
  }
  return records;
}

export function validateEvaluatorCases(value: unknown): EvaluatorCase[] {
  const parsed = evaluatorInputSchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; "));
  const ids = new Set<string>();
  for (const item of parsed.data) { if (ids.has(item.id)) throw new Error(`Duplicate case id: ${item.id}`); ids.add(item.id); }
  return parsed.data;
}
