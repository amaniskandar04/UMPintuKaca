import { Hono } from "hono";
import {
  CreateReviewSchema,
  MAX_REVIEW_BODY,
  MAX_REVIEW_TITLE,
  ReportSchema,
  UpdateReviewSchema,
  type ReviewDto,
  type ReviewStatus,
  type ScoreDto,
  type TargetType
} from "@pintukaca/shared";
import type { AppEnv, ReviewRow } from "../env";
import { authMiddleware, requireVerified } from "../middleware";
import { makeAlias } from "../lib/alias";
import { normalizeMultiline, normalizeText, randomId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { moderateReview } from "../lib/moderation";
import { notifyAdmins, notifyUser } from "../lib/notify";
import { enforceDailyAndWeekly, enforceRateLimit } from "../lib/rate-limit";
import {
  getAuthorAchievements,
  notifyRewardProgress,
  recomputeUserRewards,
  toggleHelpfulVote
} from "../lib/rewards";
import {
  findTarget,
  getCourseReviewAccess,
  getDimensions,
  getMyReviews,
  isBanned,
  recomputeStats
} from "../db/queries";

const reviews = new Hono<AppEnv>();

async function validateScores(
  db: D1Database,
  targetType: TargetType,
  scores: Record<string, number>
): Promise<Map<string, string>> {
  const dimensions = await getDimensions(db, targetType);
  const allowed = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const labels = new Map<string, string>();
  for (const [key, score] of Object.entries(scores)) {
    const dimension = allowed.get(key);
    if (!dimension) throw new AppError(400, `Unknown rating category: ${key}`, "BAD_DIMENSION");
    if (score < dimension.min_score || score > dimension.max_score) {
      throw new AppError(400, `${dimension.label} must be between ${dimension.min_score} and ${dimension.max_score}`, "BAD_SCORE");
    }
    labels.set(key, dimension.label);
  }
  if (Object.keys(scores).length === 0) return labels;
  return labels;
}

function toScores(labels: Map<string, string>, scores: Record<string, number>): ScoreDto[] {
  return Object.entries(scores).map(([key, score]) => ({
    key,
    label: labels.get(key) ?? key,
    score
  }));
}

/** Dedupe, trim and cap the semester list a review can carry. */
function normalizeSemesters(list: string[] | undefined): string[] {
  if (!list) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = normalizeText(raw, 32);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

reviews.get("/access", authMiddleware, async (c) => {
  const user = c.get("user");
  const access = await getCourseReviewAccess(c.env.DB, { id: user.id, role: user.role });
  return c.json({ access });
});

reviews.get("/mine", authMiddleware, async (c) => {
  return c.json({ reviews: await getMyReviews(c.env.DB, c.get("user").id) });
});

reviews.post("/", authMiddleware, requireVerified, async (c) => {
  const user = c.get("user");
  if (await isBanned(c.env.DB, user.id)) {
    throw new AppError(403, "Your account is restricted from posting reviews", "BANNED");
  }

  const body = await c.req.json().catch(() => null);
  const parsed = CreateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid review", details: parsed.error.flatten() }, 400);
  }

  await enforceDailyAndWeekly(c.env.DB, "review", user.id, 5, 20);

  const target = await findTarget(c.env.DB, parsed.data.targetType, parsed.data.targetCode);
  if (!target) throw new AppError(404, "Entry not found", "TARGET_NOT_FOUND");

  const scoreMap = parsed.data.scores ?? {};
  const labels = await validateScores(c.env.DB, target.type, scoreMap);
  const title = normalizeText(parsed.data.title, MAX_REVIEW_TITLE);
  const reviewBody = normalizeMultiline(parsed.data.body, MAX_REVIEW_BODY);
  const semesterText = parsed.data.semesters;
  const semesters = normalizeSemesters(semesterText);
  const primarySemester = semesters[0] ?? null;
  const moderation = moderateReview({ title, body: reviewBody });

  if (reviewBody) {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM reviews WHERE user_id = ? AND body = ? AND created_at > ? AND deleted_at IS NULL LIMIT 1"
    )
      .bind(user.id, reviewBody, since)
      .first<{ id: string }>();
    if (duplicate) throw new AppError(409, "You already submitted a similar review recently", "DUPLICATE_REVIEW");
  }

  const id = randomId();
  const now = new Date().toISOString();
  const alias = await makeAlias(c.env, user.id, target.type, target.id);
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO reviews (id, target_type, target_id, user_id, alias, title, body, semester, would_take_again, overall_rating, status, flags_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).bind(
      id,
      target.type,
      target.id,
      user.id,
      alias,
      title,
      reviewBody,
      primarySemester,
      parsed.data.wouldTakeAgain === undefined || parsed.data.wouldTakeAgain === null
        ? null
        : parsed.data.wouldTakeAgain
          ? 1
          : 0,
      parsed.data.overall,
      moderation.status,
      JSON.stringify(moderation.flags),
      now,
      now
    ),
    ...Object.entries(scoreMap).map(([key, score]) =>
      c.env.DB.prepare("INSERT INTO review_scores (review_id, dimension_key, score) VALUES (?, ?, ?)").bind(id, key, score)
    ),
    ...semesters.map((value) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO review_semesters (review_id, semester) VALUES (?, ?)").bind(id, value)
    )
  ];

  try {
    await c.env.DB.batch(statements);
  } catch (caught) {
    const message = String(caught);
    if (message.includes("UNIQUE")) {
      throw new AppError(409, "You have already reviewed this entry", "ALREADY_REVIEWED");
    }
    throw caught;
  }

  if (moderation.status === "published") {
    await recomputeStats(c.env.DB, target.type, target.id);
    const reward = await recomputeUserRewards(c.env.DB, user.id);
    c.executionCtx.waitUntil(notifyRewardProgress(c.env, user.id, reward));
  } else {
    c.executionCtx.waitUntil(
      notifyAdmins(
        c.env,
        `New review needs moderation: ${target.code} (${target.type}). Review ID: ${id}. Flags: ${moderation.flags.join(", ") || "none"}`
      )
    );
  }

  const achievements = await getAuthorAchievements(c.env.DB, [user.id]);
  const achievement = achievements.get(user.id);
  const review: ReviewDto = {
    id,
    alias,
    title,
    body: reviewBody,
    semesters,
    overall: parsed.data.overall,
    status: moderation.status,
    flags: moderation.flags,
    createdAt: now,
    updatedAt: now,
    canEdit: true,
    isOwner: true,
    scores: toScores(labels, scoreMap),
    wouldTakeAgain: parsed.data.wouldTakeAgain ?? null,
    helpfulCount: 0,
    viewerHelpful: false,
    authorLevel: achievement?.show ? achievement.level : 0,
    authorBadges: achievement?.show ? achievement.badges : []
  };

  return c.json({ review }, 201);
});

reviews.patch("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  if (await isBanned(c.env.DB, user.id)) {
    throw new AppError(403, "Your account is restricted from posting reviews", "BANNED");
  }

  await enforceRateLimit(c.env.DB, `review:edit:day:${user.id}`, 30, 86400);

  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM reviews WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .bind(id, user.id)
    .first<ReviewRow>();
  if (!existing) throw new AppError(404, "Review not found", "NOT_FOUND");
  if (Date.now() - Date.parse(existing.created_at) > 30 * 86400000) {
    throw new AppError(403, "The 30-day edit window has passed", "EDIT_WINDOW_CLOSED");
  }

  const body = await c.req.json().catch(() => null);
  const parsed = UpdateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid update", details: parsed.error.flatten() }, 400);
  }

  const targetType = existing.target_type as TargetType;
  const title = parsed.data.title !== undefined ? normalizeText(parsed.data.title, MAX_REVIEW_TITLE) : existing.title;
  const reviewBody =
    parsed.data.body !== undefined ? normalizeMultiline(parsed.data.body, MAX_REVIEW_BODY) : existing.body;
  const semestersProvided = parsed.data.semesters !== undefined;
  const semesters = semestersProvided ? normalizeSemesters(parsed.data.semesters) : null;
  const primarySemester = semesters ? semesters[0] ?? null : existing.semester;
  const wouldTakeAgain =
    parsed.data.wouldTakeAgain !== undefined
      ? parsed.data.wouldTakeAgain === null
        ? null
        : parsed.data.wouldTakeAgain
          ? 1
          : 0
      : existing.would_take_again ?? null;
  const overall =
    parsed.data.overall !== undefined ? parsed.data.overall : existing.overall_rating ?? null;
  const moderation = moderateReview({ title, body: reviewBody });

  let labels: Map<string, string> | null = null;
  if (parsed.data.scores) {
    labels = await validateScores(c.env.DB, targetType, parsed.data.scores);
  }

  let status = existing.status;
  if (existing.status !== "hidden" && existing.status !== "deleted") {
    status = moderation.status;
  }

  const now = new Date().toISOString();
  const statements = [
    c.env.DB.prepare(
      "UPDATE reviews SET title = ?, body = ?, semester = ?, would_take_again = ?, overall_rating = ?, status = ?, flags_json = ?, updated_at = ? WHERE id = ?"
    ).bind(title, reviewBody, primarySemester, wouldTakeAgain, overall, status, JSON.stringify(moderation.flags), now, id)
  ];
  if (parsed.data.scores) {
    statements.push(c.env.DB.prepare("DELETE FROM review_scores WHERE review_id = ?").bind(id));
    for (const [key, score] of Object.entries(parsed.data.scores)) {
      statements.push(
        c.env.DB.prepare("INSERT INTO review_scores (review_id, dimension_key, score) VALUES (?, ?, ?)").bind(id, key, score)
      );
    }
  }
  if (semesters) {
    statements.push(c.env.DB.prepare("DELETE FROM review_semesters WHERE review_id = ?").bind(id));
    for (const value of semesters) {
      statements.push(
        c.env.DB.prepare("INSERT OR IGNORE INTO review_semesters (review_id, semester) VALUES (?, ?)").bind(id, value)
      );
    }
  }
  await c.env.DB.batch(statements);
  await recomputeStats(c.env.DB, targetType, existing.target_id);
  const reward = await recomputeUserRewards(c.env.DB, user.id);
  c.executionCtx.waitUntil(notifyRewardProgress(c.env, user.id, reward));

  if (status === "pending") {
    c.executionCtx.waitUntil(
      notifyAdmins(c.env, `An edited review needs moderation. Review ID: ${id}. Flags: ${moderation.flags.join(", ") || "none"}`)
    );
  }

  const scores = parsed.data.scores
    ? toScores(labels ?? new Map(), parsed.data.scores)
    : await (async () => {
        const rows = await c.env.DB.prepare(
          `SELECT rs.dimension_key AS key, rs.score, d.label
           FROM review_scores rs JOIN dimensions d ON d.key = rs.dimension_key
           WHERE rs.review_id = ? ORDER BY d.sort_order`
        )
          .bind(id)
          .all<{ key: string; score: number; label: string }>();
        return rows.results;
      })();

  const responseSemesters =
    semesters ??
    (
      await c.env.DB.prepare("SELECT semester FROM review_semesters WHERE review_id = ? ORDER BY semester ASC")
        .bind(id)
        .all<{ semester: string }>()
    ).results.map((row) => row.semester);

  const achievements = await getAuthorAchievements(c.env.DB, [user.id]);
  const achievement = achievements.get(user.id);
  const review: ReviewDto = {
    id,
    alias: existing.alias,
    title,
    body: reviewBody,
    semesters: responseSemesters,
    overall,
    status: status as ReviewStatus,
    flags: moderation.flags,
    createdAt: existing.created_at,
    updatedAt: now,
    canEdit: true,
    isOwner: true,
    scores,
    wouldTakeAgain: wouldTakeAgain === null ? null : Boolean(wouldTakeAgain),
    helpfulCount: existing.helpful_count ?? 0,
    viewerHelpful: false,
    authorLevel: achievement?.show ? achievement.level : 0,
    authorBadges: achievement?.show ? achievement.badges : []
  };

  return c.json({ review });
});

reviews.delete("/:id", authMiddleware, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM reviews WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .bind(id, user.id)
    .first<ReviewRow>();
  if (!existing) throw new AppError(404, "Review not found", "NOT_FOUND");

  await c.env.DB.prepare("UPDATE reviews SET status = 'deleted', deleted_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
  await recomputeStats(c.env.DB, existing.target_type as TargetType, existing.target_id);
  await recomputeUserRewards(c.env.DB, user.id);
  return c.json({ ok: true });
});

reviews.post("/:id/helpful", authMiddleware, requireVerified, async (c) => {
  const user = c.get("user");
  await enforceRateLimit(c.env.DB, `helpful:day:${user.id}`, 50, 86400);
  const result = await toggleHelpfulVote(c.env.DB, c.req.param("id"), user.id, true);
  c.executionCtx.waitUntil(notifyRewardProgress(c.env, result.authorId, result.reward));
  // Only ping the author at milestones; a popular review would otherwise send a
  // message for every single vote.
  if (result.authorId !== user.id && (result.helpfulCount === 1 || result.helpfulCount % 5 === 0)) {
    c.executionCtx.waitUntil(
      notifyUser(
        c.env,
        result.authorId,
        `${result.helpfulCount} ${result.helpfulCount === 1 ? "person" : "people"} found your review helpful.`
      )
    );
  }
  return c.json({ helpfulCount: result.helpfulCount, viewerHelpful: true });
});

reviews.delete("/:id/helpful", authMiddleware, requireVerified, async (c) => {
  const user = c.get("user");
  await enforceRateLimit(c.env.DB, `helpful:day:${user.id}`, 50, 86400);
  const result = await toggleHelpfulVote(c.env.DB, c.req.param("id"), user.id, false);
  c.executionCtx.waitUntil(notifyRewardProgress(c.env, result.authorId, result.reward));
  return c.json({ helpfulCount: result.helpfulCount, viewerHelpful: false });
});

reviews.post("/:id/report", authMiddleware, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid report", details: parsed.error.flatten() }, 400);
  }

  const review = await c.env.DB.prepare(
    "SELECT id, target_type, target_id, user_id, status FROM reviews WHERE id = ? AND deleted_at IS NULL"
  )
    .bind(id)
    .first<{ id: string; target_type: string; target_id: string; user_id: string; status: string }>();
  if (!review) throw new AppError(404, "Review not found", "NOT_FOUND");
  if (review.user_id === user.id) throw new AppError(400, "You cannot report your own review", "OWN_REVIEW");

  await enforceRateLimit(c.env.DB, `report:day:${user.id}`, 10, 86400);

  const reportId = randomId();
  try {
    await c.env.DB.prepare(
      "INSERT INTO reports (id, review_id, reporter_user_id, reason, details, status, created_at, resolved_at, resolved_by) VALUES (?, ?, ?, ?, ?, 'open', ?, NULL, NULL)"
    )
      .bind(
        reportId,
        id,
        user.id,
        parsed.data.reason,
        normalizeText(parsed.data.details, 500),
        new Date().toISOString()
      )
      .run();
  } catch (caught) {
    if (String(caught).includes("UNIQUE")) throw new AppError(409, "You have already reported this review", "ALREADY_REPORTED");
    throw caught;
  }

  const count = await c.env.DB.prepare(
    "SELECT COUNT(DISTINCT reporter_user_id) AS count FROM reports WHERE review_id = ? AND status = 'open'"
  )
    .bind(id)
    .first<{ count: number }>();
  const threshold = Math.max(1, Number(c.env.AUTO_HIDE_REPORT_THRESHOLD) || 3);
  let hidden = false;
  if ((count?.count ?? 0) >= threshold && review.status === "published") {
    await c.env.DB.prepare("UPDATE reviews SET status = 'hidden', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), id)
      .run();
    await recomputeStats(c.env.DB, review.target_type as TargetType, review.target_id);
    hidden = true;
    c.executionCtx.waitUntil(notifyAdmins(c.env, `A review was auto-hidden after ${count?.count ?? 0} reports. Review ID: ${id}`));
  } else {
    c.executionCtx.waitUntil(notifyAdmins(c.env, `A review was reported. Review ID: ${id}. Reason: ${parsed.data.reason}`));
  }

  return c.json({ ok: true, hidden });
});

export default reviews;
