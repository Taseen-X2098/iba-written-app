import { Redis } from "@upstash/redis";

/**
 * Upstash Redis client — serverless, works on Netlify functions.
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
    redis = new Redis({
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
    set: async (key: string, value: unknown, options?: { ex?: number }) => {
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
  /** In-progress exam answer */
  examDraft: (examId: string, userId: string, questionId: string) =>
    `exam:${examId}:submission:${userId}:${questionId}`,

  /** In-progress single test answer */
  testDraft: (userId: string, questionId: string) =>
    `test:draft:${userId}:${questionId}`,

  /** Cached leaderboard for an exam */
  leaderboard: (examId: string) => `leaderboard:${examId}`,

  /** All draft keys for a user in an exam (pattern for scanning) */
  examDraftPattern: (examId: string, userId: string) =>
    `exam:${examId}:submission:${userId}:*`,
} as const;

// ─── TTL Constants ──────────────────────────────────────────────────────────

export const CacheTTL = {
  /** Single test drafts expire after 1 day */
  TEST_DRAFT: 86400, // 24 hours in seconds

  /** Leaderboard cache: 1 hour (re-cached on first hit after invalidation) */
  LEADERBOARD: 3600,
} as const;
