/**
 * Daily activity tracking.
 *
 * UM students live in Malaysia time, so a "day" here starts at 00:00 UTC+8, not
 * at UTC midnight. Cloudflare's own quotas reset at UTC midnight; these stats
 * deliberately do not, because a dashboard that rolls over at 8am local time
 * looks broken.
 *
 * Cost: one row written per user per day. The in-isolate `touched` set means a
 * student who opens the Mini App ten times pays for one write and one read, not
 * ten of each.
 */

export const STATS_TZ_OFFSET_HOURS = 8;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Today's date in Malaysia time, as YYYY-MM-DD. */
export function statsDay(now = Date.now()): string {
  return new Date(now + STATS_TZ_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** The UTC instant at which the given Malaysia-time day starts. */
export function dayStartIso(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - STATS_TZ_OFFSET_HOURS * HOUR_MS).toISOString();
}

/** Adds (or subtracts) whole days from a YYYY-MM-DD string. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const touchedToday = new Set<string>();

/**
 * Records that a user opened the app today. Safe to call on every sign-in: only
 * the first call of the day reaches the database, and `INSERT OR IGNORE` keeps
 * it to one row even across isolates.
 *
 * Failures are logged and swallowed — losing an activity row must never break
 * sign-in.
 */
export async function touchDailyActivity(db: D1Database, userId: string, day = statsDay()): Promise<void> {
  const key = `${day}:${userId}`;
  if (touchedToday.has(key)) return;

  try {
    await db
      .prepare("INSERT OR IGNORE INTO user_activity (day, user_id) VALUES (?, ?)")
      .bind(day, userId)
      .run();
    touchedToday.add(key);
    // Bound the set so a long-lived isolate cannot grow without limit.
    if (touchedToday.size > 10_000) touchedToday.clear();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "user activity touch failed",
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
}
