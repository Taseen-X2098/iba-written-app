import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const projectDir = process.cwd();
loadEnvConfig(projectDir, true);
const useMockRailway = process.env.USE_MOCK_RAILWAY === "true";

function positiveInteger(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    console.error(`[dev-stack] ${name} must be a positive integer.`);
    process.exit(1);
  }
  return parsed;
}

const workerPort = useMockRailway
  ? positiveInteger(process.env.LOCAL_GRADING_WORKER_PORT, 8080, "LOCAL_GRADING_WORKER_PORT")
  : 8080;
const workerSecret = process.env.GRADING_WORKER_SECRET
  || `local-${randomBytes(24).toString("base64url")}`;
const workerUrl = process.env.LOCAL_GRADING_WORKER_URL
  || `http://127.0.0.1:${workerPort}`;

const sharedEnv = {
  ...process.env,
  NODE_ENV: "development",
  GRADING_WORKER_SECRET: workerSecret,
  GRADING_WORKER_URL: workerUrl,
};
const webEnv = useMockRailway ? { ...sharedEnv } : { ...process.env };
const workerEnv = {
  ...sharedEnv,
  PORT: String(workerPort),
  RAILWAY_REPLICA_ID: process.env.LOCAL_RAILWAY_REPLICA_ID || "local-worker-1",
};

const children = new Set();
let shuttingDown = false;
let requestedExitCode = 0;

function maybeExit() {
  if (shuttingDown && children.size === 0) {
    process.exit(requestedExitCode);
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = exitCode;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  const forcedExit = setTimeout(() => process.exit(requestedExitCode), 3_000);
  forcedExit.unref();
  maybeExit();
}

function startProcess(name, args, env, { required = false } = {}) {
  console.log(`[dev-stack] Starting ${name}...`);
  const child = spawn(process.execPath, args, {
    cwd: projectDir,
    env,
    stdio: "inherit",
  });
  children.add(child);

  child.on("error", (error) => {
    console.error(`[dev-stack] ${name} failed to start:`, error);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);

    if (!shuttingDown && required) {
      console.error(
        `[dev-stack] ${name} stopped unexpectedly (${signal || `exit ${code ?? 1}`}).`,
      );
      shutdown(code || 1);
      return;
    }
    maybeExit();
  });

  return child;
}

startProcess(
  "Next.js web server",
  [path.join("node_modules", "next", "dist", "bin", "next"), "dev"],
  webEnv,
  { required: true },
);

if (useMockRailway) {
  console.log(`[dev-stack] USE_MOCK_RAILWAY=true; worker URL: ${workerUrl}`);
  if (!sharedEnv.UPSTASH_REDIS_REST_URL || !sharedEnv.UPSTASH_REDIS_REST_TOKEN) {
    console.warn(
      "[dev-stack] Upstash is not configured. The web and worker processes will not share the in-memory Redis fallback.",
    );
  }
  if (sharedEnv.USE_MOCK_GRADER !== "true" && !sharedEnv.OPENAI_API_KEY) {
    console.warn(
      "[dev-stack] Neither USE_MOCK_GRADER=true nor OPENAI_API_KEY is configured; grading jobs will fail.",
    );
  }

  startProcess(
    "grading worker",
    [
      "--require",
      path.join(projectDir, "scripts", "tsx-userinfo-shim.js"),
      "--import",
      "tsx",
      path.join("worker", "grading-worker.ts"),
    ],
    workerEnv,
    { required: true },
  );
  console.log("[dev-stack] Press Ctrl+C to stop the complete local stack.");
} else {
  console.log("[dev-stack] USE_MOCK_RAILWAY is not true; running Next.js only.");
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
