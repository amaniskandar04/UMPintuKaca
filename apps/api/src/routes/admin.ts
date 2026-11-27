import { Hono } from "hono";
import {
  AdminReportResolveSchema,
  AdminReviewActionSchema,
  BanSchema,
  BroadcastSchema,
  RewardAdjustmentSchema,
  type BroadcastDto,
  type TargetType
} from "@pintukaca/shared";
import type { AppEnv, ReviewRow } from "../env";
import { authMiddleware, requireAdmin } from "../middleware";
import { AppError } from "../lib/errors";
import { notifyUser } from "../lib/notify";
import {
  countBroadcastAudience,
  createBroadcast,
  drainBroadcastQueue,
  listBroadcasts,
  retryFailedBroadcast,
  type BroadcastRow
} from "../lib/broadcast";
import { enforceRateLimit } from "../lib/rate-limit";
import {
  adjustUserPoints,
  getRewardsLeaderboard,
  notifyRewardProgress,
  recomputeAllUserRewards,
  recomputeUserRewards
} from "../lib/rewards";
import { getAdminQueue, getAdminStats, logAudit, recomputeStats } from "../db/queries";

const admin = new Hono<AppEnv>();

function toBroadcastDto(row: BroadcastRow): BroadcastDto {
  return {
    id: row.id,
    message: row.message,
    status: row.status === "sent" ? "sent" : row.status === "sending" ? "sending" : "queued",
    recipientCount: row.recipient_count,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    createdAt: row.created_at,
    finishedAt: row.finished_at
  };
}


admin.use("*", authMiddleware, requireAdmin);

admin.get("/queue", async (c) => {
  return c.json(await getAdminQueue(c.env.DB));
});

admin.get("/stats", async (c) => {
  // Admin-only. Let the browser reuse it briefly but never put it in a shared
  // cache, and keep the server-side copy itself cached for 60s in queries.ts.
  c.header("Cache-Control", "private, max-age=30");
  return c.json(await getAdminStats(c.env.DB));
});

admin.post("/reviews/:id/action", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = AdminReviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid action", details: parsed.error.flatten() }, 400);
  }

  const review = await c.env.DB.prepare("SELECT * FROM reviews WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .first<ReviewRow>();
  if (!review) throw new AppError(404, "Review not found", "NOT_FOUND");

  const now = new Date().toISOString();
  let status: "published" | "hidden" | "deleted";
  if (parsed.data.action === "approve") status = "published";
  else if (parsed.data.action === "hide") status = "hidden";
  else status = "deleted";

  const statements = [
    c.env.DB.prepare("UPDATE reviews SET status = ?, updated_at = ?, deleted_at = ? WHERE id = ?").bind(
      status,
      now,
      status === "deleted" ? now : null,
      id
    ),
    c.env.DB.prepare(
      "UPDATE reports SET status = 'action_taken', resolved_at = ?, resolved_by = ? WHERE review_id = ? AND status = 'open'"
    ).bind(now, actor.id, id)
  ];
  await c.env.DB.batch(statements);
  await recomputeStats(c.env.DB, review.target_type as TargetType, review.target_id);
  const reward = await recomputeUserRewards(c.env.DB, review.user_id);
  if (status === "published") {
    c.executionCtx.waitUntil(notifyRewardProgress(c.env, review.user_id, reward));
  }
  await logAudit(c.env.DB, actor.id, `review_${parsed.data.action}`, `review:${id}`, {
    note: parsed.data.note ?? null,
    previousStatus: review.status
  });

  if (status === "published") {
    c.executionCtx.waitUntil(notifyUser(c.env, review.user_id, "Your review has been approved and is now published."));
  } else if (status === "hidden") {
    c.executionCtx.waitUntil(
      notifyUser(c.env, review.user_id, "Your review has been hidden after a moderation check. You can edit it from the app.")
    );
  } else {
    c.executionCtx.waitUntil(notifyUser(c.env, review.user_id, "Your review was removed after a moderation check."));
  }

  return c.json({ ok: true, status });
});

admin.post("/reports/:id/resolve", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = AdminReportResolveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid action", details: parsed.error.flatten() }, 400);
  }

  const report = await c.env.DB.prepare("SELECT id, review_id, status FROM reports WHERE id = ?")
    .bind(id)
    .first<{ id: string; review_id: string; status: string }>();
  if (!report) throw new AppError(404, "Report not found", "NOT_FOUND");

  await c.env.DB.prepare("UPDATE reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?")
    .bind(parsed.data.action, new Date().toISOString(), actor.id, id)
    .run();
  await logAudit(c.env.DB, actor.id, "report_resolved", `report:${id}`, {
    action: parsed.data.action,
    note: parsed.data.note ?? null
  });

  return c.json({ ok: true });
});

admin.post("/users/:id/ban", async (c) => {
  const actor = c.get("user");
  const userId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = BanSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid ban", details: parsed.error.flatten() }, 400);
  }

  const user = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL")
    .bind(userId)
    .first<{ id: string }>();
  if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
  if (user.id === actor.id) throw new AppError(400, "You cannot ban yourself", "SELF_BAN");

  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO bans (id, user_id, reason, until, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, parsed.data.reason, parsed.data.until ?? null, actor.id, now),
    c.env.DB.prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ?").bind(userId)
  ]);
  await logAudit(c.env.DB, actor.id, "user_banned", `user:${userId}`, {
    reason: parsed.data.reason,
    until: parsed.data.until ?? null
  });
  c.executionCtx.waitUntil(
    notifyUser(c.env, userId, "Your account has been restricted from posting reviews after a moderation check.")
  );

  return c.json({ ok: true });
});

admin.delete("/users/:id/ban", async (c) => {
  const actor = c.get("user");
  const userId = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM bans WHERE user_id = ?").bind(userId).run();
  await logAudit(c.env.DB, actor.id, "user_unbanned", `user:${userId}`, {});
  c.executionCtx.waitUntil(notifyUser(c.env, userId, "Your posting restriction has been lifted."));
  return c.json({ ok: true });
});

admin.get("/audit", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, actor_id, action, target, meta_json, created_at FROM audit_log ORDER BY created_at DESC LIMIT 100"
  ).all<{ id: string; actor_id: string; action: string; target: string; meta_json: string; created_at: string }>();
  return c.json({ entries: result.results });
});

admin.get("/rewards/leaderboard", async (c) => {
  return c.json(await getRewardsLeaderboard(c.env.DB));
});

admin.post("/rewards/rebuild", async (c) => {
  const actor = c.get("user");
  const users = await recomputeAllUserRewards(c.env.DB);
  await logAudit(c.env.DB, actor.id, "rewards_rebuilt", "rewards:all", { users });
  return c.json({ ok: true, users });
});

admin.post("/rewards/:userId/adjust", async (c) => {
  const actor = c.get("user");
  const userId = c.req.param("userId");
  const body = await c.req.json().catch(() => null);
  const parsed = RewardAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid adjustment", details: parsed.error.flatten() }, 400);
  }

  const user = await c.env.DB.prepare("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL")
    .bind(userId)
    .first<{ id: string }>();
  if (!user) throw new AppError(404, "User not found", "NOT_FOUND");

  const result = await adjustUserPoints(c.env.DB, userId, parsed.data.points, parsed.data.reason, actor.id);
  await logAudit(c.env.DB, actor.id, "rewards_adjusted", `user:${userId}`, {
    points: parsed.data.points,
    reason: parsed.data.reason
  });
  c.executionCtx.waitUntil(
    notifyUser(c.env, userId, `Your reward points were adjusted by ${parsed.data.points > 0 ? "+" : ""}${parsed.data.points}.`)
  );
  return c.json({ ok: true, points: result.row.total_points, level: result.row.level });
});

admin.get("/broadcast", async (c) => {
  const [audience, broadcasts] = await Promise.all([
    countBroadcastAudience(c.env.DB),
    listBroadcasts(c.env.DB)
  ]);
  return c.json({ audience, broadcasts: broadcasts.map(toBroadcastDto) });
});

admin.post("/broadcast", async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    throw new AppError(503, "Telegram bot is not configured", "BOT_NOT_CONFIGURED");
  }

  const actor = c.get("user");
  await enforceRateLimit(c.env.DB, `broadcast:day:${actor.id}`, 20, 86400);

  const body = await c.req.json().catch(() => null);
  const parsed = BroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid broadcast", details: parsed.error.flatten() }, 400);
  }

  const { broadcast, recipientCount } = await createBroadcast(
    c.env,
    parsed.data.message,
    actor.id,
    parsed.data.test ? actor.id : undefined
  );

  await logAudit(c.env.DB, actor.id, "broadcast_sent", `broadcast:${broadcast.id}`, {
    test: Boolean(parsed.data.test),
    recipientCount,
    preview: parsed.data.message.slice(0, 120)
  });

  c.executionCtx.waitUntil(drainBroadcastQueue(c.env));
  return c.json({ broadcast: toBroadcastDto(broadcast), recipientCount }, 201);
});

admin.post("/broadcast/:id/retry", async (c) => {
  const actor = c.get("user");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM broadcasts WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!existing) throw new AppError(404, "Broadcast not found", "NOT_FOUND");

  const retried = await retryFailedBroadcast(c.env, id);
  if (retried > 0) {
    await logAudit(c.env.DB, actor.id, "broadcast_retried", `broadcast:${id}`, { retried });
    c.executionCtx.waitUntil(drainBroadcastQueue(c.env));
  }
  return c.json({ ok: true, retried });
});

export default admin;
