import { ApiError } from "@/lib/api/errors";
import { getRedis } from "@/lib/redis";

const OCR_REQUESTS_PER_MINUTE = 12;
const UNCACHED_OCR_REQUESTS_PER_DAY = 100;

export async function enforceOcrRateLimit(userId: string): Promise<void> {
  const redis = getRedis();
  const window = Math.floor(Date.now() / 60_000);
  const key = `rate:ocr:${userId}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 70);
  if (count > OCR_REQUESTS_PER_MINUTE) {
    throw new ApiError(
      "RATE_LIMITED",
      "Too many OCR requests. Wait a minute before trying again.",
      429,
    );
  }
}

export async function enforceOcrDailyProviderLimit(userId: string): Promise<void> {
  const redis = getRedis();
  const day = new Date().toISOString().slice(0, 10);
  const key = `rate:ocr:provider:${userId}:${day}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 90_000);
  if (count > UNCACHED_OCR_REQUESTS_PER_DAY) {
    throw new ApiError(
      "OCR_LIMIT_REACHED",
      "The daily OCR safety limit has been reached. Try again tomorrow or contact support if this was legitimate exam work.",
      429,
    );
  }
}
