import type { Env } from "../env";
import { randomId } from "./crypto";
import { AppError } from "./errors";
import { sendTelegramMessage } from "./notify";

/**
 * Broadcasts go through a small D1 outbox instead of a single fan-out loop:
 * a Worker invocation may only make 50 external subrequests on the free plan
 * and Telegram throttles a bot to roughly 30 messages per second. Each cron
 * tick claims a bounded batch, records per-recipient outcomes, and moves on.
 */

/** Keep a batch small enough that Telegram fetches plus D1 calls stay well under
 * the free-plan subrequest limit, and under the 6 simultaneous connection cap. */
const DEFAULT_BATCH_SIZE = 25;
const SEND_CONCURRENCY = 5;
/** A claim older than this is assumed to belong to a crashed invocation. */
const STALE_CLAIM_MINUTES = 10;

type RecipientStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

interface Outcome {
  userId: string;
  status: RecipientStatus;
  error?: string | null;
}

export interface BroadcastRow {
  id: string;
  message: string;
  created_by: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export const BROADCAST_AUDIENCE_SQL =
  "deleted_at IS NULL AND status = 'active' AND telegram_id > 0 AND role <> 'admin'";

function batchSize(env: Env): number {
  const configured = Number(env.BROADCAST_BATCH_SIZE);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(40, Math.floor(configured));
}

export async function countBroadcastAudience(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE ${BROADCAST_AUDIENCE_SQL}`)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function listBroadcasts(db: D1Database, limit = 20): Promise<BroadcastRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, message, created_by, status, recipient_count, sent_count, failed_count,
              skipped_count, created_at, updated_at, finished_at
       FROM broadcasts ORDER BY created_at DESC LIMIT ?`
    )
    .bind(limit)
    .all<BroadcastRow>();
  return rows.results;
}

export async function createBroadcast(
  env: Env,
  message: string,
  createdBy: string,
  testRecipientId?: string
): Promise<{ broadcast: BroadcastRow; recipientCount: number }> {
  const id = randomId();
  const now = new Date().toISOString();

  if (testRecipientId) {
    // A test sends only to the admin who asked for it, bypassing the audience
    // filter so it works even from a dev-bypass account.
    const admin = await env.DB.prepare("SELECT telegram_id FROM users WHERE id = ? AND deleted_at IS NULL")
      .bind(testRecipientId)
      .first<{ telegram_id: number }>();
    if (!admin || admin.telegram_id <= 0) {
      throw new AppError(400, "Your account has no Telegram chat to send a test to", "NO_TELEGRAM_CHAT");
    }

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO broadcasts
           (id, message, created_by, status, recipient_count, sent_count, failed_count,
            skipped_count, created_at, updated_at, finished_at)
         VALUES (?, ?, ?, 'queued', 1, 0, 0, 0, ?, ?, NULL)`
      ).bind(id, message, createdBy, now, now),
      env.DB.prepare(
        `INSERT INTO broadcast_recipients (broadcast_id, user_id, status, attempts, error, updated_at)
         VALUES (?, ?, 'pending', 0, NULL, ?)`
      ).bind(id, testRecipientId, now)
    ]);

    const result = await env.DB.prepare(
      `SELECT id, message, created_by, status, recipient_count, sent_count, failed_count,
              skipped_count, created_at, updated_at, finished_at
       FROM broadcasts WHERE id = ?`
    )
      .bind(id)
      .first<BroadcastRow>();
    if (!result) throw new Error("Could not create the test broadcast");
    return { broadcast: result, recipientCount: 1 };
  }

  const audience = await countBroadcastAudience(env.DB);
  if (audience === 0) throw new AppError(400, "There are no active users with a Telegram chat", "NO_AUDIENCE");

  const inserted = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO broadcasts
         (id, message, created_by, status, recipient_count, sent_count, failed_count,
          skipped_count, created_at, updated_at, finished_at)
       VALUES (?, ?, ?, 'queued', ?, 0, 0, 0, ?, ?, NULL)`
    ).bind(id, message, createdBy, audience, now, now),
    env.DB.prepare(
      `INSERT INTO broadcast_recipients (broadcast_id, user_id, status, attempts, error, updated_at)
       SELECT ?, id, 'pending', 0, NULL, ? FROM users WHERE ${BROADCAST_AUDIENCE_SQL}`
    ).bind(id, now)
  ]);

  // The audience can move between the count and the insert (deletion, role
  // change), so trust the number of rows actually queued.
  const recipientCount = inserted[1]?.meta?.changes ?? audience;
  if (recipientCount !== audience) {
    await env.DB.prepare("UPDATE broadcasts SET recipient_count = ? WHERE id = ?")
      .bind(recipientCount, id)
      .run();
  }

  const result = await env.DB.prepare(
    `SELECT id, message, created_by, status, recipient_count, sent_count, failed_count,
            skipped_count, created_at, updated_at, finished_at
     FROM broadcasts WHERE id = ?`
  )
    .bind(id)
    .first<BroadcastRow>();
  if (!result) throw new Error("Could not create the broadcast");
  return { broadcast: result, recipientCount };
}

/**
 * Deliver one bounded batch of the oldest unfinished broadcast. Safe to call
 * from the cron tick and immediately after an admin creates a broadcast.
 */
export async function drainBroadcastQueue(env: Env): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;

  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60000).toISOString();
  await env.DB.prepare(
    "UPDATE broadcast_recipients SET status = 'pending', updated_at = ? WHERE status = 'sending' AND updated_at < ?"
  )
    .bind(now, staleCutoff)
    .run();

  const broadcast = await env.DB.prepare(
    `SELECT id, message, status FROM broadcasts
     WHERE status IN ('queued', 'sending') ORDER BY created_at ASC LIMIT 1`
  ).first<{ id: string; message: string; status: string }>();
  if (!broadcast) return;

  if (broadcast.status === "queued") {
    await env.DB.prepare("UPDATE broadcasts SET status = 'sending', updated_at = ? WHERE id = ?")
      .bind(now, broadcast.id)
      .run();
  }

  const limit = batchSize(env);
  const pending = await env.DB.prepare(
    `SELECT user_id FROM broadcast_recipients
     WHERE broadcast_id = ? AND status = 'pending' ORDER BY user_id LIMIT ?`
  )
    .bind(broadcast.id, limit)
    .all<{ user_id: string }>();

  if (pending.results.length === 0) {
    await finalizeIfComplete(env, broadcast.id);
    return;
  }

  // Claim the rows conditionally so a slow neighboring invocation cannot send
  // the same message twice.
  const claims = await env.DB.batch(
    pending.results.map((row) =>
      env.DB.prepare(
        `UPDATE broadcast_recipients SET status = 'sending', attempts = attempts + 1, updated_at = ?
         WHERE broadcast_id = ? AND user_id = ? AND status = 'pending'`
      ).bind(now, broadcast.id, row.user_id)
    )
  );
  const claimed = pending.results
    .map((row, index) => ({ userId: row.user_id, changed: (claims[index]?.meta?.changes ?? 0) > 0 }))
    .filter((entry) => entry.changed)
    .map((entry) => entry.userId);

  if (claimed.length === 0) return;

  const placeholders = claimed.map(() => "?").join(",");
  const users = await env.DB.prepare(
    `SELECT id, telegram_id FROM users
     WHERE id IN (${placeholders}) AND deleted_at IS NULL AND status = 'active' AND telegram_id > 0`
  )
    .bind(...claimed)
    .all<{ id: string; telegram_id: number }>();
  const chatIds = new Map(users.results.map((row) => [row.id, row.telegram_id]));

  const outcomes: Outcome[] = [];
  const queue = [...claimed];
  const messageText = broadcast.message;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped) {
      const userId = queue.shift();
      if (!userId) return;
      const chatId = chatIds.get(userId);
      if (!chatId) {
        outcomes.push({ userId, status: "skipped", error: "User is no longer reachable" });
        continue;
      }

      const result = await sendTelegramMessage(env, chatId, messageText);
      if (result.ok) {
        outcomes.push({ userId, status: "sent" });
        continue;
      }
      if (result.status === 429) {
        // Telegram asked us to back off. Release this recipient and let the
        // next tick continue from here rather than hammering the API.
        stopped = true;
        outcomes.push({ userId, status: "pending", error: result.error });
        return;
      }
      outcomes.push({ userId, status: "failed", error: result.error });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SEND_CONCURRENCY, claimed.length) }, () => worker())
  );

  const settled = new Set(outcomes.map((outcome) => outcome.userId));
  for (const userId of claimed) {
    if (!settled.has(userId)) outcomes.push({ userId, status: "pending", error: null });
  }

  await env.DB.batch(
    outcomes.map((outcome) =>
      env.DB.prepare(
        `UPDATE broadcast_recipients SET status = ?, error = ?, updated_at = ?
         WHERE broadcast_id = ? AND user_id = ? AND status = 'sending'`
      ).bind(outcome.status, outcome.error ?? null, now, broadcast.id, outcome.userId)
    )
  );

  const sent = outcomes.filter((outcome) => outcome.status === "sent").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length;
  await env.DB.prepare(
    `UPDATE broadcasts
     SET sent_count = sent_count + ?, failed_count = failed_count + ?, skipped_count = skipped_count + ?, updated_at = ?
     WHERE id = ?`
  )
    .bind(sent, failed, skipped, now, broadcast.id)
    .run();

  if (!stopped) await finalizeIfComplete(env, broadcast.id);
}

async function finalizeIfComplete(env: Env, broadcastId: string): Promise<void> {
  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM broadcast_recipients
     WHERE broadcast_id = ? AND status IN ('pending', 'sending')`
  )
    .bind(broadcastId)
    .first<{ count: number }>();
  if ((remaining?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE broadcasts SET status = 'sent', updated_at = ?, finished_at = ? WHERE id = ?"
  )
    .bind(now, now, broadcastId)
    .run();
}

export async function retryFailedBroadcast(env: Env, broadcastId: string): Promise<number> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE broadcast_recipients SET status = 'pending', error = NULL, updated_at = ?
     WHERE broadcast_id = ? AND status = 'failed'`
  )
    .bind(now, broadcastId)
    .run();
  const retried = result.meta?.changes ?? 0;
  if (retried === 0) return 0;

  await env.DB.prepare(
    `UPDATE broadcasts
     SET status = 'queued',
         sent_count = (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'sent'),
         failed_count = (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'failed'),
         skipped_count = (SELECT COUNT(*) FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'skipped'),
         finished_at = NULL,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(broadcastId, broadcastId, broadcastId, now, broadcastId)
    .run();

  return retried;
}
