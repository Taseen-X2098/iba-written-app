import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { drainGradingQueue } from "../lib/grading/jobs";
import { finalizeDueAttempts } from "../lib/exams/finalize";

const port = Number(process.env.PORT ?? 8080);
const workerId = process.env.RAILWAY_REPLICA_ID ?? `railway-${randomUUID()}`;
let running: Promise<void> | null = null;

function authorized(header: string | undefined) {
  const secret = process.env.GRADING_WORKER_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function wake() {
  if (running) return running;
  running = (async () => {
    await finalizeDueAttempts();
    await drainGradingQueue({ workerId, batchSize: Number(process.env.GRADING_CONCURRENCY ?? 4) });
  })()
    .catch((error) => console.error("Worker drain failed", error))
    .finally(() => {
      running = null;
    });
  return running;
}

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, running: Boolean(running) }));
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
});

