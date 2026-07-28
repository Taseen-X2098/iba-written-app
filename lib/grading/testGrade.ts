/**
 * Run with: npx tsx lib/grading/testGrade.ts
 * (npm install -D tsx, if you don't already have a TS runner)
 *
 * No OPENAI_API_KEY needed — this exercises the whole grade() loop
 * (tool call -> get_rubric() -> tool output -> final text) against the
 * mock client instead of the real API.
 */
import { grade } from "./grade";
import { createMockClient } from "./mockClient";
import { getRubric } from "./tools";

async function main() {
  // 1. Sanity-check the rubric lookup itself, independent of the "model"
  console.log("--- getRubric('basic_paragraph', 5) ---");
  console.log(getRubric("basic_paragraph", 5));

  console.log("\n--- getRubric('basic_paragraph', 99) [expect an error] ---");
  console.log(getRubric("basic_paragraph", 99));

  // 2. Exercise the full grade() loop with a mock client
  console.log("\n--- grade() via mock client ---");
  const submission =
    "Cats make excellent pets because they are independent, clean, and affectionate on their own terms.";
  const client = createMockClient({ taskType: "basic_paragraph", marks: 5, submission });

  const result = await grade(client, submission, "basic_paragraph", 5);

  console.log("internal (tutor only):");
  console.log(JSON.stringify(result.internal, null, 2));
  console.log("\nstudentFeedback (safe to show the student):");
  console.log(JSON.stringify(result.studentFeedback, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});