import { Hono } from "hono";
import { AnswerSchema, QuestionSchema } from "@pintukaca/shared";
import type { AppEnv } from "../env";
import { authMiddleware, optionalAuthMiddleware, requireVerified } from "../middleware";
import { makeAlias } from "../lib/alias";
import { normalizeMultiline, randomId } from "../lib/crypto";
import { AppError } from "../lib/errors";
import { moderateReview } from "../lib/moderation";
import { notifyAdmins, notifyUser } from "../lib/notify";
import { enforceDailyAndWeekly } from "../lib/rate-limit";
import { notifyRewardProgress, recomputeUserRewards } from "../lib/rewards";
import { getCourseIdByCode, isBanned, listCourseQuestions } from "../db/queries";

const qa = new Hono<AppEnv>();

/** How many past reviewers of a course receive a new-question ping. */
const QUESTION_FANOUT_LIMIT = 20;

async function notifyCourseReviewersAboutQuestion(
  env: AppEnv["Bindings"],
  courseId: string,
  code: string,
  askerId: string
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT user_id FROM reviews
     WHERE target_type = 'course' AND target_id = ?
       AND status = 'published' AND deleted_at IS NULL AND user_id <> ?
     LIMIT ?`
  )
    .bind(courseId, askerId, QUESTION_FANOUT_LIMIT)
    .all<{ user_id: string }>();

  await Promise.allSettled(
    rows.results.map((row) =>
      notifyUser(env, row.user_id, `New question on ${code}, a course you reviewed. Open PintuKaca to reply.`)
    )
  );
}

qa.get("/courses/:code/questions", optionalAuthMiddleware, async (c) => {
  const courseId = await getCourseIdByCode(c.env.DB, c.req.param("code"));
  if (!courseId) throw new AppError(404, "Course not found", "NOT_FOUND");
  const viewer = c.get("user");
  const questions = await listCourseQuestions(c.env.DB, courseId, viewer?.id ?? null);
  return c.json({ questions });
});

qa.post("/courses/:code/questions", authMiddleware, requireVerified, async (c) => {
  const user = c.get("user");
  if (await isBanned(c.env.DB, user.id)) {
    throw new AppError(403, "Your account is restricted from posting", "BANNED");
  }

  const body = await c.req.json().catch(() => null);
  const parsed = QuestionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid question", details: parsed.error.flatten() }, 400);
  }

  const courseId = await getCourseIdByCode(c.env.DB, c.req.param("code"));
  if (!courseId) throw new AppError(404, "Course not found", "NOT_FOUND");
  const code = c.req.param("code").trim().toUpperCase();

  await enforceDailyAndWeekly(c.env.DB, "question", user.id, 10, 30);

  const text = normalizeMultiline(parsed.data.body, 500);
  if (!text) throw new AppError(400, "Question is empty", "EMPTY");

  const moderation = moderateReview({ body: text });
  const id = randomId();
  const now = new Date().toISOString();
  const alias = await makeAlias(c.env, user.id, "question", id);

  await c.env.DB.prepare(
    `INSERT INTO course_questions (id, course_id, user_id, alias, body, status, flags_json, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  )
    .bind(id, courseId, user.id, alias, text, moderation.status, JSON.stringify(moderation.flags), now)
    .run();

  if (moderation.status === "published") {
    const reward = await recomputeUserRewards(c.env.DB, user.id);
    c.executionCtx.waitUntil(notifyRewardProgress(c.env, user.id, reward));
    c.executionCtx.waitUntil(notifyCourseReviewersAboutQuestion(c.env, courseId, code, user.id));
  } else {
    c.executionCtx.waitUntil(
      notifyAdmins(c.env, `New question needs moderation. Question ID: ${id}. Flags: ${moderation.flags.join(", ") || "none"}`)
    );
  }

  return c.json(
    {
      question: {
        id,
        alias,
        body: text,
        createdAt: now,
        isOwner: true,
        answers: [],
        answerCount: 0
      }
    },
    201
  );
});

qa.post("/questions/:id/answers", authMiddleware, requireVerified, async (c) => {
  const user = c.get("user");
  if (await isBanned(c.env.DB, user.id)) {
    throw new AppError(403, "Your account is restricted from posting", "BANNED");
  }

  const body = await c.req.json().catch(() => null);
  const parsed = AnswerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid answer", details: parsed.error.flatten() }, 400);
  }

  const question = await c.env.DB.prepare(
    `SELECT q.id, q.user_id, q.status, c.code
     FROM course_questions q JOIN courses c ON c.id = q.course_id
     WHERE q.id = ? AND q.deleted_at IS NULL`
  )
    .bind(c.req.param("id"))
    .first<{ id: string; user_id: string; status: string; code: string }>();
  if (!question || question.status !== "published") {
    throw new AppError(404, "Question not found", "NOT_FOUND");
  }

  await enforceDailyAndWeekly(c.env.DB, "answer", user.id, 20, 60);

  const text = normalizeMultiline(parsed.data.body, 1000);
  if (!text) throw new AppError(400, "Answer is empty", "EMPTY");

  const moderation = moderateReview({ body: text });
  const id = randomId();
  const now = new Date().toISOString();
  const alias = await makeAlias(c.env, user.id, "answer", id);

  await c.env.DB.prepare(
    `INSERT INTO course_answers (id, question_id, user_id, alias, body, status, flags_json, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  )
    .bind(id, question.id, user.id, alias, text, moderation.status, JSON.stringify(moderation.flags), now)
    .run();

  if (moderation.status === "published") {
    const reward = await recomputeUserRewards(c.env.DB, user.id);
    c.executionCtx.waitUntil(notifyRewardProgress(c.env, user.id, reward));
    if (question.user_id !== user.id) {
      c.executionCtx.waitUntil(
        notifyUser(
          c.env,
          question.user_id,
          `Someone answered your question on ${question.code}. Open PintuKaca to read it.`
        )
      );
    }
  } else {
    c.executionCtx.waitUntil(
      notifyAdmins(c.env, `New answer needs moderation. Answer ID: ${id}. Flags: ${moderation.flags.join(", ") || "none"}`)
    );
  }

  return c.json(
    {
      answer: {
        id,
        alias,
        body: text,
        createdAt: now,
        isOwner: true
      }
    },
    201
  );
});

export default qa;
