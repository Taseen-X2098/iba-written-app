import { ApiError } from "@/lib/api/api-error";
import { getRedis } from "@/lib/redis";

export async function enforceRateLimit(options: {
  key: string;
  limit: number;
  windowSeconds: number;
  message?: string;
}) {
  const redis = getRedis();
  const window = Math.floor(Date.now() / (options.windowSeconds * 1_000));
  const key = `rate:${options.key}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, options.windowSeconds + 10);
  if (count > options.limit) {
    throw new ApiError(
      "RATE_LIMITED",
      options.message ?? "Too many requests. Please try again shortly.",
      429,
    );
  }
}
