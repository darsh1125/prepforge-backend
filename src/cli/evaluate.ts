import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { validateEvaluatorBatch } from "./evaluator-input.js";
import { runEvaluatorCases } from "./evaluator-runner.js";
import { writeEvaluatorOutput, type EvaluatorOutput } from "./evaluator-output.js";

function usage(): string { return "Usage: npm run evaluate -- --input <cases.json> --output <kits.json>"; }

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { input: { type: "string" }, output: { type: "string" } }, strict: true });
  if (!values.input || !values.output) throw new Error(usage());
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(values.input, "utf8")) as unknown; }
  catch (error) { throw new Error(error instanceof Error && "code" in error && error.code === "ENOENT" ? `Input file not found: ${values.input}` : "Input file is not valid JSON."); }
  const inputs = validateEvaluatorBatch(parsed);
  console.error(`PrepForge evaluator: ${inputs.length} case${inputs.length === 1 ? "" : "s"}, concurrency 2`);
  const kits = await runEvaluatorCases(inputs, 2, (index, input, output) => console.error(`[${index + 1}/${inputs.length}] ${input.id}: ${output.status}`));
  const output: EvaluatorOutput = { version: "1.0", generated_at: new Date().toISOString(), kits };
  await writeEvaluatorOutput(values.output, output);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Evaluator failed."); process.exitCode = 1; });
