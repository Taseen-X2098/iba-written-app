import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { drainGradingQueue } from "../lib/grading/jobs";
import { drainProgressionReportQueue } from "../lib/learning/report-jobs";
import { runRetentionNotificationCycle } from "../lib/notifications/retention";

const port = Number(process.env.PORT ?? 8080);
const workerId = process.env.RAILWAY_REPLICA_ID ?? `railway-${randomUUID()}`;
let running: Promise<void> | null = null;
let rerunRequested = false;
let retentionRunning: Promise<void> | null = null;
const configuredRetentionPollInterval = Number(process.env.RETENTION_POLL_INTERVAL_MS ?? 60_000);
const retentionPollInterval = Number.isFinite(configuredRetentionPollInterval)
  ? Math.max(15_000, configuredRetentionPollInterval)
  : 60_000;

function authorized(header: string | undefined) {
  const secret = process.env.GRADING_WORKER_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function wake() {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    do {
      rerunRequested = false;
      await drainGradingQueue({ workerId, batchSize: Number(process.env.GRADING_CONCURRENCY ?? 4) });
      await drainProgressionReportQueue({
        workerId: `${workerId}-progression`,
        batchSize: Number(process.env.PROGRESSION_REPORT_CONCURRENCY ?? 2),
      });
    } while (rerunRequested);
  })()
    .catch((error) => console.error("Worker drain failed", error))
    .finally(() => {
      running = null;
    });
  return running;
}

function wakeRetention() {
  if (retentionRunning) return retentionRunning;
  retentionRunning = runRetentionNotificationCycle({
    workerId: `${workerId}-retention`,
    batchSize: Number(process.env.RETENTION_NOTIFICATION_CONCURRENCY ?? 20),
  })
    .then((totals) => {
      if (totals.enqueued || totals.completed || totals.failed || totals.cancelled) {
        console.log("Retention notification cycle", totals);
      }
    })
    .catch((error) => console.error("Retention notification cycle failed", error))
    .finally(() => {
      retentionRunning = null;
    });
  return retentionRunning;
}

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      ok: true,
      gradingRunning: Boolean(running),
      retentionRunning: Boolean(retentionRunning),
    }));
    return;
  }
  if (request.method === "POST" && request.url === "/wake") {
    if (!authorized(request.headers.authorization)) {
      response.writeHead(401);
      response.end("Unauthorized");
      return;
    }
    void wake();
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify({ accepted: true, running: true }));
    return;
  }
  response.writeHead(404);
  response.end("Not found");
}).listen(port, () => {
  console.log(`Grading worker listening on ${port}`);
  void wake();
  void wakeRetention();
});

setInterval(() => void wakeRetention(), retentionPollInterval);
