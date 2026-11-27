import {
  REWARD_LEVELS,
  REWARD_THEMES,
  nextRewardLevel,
  rewardLevelForPoints,
  unlockedRewardThemes,
  type AuthorBadgeDto,
  type PointsBreakdownDto,
  type RewardBadgeDto,
  type RewardTheme,
  type RewardsDto,
  type RewardsLeaderboardDto
} from "@pintukaca/shared";
import type { BadgeRow, Env, UserRewardRow } from "../env";
import { AppError } from "./errors";
import { notifyUser } from "./notify";

interface PublishedReviewRow {
  id: string;
  target_type: string;
  target_id: string;
  body: string | null;
  created_at: string;
  helpful_count: number | null;
  faculty: string | null;
  category: string | null;
}

export interface RewardMetrics {
  publishedReviews: number;
  writtenReviews: number;
  longReviews: number;
  courseReviews: number;
  clubReviews: number;
  programReviews: number;
  questionsAsked: number;
  answersGiven: number;
  helpfulReceived: number;
  helpfulGiven: number;
  currentStreak: number;
  longestStreak: number;
  lastReviewWeek: string | null;
  firstReviewCount: number;
  faculties: number;
  clubCategories: number;
  pointsBreakdown: PointsBreakdownDto;
  level: number;
}

/** Answering is the valuable contribution, so it out-earns asking. */
export const QUESTION_POINTS = 2;
export const ANSWER_POINTS = 5;

export interface RewardRecomputeResult {
  row: UserRewardRow;
  metrics: RewardMetrics;
  newBadges: BadgeRow[];
  previousLevel: number;
  levelChanged: boolean;
}

export interface HelpfulVoteResult {
  helpfulCount: number;
  viewerHelpful: boolean;
  authorId: string;
  reward: RewardRecomputeResult;
}

interface AuthorAchievement {
  level: number;
  badges: AuthorBadgeDto[];
  show: boolean;
}

function weekKey(date: Date): string {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekOrdinal(key: string): number {
  const [year, week] = key.split("-W");
  return Number(year) * 53 + Number(week);
}

function computeStreak(rows: PublishedReviewRow[]): { current: number; longest: number; last: string | null } {
  const weeks = [...new Set(rows.map((row) => weekKey(new Date(row.created_at))))].sort(
    (a, b) => weekOrdinal(a) - weekOrdinal(b)
  );
  if (weeks.length === 0) return { current: 0, longest: 0, last: null };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < weeks.length; index += 1) {
    if (weekOrdinal(weeks[index]) === weekOrdinal(weeks[index - 1]) + 1) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
  }

  const latest = weeks[weeks.length - 1];
  const currentWeek = weekOrdinal(weekKey(new Date()));
  let current = 0;
  if (weekOrdinal(latest) >= currentWeek - 1) {
    current = 1;
    for (let index = weeks.length - 1; index > 0; index -= 1) {
      if (weekOrdinal(weeks[index]) === weekOrdinal(weeks[index - 1]) + 1) current += 1;
      else break;
    }
  }

  return { current, longest, last: latest };
}

function badgeProgress(key: string, metrics: RewardMetrics): { current: number; target: number } | null {
  const levelMatch = key.match(/^level_(\d+)$/);
  if (levelMatch) return { current: metrics.level, target: Number(levelMatch[1]) };

  const reviewsMatch = key.match(/^reviews_(\d+)$/);
  if (reviewsMatch) return { current: metrics.publishedReviews, target: Number(reviewsMatch[1]) };

  const helpfulMatch = key.match(/^helpful_(\d+)$/);
  if (helpfulMatch) return { current: metrics.helpfulReceived, target: Number(helpfulMatch[1]) };

  switch (key) {
    case "first_review":
      return { current: metrics.publishedReviews, target: 1 };
    case "course_critic":
      return { current: metrics.courseReviews, target: 5 };
    case "club_connector":
      return { current: metrics.clubReviews, target: 5 };
    case "long_form_10":
      return { current: metrics.longReviews, target: 10 };
    case "category_explorer":
      return { current: metrics.clubCategories, target: 5 };
    case "early_reviewer":
      return { current: metrics.firstReviewCount, target: 3 };
    default:
      return null;
  }
}

async function computeMetrics(db: D1Database, userId: string): Promise<RewardMetrics> {
  const reviews = await db
    .prepare(
      `SELECT r.id, r.target_type, r.target_id, r.body, r.created_at, r.helpful_count,
        t.faculty, t.category
       FROM reviews r
       LEFT JOIN targets t ON t.type = r.target_type AND t.id = r.target_id
       WHERE r.user_id = ? AND r.status = 'published' AND r.deleted_at IS NULL
       ORDER BY r.created_at ASC`
    )
    .bind(userId)
    .all<PublishedReviewRow>();

  let writtenReviews = 0;
  let longReviews = 0;
  let courseReviews = 0;
  let clubReviews = 0;
  let programReviews = 0;
  let helpfulReceived = 0;
  let ratingOnlyPoints = 0;
  let writtenPoints = 0;
  let longPoints = 0;
  const faculties = new Set<string>();
  const clubCategories = new Set<string>();

  for (const row of reviews.results) {
    const bodyLength = String(row.body ?? "").trim().length;
    if (bodyLength >= 20) {
      writtenReviews += 1;
      writtenPoints += 10;
      if (bodyLength > 200) {
        longReviews += 1;
        longPoints += 10;
      }
    } else {
      ratingOnlyPoints += 1;
    }

    if (row.target_type === "course") courseReviews += 1;
    else if (row.target_type === "club") clubReviews += 1;
    else if (row.target_type === "program") programReviews += 1;

    helpfulReceived += row.helpful_count ?? 0;
    if (row.faculty) faculties.add(row.faculty);
    if (row.target_type === "club" && row.category) clubCategories.add(row.category);
  }

  const [given, firstReviews, adjustments, qaCounts] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) AS count FROM review_votes WHERE voter_user_id = ? AND vote_type = 'helpful'")
      .bind(userId)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM reviews r
         WHERE r.user_id = ? AND r.status = 'published' AND r.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM reviews r2
             WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id
               AND r2.status = 'published' AND r2.deleted_at IS NULL
               AND (r2.created_at < r.created_at OR (r2.created_at = r.created_at AND r2.id < r.id))
           )`
      )
      .bind(userId)
      .first<{ count: number }>(),
    db
      .prepare("SELECT COALESCE(SUM(points), 0) AS points FROM reward_adjustments WHERE user_id = ?")
      .bind(userId)
      .first<{ points: number }>(),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM course_questions
             WHERE user_id = ? AND status = 'published' AND deleted_at IS NULL) AS questions,
           (SELECT COUNT(*) FROM course_answers
             WHERE user_id = ? AND status = 'published' AND deleted_at IS NULL) AS answers`
      )
      .bind(userId, userId)
      .first<{ questions: number; answers: number }>()
  ]);

  const streak = computeStreak(reviews.results);
  const adjustmentPoints = adjustments?.points ?? 0;
  const helpfulPoints = helpfulReceived * 2;
  const questionsAsked = qaCounts?.questions ?? 0;
  const answersGiven = qaCounts?.answers ?? 0;
  const questionPoints = questionsAsked * QUESTION_POINTS;
  const answerPoints = answersGiven * ANSWER_POINTS;
  const base = ratingOnlyPoints + writtenPoints + longPoints + helpfulPoints + questionPoints + answerPoints;
  const total = Math.max(0, base + adjustmentPoints);
  const level = rewardLevelForPoints(total).level;

  return {
    publishedReviews: reviews.results.length,
    writtenReviews,
    longReviews,
    courseReviews,
    clubReviews,
    programReviews,
    questionsAsked,
    answersGiven,
    helpfulReceived,
    helpfulGiven: given?.count ?? 0,
    currentStreak: streak.current,
    longestStreak: streak.longest,
    lastReviewWeek: streak.last,
    firstReviewCount: firstReviews?.count ?? 0,
    faculties: faculties.size,
    clubCategories: clubCategories.size,
    pointsBreakdown: {
      ratingOnly: ratingOnlyPoints,
      written: writtenPoints,
      long: longPoints,
      helpful: helpfulPoints,
      questions: questionPoints,
      answers: answerPoints,
      adjustments: adjustmentPoints,
      base,
      total
    },
    level
  };
}

export async function recomputeUserRewards(db: D1Database, userId: string): Promise<RewardRecomputeResult> {
  const previous = await db
    .prepare("SELECT level FROM user_rewards WHERE user_id = ?")
    .bind(userId)
    .first<{ level: number }>();
  const metrics = await computeMetrics(db, userId);
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO user_rewards (
        user_id, total_points, level, published_reviews, written_reviews, long_reviews,
        helpful_received, helpful_given, current_streak, longest_streak, last_review_week,
        show_achievements, theme, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'default', ?)
      ON CONFLICT(user_id) DO UPDATE SET
        total_points = excluded.total_points,
        level = excluded.level,
        published_reviews = excluded.published_reviews,
        written_reviews = excluded.written_reviews,
        long_reviews = excluded.long_reviews,
        helpful_received = excluded.helpful_received,
        helpful_given = excluded.helpful_given,
        current_streak = excluded.current_streak,
        longest_streak = excluded.longest_streak,
        last_review_week = excluded.last_review_week,
        updated_at = excluded.updated_at`
    )
    .bind(
      userId,
      metrics.pointsBreakdown.total,
      metrics.level,
      metrics.publishedReviews,
      metrics.writtenReviews,
      metrics.longReviews,
      metrics.helpfulReceived,
      metrics.helpfulGiven,
      metrics.currentStreak,
      metrics.longestStreak,
      metrics.lastReviewWeek,
      now
    )
    .run();

  const badges = await db.prepare("SELECT * FROM badges ORDER BY sort_order ASC").all<BadgeRow>();
  const existing = await db
    .prepare("SELECT badge_key FROM user_badges WHERE user_id = ?")
    .bind(userId)
    .all<{ badge_key: string }>();
  const existingKeys = new Set(existing.results.map((row) => row.badge_key));
  const newBadges: BadgeRow[] = [];

  for (const badge of badges.results) {
    const progress = badgeProgress(badge.key, metrics);
    if (!progress || progress.current < progress.target || existingKeys.has(badge.key)) continue;
    await db
      .prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_key, awarded_at) VALUES (?, ?, ?)")
      .bind(userId, badge.key, now)
      .run();
    newBadges.push(badge);
  }

  const row = await db.prepare("SELECT * FROM user_rewards WHERE user_id = ?").bind(userId).first<UserRewardRow>();
  if (!row) throw new AppError(500, "Could not compute rewards", "REWARDS_FAILED");

  return {
    row,
    metrics,
    newBadges,
    previousLevel: previous?.level ?? 0,
    levelChanged: Boolean(previous?.level && row.level > previous.level)
  };
}

function parseDisplayBadges(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 3)
      : [];
  } catch {
    return [];
  }
}

export async function getUserRewards(db: D1Database, userId: string): Promise<RewardsDto> {
  const result = await recomputeUserRewards(db, userId);
  const earned = await db
    .prepare(
      `SELECT b.key, b.label, b.description, b.icon, b.sort_order, ub.awarded_at
       FROM badges b
       LEFT JOIN user_badges ub ON ub.badge_key = b.key AND ub.user_id = ?
       ORDER BY b.sort_order ASC`
    )
    .bind(userId)
    .all<BadgeRow & { awarded_at: string | null }>();
  const currentLevel = rewardLevelForPoints(result.metrics.pointsBreakdown.total);
  const next = nextRewardLevel(result.metrics.pointsBreakdown.total);
  const themes = unlockedRewardThemes(result.metrics.level);
  const storedTheme = (REWARD_THEMES as readonly string[]).includes(result.row.theme)
    ? (result.row.theme as RewardTheme)
    : "default";
  const theme = themes.includes(storedTheme) ? storedTheme : "default";

  const badges: RewardBadgeDto[] = earned.results.map((badge) => ({
    key: badge.key,
    label: badge.label,
    description: badge.description,
    icon: badge.icon,
    sort: badge.sort_order,
    earnedAt: badge.awarded_at,
    progress: badgeProgress(badge.key, result.metrics)
  }));
  const earnedKeys = new Set(earned.results.filter((badge) => badge.awarded_at).map((badge) => badge.key));
  const displayBadges = parseDisplayBadges(result.row.display_badges_json).filter((key) => earnedKeys.has(key));

  return {
    points: result.metrics.pointsBreakdown.total,
    level: result.metrics.level,
    levelLabel: currentLevel.label,
    nextLevel: next,
    progress: next
      ? {
          current: result.metrics.pointsBreakdown.total - currentLevel.points,
          target: next.points - currentLevel.points,
          percent:
            next.points > currentLevel.points
              ? Math.min(
                  100,
                  Math.round(
                    ((result.metrics.pointsBreakdown.total - currentLevel.points) /
                      (next.points - currentLevel.points)) *
                      100
                  )
                )
              : 100
        }
      : null,
    publishedReviews: result.metrics.publishedReviews,
    writtenReviews: result.metrics.writtenReviews,
    longReviews: result.metrics.longReviews,
    helpfulReceived: result.metrics.helpfulReceived,
    helpfulGiven: result.metrics.helpfulGiven,
    currentStreak: result.metrics.currentStreak,
    longestStreak: result.metrics.longestStreak,
    showAchievements: Boolean(result.row.show_achievements),
    theme,
    unlockedThemes: themes,
    displayBadges,
    badges,
    pointsBreakdown: result.metrics.pointsBreakdown,
    levels: REWARD_LEVELS
  };
}

export async function updateRewardPreferences(
  db: D1Database,
  userId: string,
  input: { showAchievements?: boolean; theme?: RewardTheme; displayBadges?: string[] }
): Promise<RewardsDto> {
  const current = await recomputeUserRewards(db, userId);
  const themes = unlockedRewardThemes(current.metrics.level);
  if (input.theme && !themes.includes(input.theme)) {
    throw new AppError(403, "This theme is not unlocked yet", "THEME_LOCKED");
  }

  let displayBadgesJson = current.row.display_badges_json;
  if (input.displayBadges !== undefined) {
    const requested = [...new Set(input.displayBadges)].slice(0, 3);
    if (requested.length > 0) {
      const placeholders = requested.map(() => "?").join(",");
      const earned = await db
        .prepare(`SELECT badge_key FROM user_badges WHERE user_id = ? AND badge_key IN (${placeholders})`)
        .bind(userId, ...requested)
        .all<{ badge_key: string }>();
      if (earned.results.length !== requested.length) {
        throw new AppError(400, "You can only display earned badges", "BADGE_NOT_EARNED");
      }
    }
    displayBadgesJson = JSON.stringify(requested);
  }

  const show = input.showAchievements === undefined ? current.row.show_achievements : input.showAchievements ? 1 : 0;
  const theme = input.theme ?? (themes.includes(current.row.theme as RewardTheme) ? current.row.theme : "default");
  await db
    .prepare(
      "UPDATE user_rewards SET show_achievements = ?, theme = ?, display_badges_json = ?, updated_at = ? WHERE user_id = ?"
    )
    .bind(show, theme, displayBadgesJson, new Date().toISOString(), userId)
    .run();
  return getUserRewards(db, userId);
}

export async function getAuthorAchievements(
  db: D1Database,
  userIds: string[]
): Promise<Map<string, AuthorAchievement>> {
  const map = new Map<string, AuthorAchievement>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => "?").join(",");
  const [rewards, badges] = await Promise.all([
    db
      .prepare(
        `SELECT user_id, level, show_achievements, display_badges_json
         FROM user_rewards WHERE user_id IN (${placeholders})`
      )
      .bind(...unique)
      .all<{ user_id: string; level: number; show_achievements: number; display_badges_json: string }>(),
    db
      .prepare(
        `SELECT ub.user_id, b.key, b.label, b.icon, b.sort_order
         FROM user_badges ub
         JOIN badges b ON b.key = ub.badge_key
         WHERE ub.user_id IN (${placeholders})
         ORDER BY b.sort_order ASC`
      )
      .bind(...unique)
      .all<{ user_id: string; key: string; label: string; icon: string; sort_order: number }>()
  ]);

  const selectedBadges = new Map<string, string[]>();
  const earnedBadges = new Map<string, AuthorBadgeDto[]>();
  for (const userId of unique) {
    map.set(userId, { level: 1, badges: [], show: true });
    selectedBadges.set(userId, []);
    earnedBadges.set(userId, []);
  }
  for (const row of rewards.results) {
    map.set(row.user_id, { level: row.level, badges: [], show: Boolean(row.show_achievements) });
    selectedBadges.set(row.user_id, parseDisplayBadges(row.display_badges_json));
  }
  for (const row of badges.results) {
    const list = earnedBadges.get(row.user_id);
    if (list) list.push({ key: row.key, label: row.label, icon: row.icon });
  }
  for (const userId of unique) {
    const current = map.get(userId);
    if (!current || !current.show) continue;
    const all = earnedBadges.get(userId) ?? [];
    const selected = selectedBadges.get(userId) ?? [];
    const chosen =
      selected.length > 0
        ? selected
            .map((key) => all.find((badge) => badge.key === key))
            .filter((badge): badge is AuthorBadgeDto => Boolean(badge))
        : all.slice(0, 3);
    current.badges = chosen.slice(0, 3);
  }
  return map;
}

export async function toggleHelpfulVote(
  db: D1Database,
  reviewId: string,
  voterUserId: string,
  vote: boolean
): Promise<HelpfulVoteResult> {
  const review = await db
    .prepare("SELECT id, user_id, status, helpful_count FROM reviews WHERE id = ? AND deleted_at IS NULL")
    .bind(reviewId)
    .first<{ id: string; user_id: string; status: string; helpful_count: number }>();
  if (!review) throw new AppError(404, "Review not found", "NOT_FOUND");
  if (review.status !== "published") throw new AppError(400, "You can only vote on published reviews", "NOT_PUBLISHED");
  if (review.user_id === voterUserId) throw new AppError(400, "You cannot vote on your own review", "OWN_REVIEW");

  const voter = await db
    .prepare("SELECT created_at FROM users WHERE id = ? AND deleted_at IS NULL")
    .bind(voterUserId)
    .first<{ created_at: string }>();
  if (!voter || Date.now() - Date.parse(voter.created_at) < 86400000) {
    throw new AppError(403, "Your account is too new to vote", "ACCOUNT_TOO_NEW");
  }

  if (vote) {
    try {
      await db
        .prepare(
          "INSERT INTO review_votes (review_id, voter_user_id, vote_type, created_at) VALUES (?, ?, 'helpful', ?)"
        )
        .bind(reviewId, voterUserId, new Date().toISOString())
        .run();
    } catch (caught) {
      if (String(caught).includes("UNIQUE")) throw new AppError(409, "You already marked this review helpful", "ALREADY_VOTED");
      throw caught;
    }
    await db.prepare("UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = ?").bind(reviewId).run();
  } else {
    const removed = await db
      .prepare("DELETE FROM review_votes WHERE review_id = ? AND voter_user_id = ? AND vote_type = 'helpful'")
      .bind(reviewId, voterUserId)
      .run();
    if ((removed.meta.changes ?? 0) === 0) {
      throw new AppError(409, "You have not marked this review helpful", "NOT_VOTED");
    }
    await db
      .prepare("UPDATE reviews SET helpful_count = CASE WHEN helpful_count > 0 THEN helpful_count - 1 ELSE 0 END WHERE id = ?")
      .bind(reviewId)
      .run();
  }

  const updated = await db
    .prepare("SELECT helpful_count FROM reviews WHERE id = ?")
    .bind(reviewId)
    .first<{ helpful_count: number }>();
  const reward = await recomputeUserRewards(db, review.user_id);

  return {
    helpfulCount: updated?.helpful_count ?? 0,
    viewerHelpful: vote,
    authorId: review.user_id,
    reward
  };
}

export async function adjustUserPoints(
  db: D1Database,
  userId: string,
  points: number,
  reason: string,
  adminId: string
): Promise<RewardRecomputeResult> {
  await db
    .prepare(
      "INSERT INTO reward_adjustments (id, user_id, points, reason, admin_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(crypto.randomUUID(), userId, points, reason, adminId, new Date().toISOString())
    .run();
  return recomputeUserRewards(db, userId);
}

export async function getRewardsLeaderboard(db: D1Database): Promise<RewardsLeaderboardDto> {
  const result = await db
    .prepare(
      `SELECT ur.user_id, ur.level, ur.total_points, ur.published_reviews, ur.helpful_received,
        (SELECT COUNT(*) FROM user_badges ub WHERE ub.user_id = ur.user_id) AS badge_count
       FROM user_rewards ur
       JOIN users u ON u.id = ur.user_id
       WHERE u.deleted_at IS NULL
       ORDER BY ur.total_points DESC, ur.helpful_received DESC, ur.updated_at ASC
       LIMIT 100`
    )
    .all<{
      user_id: string;
      level: number;
      total_points: number;
      published_reviews: number;
      helpful_received: number;
      badge_count: number;
    }>();

  return {
    entries: result.results.map((row) => ({
      userId: row.user_id,
      level: row.level,
      points: row.total_points,
      publishedReviews: row.published_reviews,
      helpfulReceived: row.helpful_received,
      badgeCount: row.badge_count
    }))
  };
}

export async function recomputeAllUserRewards(db: D1Database): Promise<number> {
  const users = await db.prepare("SELECT id FROM users WHERE deleted_at IS NULL").all<{ id: string }>();
  for (const user of users.results) {
    await recomputeUserRewards(db, user.id);
  }
  return users.results.length;
}

export async function notifyRewardProgress(
  env: Env,
  userId: string,
  result: RewardRecomputeResult
): Promise<void> {
  if (!result.levelChanged && result.newBadges.length === 0) return;
  const lines: string[] = [];
  if (result.levelChanged) lines.push(`You reached level ${result.row.level}.`);
  if (result.newBadges.length > 0) {
    lines.push(`New badge${result.newBadges.length === 1 ? "" : "s"}: ${result.newBadges.map((badge) => badge.label).join(", ")}.`);
  }
  if (lines.length > 0) await notifyUser(env, userId, lines.join("\n"));
}
