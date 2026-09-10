import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InterviewKit } from "../schemas/kit.js";
import type { EvaluatorCase } from "./evaluator-input.js";

export type EvaluatorCaseOutput = { id: string; status: "ok" | "failed"; kit: InterviewKit | null; error: { code: string; message: string } | null };
export type EvaluatorOutput = { version: "1.0"; generated_at: string; kits: EvaluatorCaseOutput[] };
export function successOutput(input: EvaluatorCase, kit: InterviewKit): EvaluatorCaseOutput { return { id: input.id, status: "ok", kit, error: null }; }
export function failureOutput(input: EvaluatorCase, code: string, message: string): EvaluatorCaseOutput { return { id: input.id, status: "failed", kit: null, error: { code, message } }; }
export async function writeEvaluatorOutput(path: string, output: EvaluatorOutput): Promise<void> { await mkdir(dirname(path), { recursive: true }); const temporary = join(dirname(path), `.${path.split(/[\\/]/).pop() ?? "kits.json"}.${process.pid}.tmp`); await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8"); await rename(temporary, path); }
