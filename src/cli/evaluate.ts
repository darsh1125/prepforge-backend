/**
 * Batch evaluator CLI.
 *
 * Intended usage:
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Generation is not implemented yet. This entry point exists so the
 * command surface is stable. It must not invent kits or claim success.
 */

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function main(): void {
  const input = readArg("--input");
  const output = readArg("--output");

  console.error("PrepForge evaluator is not implemented yet.");
  console.error("The future command remains:");
  console.error("  npm run evaluate -- --input <cases.json> --output <kits.json>");
  if (input) {
    console.error(`Received --input ${input}`);
  }
  if (output) {
    console.error(`Received --output ${output}`);
  }
  console.error("Both the API and this CLI will call the same generateKit() pipeline.");
  process.exitCode = 1;
}

main();
