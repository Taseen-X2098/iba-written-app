import { randomUUID } from "node:crypto";
import { finalizeDueAttempts } from "../lib/exams/finalize";
import { drainGradingQueue } from "../lib/grading/jobs";

const finalized = await finalizeDueAttempts(5_000);
const graded = await drainGradingQueue({
  workerId: `cron-${randomUUID()}`,
  batchSize: Number(process.env.GRADING_CONCURRENCY ?? 4),
});
console.log(JSON.stringify({ finalized, graded }));

