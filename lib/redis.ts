import type { Redis } from "@upstash/redis";

/**
 * Upstash Redis client — serverless, works from Next.js and Railway workers.
 *
 * When UPSTASH_REDIS_REST_URL is not set (local dev without Redis),
 * falls back to an in-memory Map so the app doesn't crash. The fallback
 * is single-process and non-persistent — fine for dev, not for prod.
 */

let redis: Redis | null = null;
let memoryStore: Map<string, { value: string; expiresAt: number | null }> | null = null;

function getRedis(): Redis {
  if (redis) return redis;

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    // Keep the network client lazy. Local development and Jest use the memory
    // implementation without evaluating Upstash's ESM-only crypto dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis: UpstashRedis } = require("@upstash/redis") as typeof import("@upstash/redis");
    redis = new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return redis;
  }

  // Fallback: in-memory mock for dev
  console.warn("[Redis] No UPSTASH_REDIS_REST_URL — using in-memory fallback");
  return createMemoryFallback();
}

function getMemoryStore() {
  if (!memoryStore) memoryStore = new Map();
  return memoryStore;
}

function createMemoryFallback(): Redis {
  const store = getMemoryStore();

  return {
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      try {
        return JSON.parse(entry.value);
      } catch {
        return entry.value;
      }
    },
    set: async (key: string, value: unknown, options?: { ex?: number; nx?: boolean }) => {
      if (options?.nx) {
        const existing = store.get(key);
        if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) {
          return null;
        }
      }
      const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : null;
      store.set(key, { value: JSON.stringify(value), expiresAt });
      return "OK";
    },
    del: async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
      }
      return count;
    },
    exists: async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        const entry = store.get(key);
        if (entry) {
          if (entry.expiresAt && Date.now() > entry.expiresAt) {
            store.delete(key);
          } else {
            count++;
          }
        }
      }
      return count;
    },
    expire: async (key: string, seconds: number) => {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    ttl: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return -2;
      if (!entry.expiresAt) return -1;
      const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
      if (remaining <= 0) {
        store.delete(key);
        return -2;
      }
      return remaining;
    },
    keys: async (pattern: string) => {
      const matched = [];
      const regexStr = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexStr}$`);
      for (const [key, entry] of store.entries()) {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          store.delete(key);
          continue;
        }
        if (regex.test(key)) {
          matched.push(key);
        }
      }
      return matched;
    },
  } as unknown as Redis;
}

export { getRedis };

// ─── Cache Key Conventions ──────────────────────────────────────────────────
// Centralized so nothing drifts.

export const CacheKeys = {
  /** All acknowledged drafts for a durable attempt, stored as one document. */
  attemptDrafts: (attemptId: string) => `attempt:${attemptId}:drafts`,

  /** Practice grading results retained for reloads. */
  attemptResults: (attemptId: string) => `attempt:${attemptId}:results`,

  /** In-progress exam answer */
  examDraft: (examId: string, userId: string, questionId: string) =>
    `exam:${examId}:submission:${userId}:${questionId}`,

  /** In-progress practice exam answer */
  practiceExamDraft: (examId: string, userId: string, questionId: string) =>
    `practice:exam:${examId}:submission:${userId}:${questionId}`,

  /** In-progress single test answer */
  testDraft: (userId: string, questionId: string) =>
    `test:draft:${userId}:${questionId}`,

  /** Cached leaderboard for an exam */
  leaderboard: (examId: string, version = 0, page = 1) =>
    `leaderboard:${examId}:v${version}:p${page}`,

  /** All draft keys for a user in an exam (pattern for scanning) */
  examDraftPattern: (examId: string, userId: string) =>
    `exam:${examId}:submission:${userId}:*`,

  /** All draft keys for a user in a practice exam (pattern for scanning) */
  practiceExamDraftPattern: (examId: string, userId: string) =>
    `practice:exam:${examId}:submission:${userId}:*`,
} as const;

// ─── TTL Constants ──────────────────────────────────────────────────────────

export const CacheTTL = {
  /** Single test drafts expire after 48 hours to match exam start TTL */
  TEST_DRAFT: 172800, // 48 hours in seconds

  /** Durable attempt drafts/results outlive the three-minute submission grace. */
  ATTEMPT: 172800,

  /** Leaderboard cache: 1 hour (re-cached on first hit after invalidation) */
  LEADERBOARD: 3600,
} as const;
