import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnvConfig } from "@next/env";
import OpenAI from "openai";
import { grade, type GradingResult, type ResponsesClient } from "../lib/grading/grade";
import { requireGradingVectorStoreId } from "../lib/grading/config";
import { GRADING_EVALUATION_CASES } from "../evaluation/grading/cases";
import {
  PROPOSED_GRADES,
  type ProposedGrade,
} from "../evaluation/grading/proposed-grades";

const projectDir = process.cwd();
const reportPath = path.join(projectDir, "evaluation", "grading", "latest-report.json");

type EvaluationResult = {
  id: string;
  taskType: string;
  marks: number;
  expected: ProposedGrade;
} & (
  | {
      actual: GradingResult;
      comparison: {
        score: number;
        deltaFromTarget: number;
        withinAcceptableRange: boolean;
      };
    }
  | { error: string }
);

async function main() {
  loadEnvConfig(projectDir, true);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("Set OPENAI_API_KEY in .env.local before running the grading evaluation.");
  }

  const vectorStoreId = requireGradingVectorStoreId();
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const vectorStore = await client.vectorStores.retrieve(vectorStoreId);

  if (vectorStore.status !== "completed") {
    throw new Error(
      `Rubric vector store ${vectorStoreId} is not ready (status: ${vectorStore.status}).`
    );
  }

  if (vectorStore.file_counts.completed === 0) {
    throw new Error(`Rubric vector store ${vectorStoreId} contains no completed files.`);
  }

  const caseIds = new Set(GRADING_EVALUATION_CASES.map((item) => item.id));
  const missingProposals = [...caseIds].filter((id) => !PROPOSED_GRADES[id]);
  const orphanedProposals = Object.keys(PROPOSED_GRADES).filter((id) => !caseIds.has(id));
  if (missingProposals.length || orphanedProposals.length) {
    throw new Error(
      `Evaluation fixtures are out of sync. Missing: ${missingProposals.join(", ") || "none"}; orphaned: ${orphanedProposals.join(", ") || "none"}.`
    );
  }

  const results: EvaluationResult[] = [];
  for (const [index, testCase] of GRADING_EVALUATION_CASES.entries()) {
    const expected = PROPOSED_GRADES[testCase.id];
    process.stdout.write(
      `[${index + 1}/${GRADING_EVALUATION_CASES.length}] ${testCase.id} ... `
    );

    try {
      const actual = await grade(
        client as unknown as ResponsesClient,
        testCase.submission,
        testCase.taskType,
        testCase.marks,
        { rubricSource: { type: "file_search", vectorStoreId } }
      );
      const score = actual.internal.total;
      const withinRange =
        actual.internal.max === testCase.marks &&
        score >= expected.acceptableRange.min &&
        score <= expected.acceptableRange.max;

      results.push({
        id: testCase.id,
        taskType: testCase.taskType,
        marks: testCase.marks,
        expected,
        actual,
        comparison: {
          score,
          deltaFromTarget: Math.round((score - expected.targetScore) * 100) / 100,
          withinAcceptableRange: withinRange,
        },
      });
      process.stdout.write(`${score}/${testCase.marks} ${withinRange ? "PASS" : "REVIEW"}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: testCase.id,
        taskType: testCase.taskType,
        marks: testCase.marks,
        expected,
        error: message,
      });
      process.stdout.write(`ERROR: ${message}\n`);
    }
  }

  const completed = results.filter(
    (item): item is Extract<EvaluationResult, { comparison: unknown }> =>
      "comparison" in item
  );
  const withinRange = completed.filter(
    (item) => item.comparison.withinAcceptableRange
  ).length;
  const meanAbsoluteError = completed.length
    ? completed.reduce(
        (sum, item) => sum + Math.abs(item.comparison.deltaFromTarget),
        0
      ) / completed.length
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    model: "gpt-5.6-luna",
    rubricAccess: {
      type: "file_search",
      vectorStoreId,
      completedFiles: vectorStore.file_counts.completed,
    },
    summary: {
      totalCases: GRADING_EVALUATION_CASES.length,
      completedCases: completed.length,
      errorCases: results.length - completed.length,
      withinRange,
      outsideRange: completed.length - withinRange,
      meanAbsoluteError:
        meanAbsoluteError === null ? null : Math.round(meanAbsoluteError * 100) / 100,
    },
    results,
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nReport written to ${reportPath}`);
  console.log(
    `Summary: ${withinRange}/${completed.length} completed cases within the proposed bands; ${results.length - completed.length} errors.`
  );

  if (completed.length !== GRADING_EVALUATION_CASES.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
