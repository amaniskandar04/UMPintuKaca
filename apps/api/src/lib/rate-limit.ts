import { AppError, RateLimitError } from "./errors";

export async function enforceRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const row = await db
    .prepare("SELECT window_start, count FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ window_start: number; count: number }>();

  if (row && row.window_start === windowStart) {
    if (row.count >= limit) throw new RateLimitError();
    await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
    return;
  }

  await db
    .prepare(
      "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1"
    )
    .bind(key, windowStart)
    .run();
}

export async function enforceDailyAndWeekly(
  db: D1Database,
  prefix: string,
  userId: string,
  dailyLimit: number,
  weeklyLimit: number
): Promise<void> {
  await enforceRateLimit(db, `${prefix}:day:${userId}`, dailyLimit, 86400);
  try {
    await enforceRateLimit(db, `${prefix}:week:${userId}`, weeklyLimit, 604800);
  } catch (error) {
    if (error instanceof AppError) throw new RateLimitError("Weekly limit reached. Please try again later.");
    throw error;
  }
}
