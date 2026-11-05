import "server-only";
import { connectToDatabase } from "@/lib/mongodb";
import { isDuplicateKeyError, RateLimitError } from "@/lib/errors";
import { RateLimitModel } from "@/models/rate-limit";

/**
 * Fixed-window rate limiting stored in MongoDB, so limits hold across all
 * serverless instances. Expired windows are removed by a TTL index.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  now = Date.now(),
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  await connectToDatabase();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowKey = `${key}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs);

  const increment = () =>
    RateLimitModel.findOneAndUpdate(
      { key: windowKey },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: "after" },
    ).lean();

  let doc;
  try {
    doc = await increment();
  } catch (error) {
    // Two first requests in the same window can race on the upsert.
    if (!isDuplicateKeyError(error)) throw error;
    doc = await increment();
  }

  const count = doc?.count ?? 1;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
  };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const result = await consumeRateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw new RateLimitError(message, result.retryAfterSeconds);
  return result;
}
