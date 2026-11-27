import type {
  AdminQueueDto,
  AdminReportDto,
  AdminReviewDto,
  AdminStatsDto,
  AuthorBadgeDto,
  CourseDetailDto,
  CourseAnswerDto,
  CourseDto,
  CourseQuestionDto,
  DimensionDto,
  EntityDetailDto,
  EntityDto,
  FacultyPercentileDto,
  MyReviewDto,
  ProgramDetailDto,
  ProgramDto,
  RatingDistributionDto,
  ReviewAccessDto,
  ReviewDto,
  ReviewStatus,
  ScoreDto,
  StatDto,
  StatsDto,
  TargetType,
  UserDto,
  WouldTakeAgainDto
} from "@pintukaca/shared";
import {
  REVIEW_EDIT_WINDOW_DAYS,
  REWARD_THEMES,
  unlockedRewardThemes,
  type RewardTheme
} from "@pintukaca/shared";
import type { CourseRow, DimensionRow, EntityRow, ProgramRow, ReviewRow, StatsRow, UserRow } from "../env";
import { searchItems } from "../lib/search";
import { COURSE_BY_ID, COURSE_INDEX, type CourseEntry } from "../lib/course-index";
import { getAuthorAchievements } from "../lib/rewards";
import { dayStartIso, shiftDay, statsDay } from "../lib/activity";

/**
 * Canonical faculty expression.
 *
 * The catalogue is reseeded from several dumps that disagree on casing and
 * abbreviations: clubs arrive in Title Case, programmes ship "UMCCED" and the
 * singular "FACULTY OF SPORTS AND EXERCISE SCIENCE", while courses use the
 * uppercase plural form. Normalising at query time keeps the filter list and
 * the filters themselves consistent no matter which dump seeded the table last.
 */
const canonicalFacultySql = (column: string) => `CASE
  WHEN UPPER(TRIM(${column})) = 'FACULTY OF SPORTS AND EXERCISE SCIENCE'
    THEN 'FACULTY OF SPORTS AND EXERCISE SCIENCES'
  WHEN UPPER(TRIM(${column})) = 'UMCCED'
    THEN 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)'
  ELSE UPPER(TRIM(${column}))
END`;

export interface TargetRef {
  id: string;
  code: string;
  name: string;
  type: TargetType;
}

interface AdminReviewRow extends ReviewRow {
  target_code: string | null;
  target_name: string | null;
  report_count: number;
}

interface MyReviewRow extends ReviewRow {
  target_code: string | null;
  target_name: string | null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseFlags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseAliases(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { aliases?: unknown };
    return Array.isArray(parsed.aliases)
      ? parsed.aliases.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function mapCourseDto(row: CourseRow): CourseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    faculty: row.faculty,
    department: row.department,
    credits: row.credits,
    stats: {
      overall: {
        key: "overall",
        label: "Overall",
        count: row.overall_count ?? 0,
        avg: round(row.overall_avg ?? 0)
      },
      dimensions: []
    }
  };
}

function mapProgramDto(row: ProgramRow): ProgramDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    faculty: row.faculty,
    level: row.level,
    stats: {
      overall: {
        key: "overall",
        label: "Overall",
        count: row.overall_count ?? 0,
        avg: round(row.overall_avg ?? 0)
      },
      dimensions: []
    }
  };
}

function mapEntityDto(row: EntityRow & { overall_avg?: number; overall_count?: number }): EntityDto {
  return {
    id: row.id,
    type: row.type as TargetType,
    code: row.code,
    name: row.name,
    faculty: row.faculty,
    category: row.category,
    description: row.description,
    stats: {
      overall: {
        key: "overall",
        label: "Overall",
        count: row.overall_count ?? 0,
        avg: round(row.overall_avg ?? 0)
      },
      dimensions: []
    }
  };
}

// Dimensions are 19 static rows read on every course/programme page (via
// getStats) and on the review form. Cache them per isolate.
const DIMENSIONS_TTL_MS = 10 * 60 * 1000;
let dimensionsCache: { at: number; rows: DimensionRow[] } | null = null;

export async function getDimensions(db: D1Database, targetType?: TargetType): Promise<DimensionRow[]> {
  const now = Date.now();
  if (!dimensionsCache || now - dimensionsCache.at >= DIMENSIONS_TTL_MS) {
    const result = await db
      .prepare("SELECT * FROM dimensions WHERE active = 1 ORDER BY applies_to, sort_order")
      .all<DimensionRow>();
    dimensionsCache = { at: now, rows: result.results };
  }
  const rows = dimensionsCache.rows;
  return targetType ? rows.filter((row) => row.applies_to === targetType) : rows;
}

export function toDimensionDto(row: DimensionRow): DimensionDto {
  return {
    key: row.key,
    label: row.label,
    appliesTo: row.applies_to as TargetType,
    min: row.min_score,
    max: row.max_score,
    sort: row.sort_order,
    lowLabel: row.low_label ?? null,
    highLabel: row.high_label ?? null
  };
}

export async function getStats(db: D1Database, targetType: TargetType, targetId: string): Promise<StatsDto> {
  const [dimensions, stats] = await Promise.all([
    getDimensions(db, targetType),
    db
      .prepare("SELECT * FROM review_stats WHERE target_type = ? AND target_id = ?")
      .bind(targetType, targetId)
      .all<StatsRow>()
  ]);

  const byKey = new Map(stats.results.map((row) => [row.dimension_key, row]));
  const overallRow = byKey.get("overall");
  const overall: StatDto = {
    key: "overall",
    label: "Overall",
    count: overallRow?.review_count ?? 0,
    avg: round(overallRow?.score_avg ?? 0)
  };

  const dimensionStats: StatDto[] = dimensions.map((dimension) => {
    const row = byKey.get(dimension.key);
    return {
      key: dimension.key,
      label: dimension.label,
      count: row?.review_count ?? 0,
      avg: round(row?.score_avg ?? 0),
      lowLabel: dimension.low_label ?? null,
      highLabel: dimension.high_label ?? null
    };
  });

  return { overall, dimensions: dimensionStats };
}

/** How many courses the browse and search list returns at once. */
const COURSE_LIST_LIMIT = 20;

/**
 * Loads overall aggregates for a set of courses in a single query. Only the
 * ~50 matched results are looked up, so search no longer reads the whole
 * catalogue out of D1.
 */
async function getCourseOverallStats(
  db: D1Database,
  ids: string[]
): Promise<Map<string, { avg: number; count: number }>> {
  const stats = new Map<string, { avg: number; count: number }>();
  if (ids.length === 0) return stats;
  const placeholders = ids.map(() => "?").join(",");
  const result = await db
    .prepare(
      `SELECT target_id, score_avg, review_count FROM review_stats
       WHERE target_type = 'course' AND dimension_key = 'overall'
         AND target_id IN (${placeholders})`
    )
    .bind(...ids)
    .all<{ target_id: string; score_avg: number; review_count: number }>();
  for (const row of result.results) {
    stats.set(row.target_id, { avg: row.score_avg, count: row.review_count });
  }
  return stats;
}

/**
 * Browse ordering: most-reviewed first, then most recently reviewed, then fill
 * the remainder round-robin across faculties. Alphabetical order surfaced
 * AA011001 and friends, which is useless for discovery.
 */
async function pickBrowseCourses(
  db: D1Database,
  pool: CourseEntry[],
  faculty: string,
  limit: number
): Promise<CourseEntry[]> {
  const rows = await db
    .prepare(
      `SELECT s.target_id AS id, MAX(r.updated_at) AS last_at
       FROM review_stats s
       JOIN courses c ON c.id = s.target_id
       LEFT JOIN reviews r
         ON r.target_type = 'course' AND r.target_id = c.id
         AND r.status = 'published' AND r.deleted_at IS NULL
       WHERE s.target_type = 'course' AND s.dimension_key = 'overall' AND s.review_count > 0
         AND (? = '' OR c.faculty = ?)
       GROUP BY s.target_id
       ORDER BY s.review_count DESC, last_at DESC, c.code ASC
       LIMIT ?`
    )
    .bind(faculty, faculty, limit)
    .all<{ id: string; last_at: string | null }>();

  const picks: CourseEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows.results) {
    const entry = COURSE_BY_ID.get(row.id);
    if (entry && !seen.has(entry.code)) {
      picks.push(entry);
      seen.add(entry.code);
    }
  }

  if (picks.length >= limit) return picks;

  // Not enough reviewed courses yet: spread the rest across faculties so the
  // page is not another alphabetical run.
  const groups = new Map<string, CourseEntry[]>();
  for (const entry of pool) {
    if (seen.has(entry.code)) continue;
    const list = groups.get(entry.faculty) ?? [];
    list.push(entry);
    groups.set(entry.faculty, list);
  }
  const keys = [...groups.keys()].sort();
  for (let round = 0; picks.length < limit; round += 1) {
    let added = false;
    for (const key of keys) {
      const entry = groups.get(key)?.[round];
      if (!entry) continue;
      picks.push(entry);
      added = true;
      if (picks.length >= limit) break;
    }
    if (!added) break;
  }
  return picks;
}

export async function listCourses(db: D1Database, query: string, faculty: string): Promise<CourseDto[]> {
  const pool = faculty ? COURSE_INDEX.filter((entry) => entry.faculty === faculty) : COURSE_INDEX;

  let matched: CourseEntry[];
  if (!query) {
    matched = await pickBrowseCourses(db, pool, faculty, COURSE_LIST_LIMIT);
  } else {
    const documents = pool.map((entry) => ({
      ...entry,
      aliases: [],
      category: null,
      level: null,
      description: null,
      // Popularity is not known without a database read; relevance carries the
      // ranking instead. Review counts are merged in below.
      popularity: 0
    }));
    const hits = searchItems(documents, query, { limit: COURSE_LIST_LIMIT, faculty });
    const byCode = new Map(pool.map((entry) => [entry.code, entry]));
    matched = hits
      .map((hit) => byCode.get(hit.code))
      .filter((entry): entry is CourseEntry => entry !== undefined);
  }

  const stats = await getCourseOverallStats(db, matched.map((entry) => entry.id));
  return matched.map((entry) => {
    const aggregate = stats.get(entry.id);
    return mapCourseDto({
      ...entry,
      overall_avg: aggregate?.avg ?? 0,
      overall_count: aggregate?.count ?? 0
    });
  });
}

export async function listPrograms(
  db: D1Database,
  query: string,
  faculty: string,
  level = ""
): Promise<ProgramDto[]> {
  const baseSelect = `SELECT p.id, p.code, p.name, p.faculty, p.level,
    COALESCE(s.score_avg, 0) AS overall_avg, COALESCE(s.review_count, 0) AS overall_count
    FROM programs p
    LEFT JOIN review_stats s ON s.target_type = 'program' AND s.target_id = p.id AND s.dimension_key = 'overall'`;
  const levelOrder = `CASE p.level
    WHEN 'foundation' THEN 1
    WHEN 'diploma' THEN 2
    WHEN 'undergraduate' THEN 3
    WHEN 'postgraduate' THEN 4
    ELSE 5 END`;
  const filters = (sql: string, params: (string | number)[]) => {
    if (faculty) {
      sql += ` AND ${canonicalFacultySql("p.faculty")} = ?`;
      params.push(faculty);
    }
    if (level) {
      sql += " AND p.level = ?";
      params.push(level);
    }
    return sql;
  };

  if (!query) {
    const params: (string | number)[] = [];
    const sql = filters(`${baseSelect} WHERE 1 = 1`, params) + ` ORDER BY ${levelOrder} ASC, p.name ASC LIMIT 500`;
    const result = await db.prepare(sql).bind(...params).all<ProgramRow>();
    return result.results.map(mapProgramDto);
  }

  const params: (string | number)[] = [];
  const sql = filters(`${baseSelect} WHERE 1 = 1`, params) + ` ORDER BY ${levelOrder} ASC, p.name ASC LIMIT 500`;
  const result = await db.prepare(sql).bind(...params).all<ProgramRow>();
  const documents = result.results.map((row) => ({
    ...row,
    aliases: [],
    category: null,
    department: null,
    description: null,
    popularity: row.overall_count ?? 0
  }));
  return searchItems(documents, query, { limit: 500, faculty }).map(mapProgramDto);
}

export async function findTarget(db: D1Database, targetType: TargetType, code: string): Promise<TargetRef | null> {
  const normalized = code.trim();
  const row = await db
    .prepare("SELECT id, code, name, type FROM targets WHERE type = ? AND code = ? COLLATE NOCASE LIMIT 1")
    .bind(targetType, normalized)
    .first<{ id: string; code: string; name: string; type: string }>();
  return row ? { id: row.id, code: row.code, name: row.name, type: row.type as TargetType } : null;
}

async function getScoresForReviews(
  db: D1Database,
  reviewIds: string[]
): Promise<Map<string, ScoreDto[]>> {
  const map = new Map<string, ScoreDto[]>();
  if (reviewIds.length === 0) return map;
  const placeholders = reviewIds.map(() => "?").join(",");
  const result = await db
    .prepare(
      `SELECT rs.review_id, rs.dimension_key, rs.score, d.label
       FROM review_scores rs
       JOIN dimensions d ON d.key = rs.dimension_key
       WHERE rs.review_id IN (${placeholders})
       ORDER BY d.sort_order`
    )
    .bind(...reviewIds)
    .all<{ review_id: string; dimension_key: string; score: number; label: string }>();

  for (const row of result.results) {
    const list = map.get(row.review_id) ?? [];
    list.push({ key: row.dimension_key, label: row.label, score: row.score });
    map.set(row.review_id, list);
  }
  return map;
} 

async function getSemestersForReviews(
  db: D1Database,
  reviewIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (reviewIds.length === 0) return map;
  const placeholders = reviewIds.map(() => "?").join(",");
  const result = await db
    .prepare(
      `SELECT review_id, semester FROM review_semesters
       WHERE review_id IN (${placeholders})
       ORDER BY semester ASC`
    )
    .bind(...reviewIds)
    .all<{ review_id: string; semester: string }>();
  for (const row of result.results) {
    const list = map.get(row.review_id) ?? [];
    list.push(row.semester);
    map.set(row.review_id, list);
  }
  return map;
}

function monthTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

interface ReviewPresentation {
  viewerVotes: Set<string>;
  achievements: Map<string, { level: number; badges: AuthorBadgeDto[]; show: boolean }>;
}

async function getReviewPresentation(
  db: D1Database,
  rows: ReviewRow[],
  viewerId: string | null
): Promise<ReviewPresentation> {
  const achievements = await getAuthorAchievements(
    db,
    rows.map((row) => row.user_id)
  );
  const viewerVotes = new Set<string>();
  if (viewerId && rows.length > 0) {
    const placeholders = rows.map(() => "?").join(",");
    const votes = await db
      .prepare(
        `SELECT review_id FROM review_votes
         WHERE voter_user_id = ? AND vote_type = 'helpful' AND review_id IN (${placeholders})`
      )
      .bind(viewerId, ...rows.map((row) => row.id))
      .all<{ review_id: string }>();
    for (const vote of votes.results) viewerVotes.add(vote.review_id);
  }
  return { viewerVotes, achievements };
}

function mapReview(
  row: ReviewRow,
  scores: ScoreDto[],
  viewerId: string | null,
  presentation: ReviewPresentation,
  semesters: string[]
): ReviewDto {
  const isOwner = Boolean(viewerId && row.user_id === viewerId);
  const createdAt = Date.parse(row.created_at);
  const canEdit =
    isOwner && Number.isFinite(createdAt)
      ? Date.now() - createdAt <= REVIEW_EDIT_WINDOW_DAYS * 86400000
      : false;
  const achievement = presentation.achievements.get(row.user_id);
  const showAchievements = achievement?.show ?? true;
  return {
    id: row.id,
    alias: row.alias,
    title: row.title,
    body: row.body,
    semesters,
    overall: row.overall_rating ?? null,
    status: row.status as ReviewStatus,
    flags: isOwner ? parseFlags(row.flags_json) : [],
    createdAt: isOwner ? row.created_at : monthTimestamp(row.created_at),
    updatedAt: isOwner ? row.updated_at : monthTimestamp(row.updated_at),
    canEdit,
    isOwner,
    scores,
    helpfulCount: row.helpful_count ?? 0,
    viewerHelpful: presentation.viewerVotes.has(row.id),
    wouldTakeAgain:
      row.would_take_again === null || row.would_take_again === undefined
        ? null
        : Boolean(row.would_take_again),
    authorLevel: showAchievements ? achievement?.level ?? 1 : 0,
    authorBadges: showAchievements ? achievement?.badges ?? [] : []
  };
}

export type ReviewSort = "newest" | "helpful";

export async function listReviews(
  db: D1Database,
  targetType: TargetType,
  targetId: string,
  page: number,
  limit: number,
  viewerId: string | null,
  sort: ReviewSort = "newest",
  semester = ""
): Promise<{ reviews: ReviewDto[]; hasMore: boolean }> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const orderBy = sort === "helpful" ? "helpful_count DESC, created_at DESC" : "created_at DESC";
  const semesterFilter = semester
    ? " AND EXISTS (SELECT 1 FROM review_semesters rs WHERE rs.review_id = reviews.id AND rs.semester = ?)"
    : "";
  const params: (string | number)[] = [targetType, targetId];
  if (semester) params.push(semester);
  params.push(safeLimit + 1, offset);
  const result = await db
    .prepare(
      `SELECT * FROM reviews
       WHERE target_type = ? AND target_id = ? AND status = 'published' AND deleted_at IS NULL${semesterFilter}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .bind(...params)
    .all<ReviewRow>();

  const rows = result.results;
  const hasMore = rows.length > safeLimit;
  const pageRows = hasMore ? rows.slice(0, safeLimit) : rows;
  const scores = await getScoresForReviews(
    db,
    pageRows.map((row) => row.id)
  );
  const semesters = await getSemestersForReviews(
    db,
    pageRows.map((row) => row.id)
  );
  const presentation = await getReviewPresentation(db, pageRows, viewerId);
  return {
    reviews: pageRows.map((row) =>
      mapReview(row, scores.get(row.id) ?? [], viewerId, presentation, semesters.get(row.id) ?? [])
    ),
    hasMore
  };
}

/**
 * Course review text is gated behind recent contribution: a student must have
 * posted COURSE_REVIEW_ACCESS_REQUIRED course reviews inside a rolling window
 * to read other students' course reviews. Aggregates stay visible either way,
 * and submitting a review is never blocked.
 */
export const COURSE_REVIEW_ACCESS_REQUIRED = 2;
export const COURSE_REVIEW_ACCESS_WINDOW_DAYS = 60;
/** A qualifying review must contain a written note, not just stars. */
export const COURSE_REVIEW_ACCESS_MIN_BODY = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewViewer {
  id: string;
  role: string;
}

export async function getCourseReviewAccess(
  db: D1Database,
  viewer: ReviewViewer | null,
  now = Date.now()
): Promise<ReviewAccessDto> {
  const base: ReviewAccessDto = {
    locked: true,
    required: COURSE_REVIEW_ACCESS_REQUIRED,
    submitted: 0,
    windowDays: COURSE_REVIEW_ACCESS_WINDOW_DAYS,
    unlocksAt: null
  };

  if (!viewer) return base;
  // Admins moderate the queue and must always be able to read the text.
  if (viewer.role === "admin") {
    return { ...base, locked: false, submitted: COURSE_REVIEW_ACCESS_REQUIRED };
  }

  const cutoff = new Date(now - COURSE_REVIEW_ACCESS_WINDOW_DAYS * DAY_MS).toISOString();
  const result = await db
    .prepare(
      `SELECT created_at FROM reviews
       WHERE user_id = ?
         AND target_type = 'course'
         AND deleted_at IS NULL
         AND status IN ('published', 'pending')
         AND created_at >= ?
         AND LENGTH(TRIM(COALESCE(body, ''))) >= ?
       ORDER BY created_at ASC`
    )
    .bind(viewer.id, cutoff, COURSE_REVIEW_ACCESS_MIN_BODY)
    .all<{ created_at: string }>();

  const counted = result.results;
  const submitted = counted.length;
  if (submitted < COURSE_REVIEW_ACCESS_REQUIRED) {
    return { ...base, submitted };
  }

  // Drop back to `required - 1` when the (submitted - required + 1)-th oldest
  // review ages out; that is the moment the viewer loses access again.
  const expiring = counted[submitted - COURSE_REVIEW_ACCESS_REQUIRED];
  const createdAt = Date.parse(expiring.created_at);
  const unlocksAt = Number.isFinite(createdAt)
    ? new Date(createdAt + COURSE_REVIEW_ACCESS_WINDOW_DAYS * DAY_MS).toISOString()
    : null;

  return { ...base, locked: false, submitted, unlocksAt };
}

/** Buckets published reviews by their rounded per-review average. */
export async function getRatingDistribution(
  db: D1Database,
  targetType: TargetType,
  targetId: string
): Promise<RatingDistributionDto> {
  const result = await db
    .prepare(
      `SELECT overall_rating AS bucket, COUNT(*) AS n
       FROM reviews
       WHERE target_type = ? AND target_id = ?
         AND status = 'published' AND deleted_at IS NULL
         AND overall_rating IS NOT NULL
       GROUP BY overall_rating`
    )
    .bind(targetType, targetId)
    .all<{ bucket: number; n: number }>();

  const buckets = [0, 0, 0, 0, 0];
  let total = 0;
  for (const row of result.results) {
    const index = Math.min(5, Math.max(1, Number(row.bucket))) - 1;
    buckets[index] += Number(row.n);
    total += Number(row.n);
  }
  return { buckets, total };
}

export async function getWouldTakeAgain(
  db: D1Database,
  targetType: TargetType,
  targetId: string
): Promise<WouldTakeAgainDto | null> {
  const row = await db
    .prepare(
      `SELECT SUM(CASE WHEN would_take_again = 1 THEN 1 ELSE 0 END) AS yes,
              COUNT(would_take_again) AS total
       FROM reviews
       WHERE target_type = ? AND target_id = ?
         AND status = 'published' AND deleted_at IS NULL`
    )
    .bind(targetType, targetId)
    .first<{ yes: number | null; total: number }>();

  const total = Number(row?.total ?? 0);
  if (total === 0) return null;
  const yes = Number(row?.yes ?? 0);
  return { yes, total, percent: Math.round((yes / total) * 100) };
}

/**
 * Where this course's difficulty sits among reviewed courses in the same
 * faculty. Returns null when the sample is too small to mean anything.
 */
export async function getFacultyPercentile(
  db: D1Database,
  courseId: string,
  faculty: string
): Promise<FacultyPercentileDto | null> {
  const dimensionKey = "course_difficulty";
  const mine = await db
    .prepare(
      `SELECT score_avg FROM review_stats
       WHERE target_type = 'course' AND target_id = ? AND dimension_key = ? AND review_count > 0`
    )
    .bind(courseId, dimensionKey)
    .first<{ score_avg: number }>();
  if (!mine) return null;

  const agg = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN s.score_avg < ? THEN 1 ELSE 0 END) AS below
       FROM review_stats s
       JOIN courses c ON c.id = s.target_id
       WHERE s.target_type = 'course' AND s.dimension_key = ?
         AND s.review_count > 0 AND c.faculty = ?`
    )
    .bind(mine.score_avg, dimensionKey, faculty)
    .first<{ total: number; below: number | null }>();

  const total = Number(agg?.total ?? 0);
  if (total < 3) return null;
  const below = Number(agg?.below ?? 0);
  return {
    dimensionKey,
    label: "Difficulty",
    percentile: Math.round((below / total) * 100),
    sampleSize: total,
    faculty
  };
}

/** Distinct semesters among published reviews, most common first. */
export async function getReviewSemesters(
  db: D1Database,
  targetType: TargetType,
  targetId: string
): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT rs.semester AS semester, COUNT(*) AS n
       FROM review_semesters rs
       JOIN reviews r ON r.id = rs.review_id
       WHERE r.target_type = ? AND r.target_id = ?
         AND r.status = 'published' AND r.deleted_at IS NULL
         AND TRIM(rs.semester) <> ''
       GROUP BY rs.semester
       ORDER BY n DESC, rs.semester DESC
       LIMIT 12`
    )
    .bind(targetType, targetId)
    .all<{ semester: string; n: number }>();
  return result.results.map((row) => row.semester);
}

/**
 * Questions are entirely user-generated — nothing is seeded. Answers are loaded
 * in one query and grouped in memory, so a course page costs two reads.
 */
export async function listCourseQuestions(
  db: D1Database,
  courseId: string,
  viewerId: string | null
): Promise<CourseQuestionDto[]> {
  const questions = await db
    .prepare(
      `SELECT id, user_id, alias, body, created_at FROM course_questions
       WHERE course_id = ? AND status = 'published' AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .bind(courseId)
    .all<{ id: string; user_id: string; alias: string; body: string; created_at: string }>();

  const rows = questions.results;
  if (rows.length === 0) return [];

  const placeholders = rows.map(() => "?").join(",");
  const answers = await db
    .prepare(
      `SELECT id, question_id, user_id, alias, body, created_at FROM course_answers
       WHERE question_id IN (${placeholders}) AND status = 'published' AND deleted_at IS NULL
       ORDER BY created_at ASC`
    )
    .bind(...rows.map((row) => row.id))
    .all<{ id: string; question_id: string; user_id: string; alias: string; body: string; created_at: string }>();

  const byQuestion = new Map<string, CourseAnswerDto[]>();
  for (const answer of answers.results) {
    const list = byQuestion.get(answer.question_id) ?? [];
    list.push({
      id: answer.id,
      alias: answer.alias,
      body: answer.body,
      createdAt: answer.created_at,
      isOwner: Boolean(viewerId && answer.user_id === viewerId)
    });
    byQuestion.set(answer.question_id, list);
  }

  return rows.map((row) => {
    const list = byQuestion.get(row.id) ?? [];
    return {
      id: row.id,
      alias: row.alias,
      body: row.body,
      createdAt: row.created_at,
      isOwner: Boolean(viewerId && row.user_id === viewerId),
      answers: list,
      answerCount: list.length
    };
  });
}

export async function getCourseIdByCode(db: D1Database, code: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM courses WHERE code = ?")
    .bind(code.trim().toUpperCase())
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function getCourseDetail(
  db: D1Database,
  code: string,
  page: number,
  viewer: ReviewViewer | null,
  sort: ReviewSort = "newest",
  semester = ""
): Promise<CourseDetailDto | null> {
  const row = await db
    .prepare("SELECT id, code, name, faculty, department, credits FROM courses WHERE code = ?")
    .bind(code.trim().toUpperCase())
    .first<CourseRow>();
  if (!row) return null;
  const access = await getCourseReviewAccess(db, viewer);
  const [stats, distribution, wouldTakeAgain, percentile, semesters, visible] = await Promise.all([
    getStats(db, "course", row.id),
    getRatingDistribution(db, "course", row.id),
    getWouldTakeAgain(db, "course", row.id),
    getFacultyPercentile(db, row.id, row.faculty),
    getReviewSemesters(db, "course", row.id),
    access.locked
      ? Promise.resolve({ reviews: [] as ReviewDto[], hasMore: false })
      : listReviews(db, "course", row.id, page, 20, viewer?.id ?? null, sort, semester)
  ]);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    faculty: row.faculty,
    department: row.department,
    credits: row.credits,
    stats,
    reviews: visible.reviews,
    hasMore: visible.hasMore,
    reviewAccess: access,
    ratingDistribution: distribution,
    wouldTakeAgain,
    facultyPercentile: percentile,
    semesters
  };
}

export async function getProgramDetail(
  db: D1Database,
  code: string,
  page: number,
  viewerId: string | null,
  sort: ReviewSort = "newest"
): Promise<ProgramDetailDto | null> {
  const row = await db
    .prepare("SELECT id, code, name, faculty, level FROM programs WHERE code = ?")
    .bind(code.trim().toUpperCase())
    .first<ProgramRow>();
  if (!row) return null;
  const [stats, reviews] = await Promise.all([
    getStats(db, "program", row.id),
    listReviews(db, "program", row.id, page, 20, viewerId, sort)
  ]);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    faculty: row.faculty,
    level: row.level,
    stats,
    reviews: reviews.reviews,
    hasMore: reviews.hasMore
  };
}

export interface CategoryCount {
  value: string;
  count: number;
}

export async function getCategories(db: D1Database, type: TargetType): Promise<CategoryCount[]> {
  const result = await db
    .prepare(
      `SELECT category AS value, COUNT(*) AS count
       FROM entities
       WHERE active = 1 AND type = ? AND category IS NOT NULL AND category != ''
       GROUP BY category
       ORDER BY category ASC`
    )
    .bind(type)
    .all<CategoryCount>();
  return result.results;
}

export async function listEntities(
  db: D1Database,
  type: TargetType,
  query: string,
  faculty: string,
  category = ""
): Promise<EntityDto[]> {
  const baseSelect = `SELECT e.id, e.type, e.code, e.name, e.faculty, e.category, e.description, e.metadata_json,
    COALESCE(s.score_avg, 0) AS overall_avg, COALESCE(s.review_count, 0) AS overall_count
    FROM entities e
    LEFT JOIN review_stats s ON s.target_type = e.type AND s.target_id = e.id AND s.dimension_key = 'overall'`;

  if (!query) {
    let sql = `${baseSelect} WHERE e.active = 1 AND e.type = ?`;
    const params: (string | number)[] = [type];
    if (faculty) {
      sql += ` AND ${canonicalFacultySql("e.faculty")} = ?`;
      params.push(faculty);
    }
    if (category) {
      sql += " AND e.category = ?";
      params.push(category);
    }
    sql += " ORDER BY e.name ASC LIMIT 500";
    const result = await db
      .prepare(sql)
      .bind(...params)
      .all<EntityRow & { overall_avg?: number; overall_count?: number }>();
    return result.results.map(mapEntityDto);
  }

  let sql = `${baseSelect} WHERE e.active = 1 AND e.type = ?`;
  const params: (string | number)[] = [type];
  if (faculty) {
    sql += " AND e.faculty = ?";
    params.push(faculty);
  }
  if (category) {
    sql += " AND e.category = ?";
    params.push(category);
  }
  sql += " LIMIT 1000";
  const result = await db
    .prepare(sql)
    .bind(...params)
    .all<EntityRow & { overall_avg?: number; overall_count?: number }>();
  const documents = result.results.map((row) => ({
    ...row,
    aliases: parseAliases(row.metadata_json),
    popularity: row.overall_count ?? 0
  }));
  return searchItems(documents, query, { limit: 500, faculty, category }).map(mapEntityDto);
}

export async function getEntityDetail(
  db: D1Database,
  type: TargetType,
  code: string,
  page: number,
  viewerId: string | null,
  sort: ReviewSort = "newest"
): Promise<EntityDetailDto | null> {
  const row = await db
    .prepare(
      "SELECT id, type, code, name, faculty, category, description FROM entities WHERE type = ? AND code = ? COLLATE NOCASE AND active = 1 LIMIT 1"
    )
    .bind(type, code.trim())
    .first<EntityRow>();
  if (!row) return null;
  const [stats, reviews] = await Promise.all([
    getStats(db, type, row.id),
    listReviews(db, type, row.id, page, 20, viewerId, sort)
  ]);
  return {
    id: row.id,
    type: row.type as TargetType,
    code: row.code,
    name: row.name,
    faculty: row.faculty,
    category: row.category,
    description: row.description,
    stats,
    reviews: reviews.reviews,
    hasMore: reviews.hasMore
  };
}

export async function getMyReviews(db: D1Database, userId: string): Promise<MyReviewDto[]> {
  const result = await db
    .prepare(
      `SELECT r.*, t.code AS target_code, t.name AS target_name
       FROM reviews r
       LEFT JOIN targets t ON t.type = r.target_type AND t.id = r.target_id
       WHERE r.user_id = ? AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC
       LIMIT 200`
    )
    .bind(userId)
    .all<MyReviewRow>();

  const scores = await getScoresForReviews(
    db,
    result.results.map((row) => row.id)
  );
  const semesters = await getSemestersForReviews(
    db,
    result.results.map((row) => row.id)
  );
  const presentation = await getReviewPresentation(db, result.results, userId);
  return result.results.map((row) => ({
    ...mapReview(row, scores.get(row.id) ?? [], userId, presentation, semesters.get(row.id) ?? []),
    targetType: row.target_type as TargetType,
    targetCode: row.target_code ?? "",
    targetName: row.target_name ?? ""
  }));
}

export async function countUserReviews(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM reviews WHERE user_id = ? AND deleted_at IS NULL")
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function toUserDto(db: D1Database, user: UserRow): Promise<UserDto> {
  const [reviewCount, rewards] = await Promise.all([
    countUserReviews(db, user.id),
    db
      .prepare("SELECT level, theme FROM user_rewards WHERE user_id = ?")
      .bind(user.id)
      .first<{ level: number; theme: string }>()
  ]);
  const level = rewards?.level ?? 1;
  // Clamp to the themes this level has actually unlocked. Without this, anyone
  // who selected a theme before the unlock level was raised keeps it forever.
  const unlocked = unlockedRewardThemes(level) as readonly string[];
  const theme =
    rewards?.theme && unlocked.includes(rewards.theme) ? (rewards.theme as RewardTheme) : "default";
  return {
    id: user.id,
    verified: Boolean(user.verified_at),
    role: user.role === "admin" ? "admin" : "student",
    createdAt: user.created_at,
    verifiedAt: user.verified_at,
    reviewCount,
    level,
    theme
  };
}

export async function recomputeStats(db: D1Database, targetType: TargetType, targetId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM review_stats WHERE target_type = ? AND target_id = ?").bind(targetType, targetId),
    db
      .prepare(
        `INSERT INTO review_stats (target_type, target_id, dimension_key, review_count, score_sum, score_avg, updated_at)
         SELECT ?, ?, 'overall', COUNT(overall_rating), COALESCE(SUM(overall_rating), 0), COALESCE(AVG(overall_rating), 0), ?
         FROM reviews
         WHERE target_type = ? AND target_id = ? AND status = 'published' AND deleted_at IS NULL
           AND overall_rating IS NOT NULL`
      )
      .bind(targetType, targetId, now, targetType, targetId),
    db
      .prepare(
        `INSERT INTO review_stats (target_type, target_id, dimension_key, review_count, score_sum, score_avg, updated_at)
         SELECT ?, ?, s.dimension_key, COUNT(*), SUM(s.score), AVG(s.score), ?
         FROM reviews r
         JOIN review_scores s ON s.review_id = r.id
         WHERE r.target_type = ? AND r.target_id = ? AND r.status = 'published' AND r.deleted_at IS NULL
         GROUP BY s.dimension_key`
      )
      .bind(targetType, targetId, now, targetType, targetId)
  ]);
}

export async function isBanned(db: D1Database, userId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const row = await db
    .prepare("SELECT id FROM bans WHERE user_id = ? AND (until IS NULL OR until > ?) LIMIT 1")
    .bind(userId, now)
    .first<{ id: string }>();
  return Boolean(row);
}

// The faculty list is 24 strings derived from a full scan of `targets` (5k+
// rows, no usable index). Cache it per isolate so an app open doesn't re-read
// the whole table every time.
const FACULTIES_TTL_MS = 10 * 60 * 1000;
let facultiesCache: { at: number; rows: string[] } | null = null;

export async function getFaculties(db: D1Database): Promise<string[]> {
  const now = Date.now();
  if (facultiesCache && now - facultiesCache.at < FACULTIES_TTL_MS) {
    return facultiesCache.rows;
  }
  // Canonicalise here rather than relying on the stored data: re-running the
  // seed files rewrites faculty values in whatever casing the source dump used.
  const result = await db
    .prepare(
      `SELECT DISTINCT ${canonicalFacultySql("faculty")} AS faculty
       FROM targets
       WHERE faculty IS NOT NULL AND TRIM(faculty) <> ''
       ORDER BY faculty`
    )
    .all<{ faculty: string }>();
  const rows = result.results.map((row) => row.faculty);
  facultiesCache = { at: now, rows };
  return rows;
}

export async function getAdminQueue(db: D1Database): Promise<AdminQueueDto> {
  const [reviews, reports, stats] = await Promise.all([
    db
      .prepare(
        `SELECT r.*, t.code AS target_code, t.name AS target_name,
          (SELECT COUNT(*) FROM reports rp WHERE rp.review_id = r.id AND rp.status = 'open') AS report_count
         FROM reviews r
         LEFT JOIN targets t ON t.type = r.target_type AND t.id = r.target_id
         WHERE r.deleted_at IS NULL AND (
           r.status = 'pending' OR EXISTS (SELECT 1 FROM reports rp WHERE rp.review_id = r.id AND rp.status = 'open')
         )
         ORDER BY r.created_at DESC
         LIMIT 100`
      )
      .all<AdminReviewRow>(),
    db
      .prepare(
        `SELECT rp.id, rp.review_id, rp.reason, rp.details, rp.status, rp.created_at, r.alias,
          t.code AS target_code
         FROM reports rp
         JOIN reviews r ON r.id = rp.review_id
         LEFT JOIN targets t ON t.type = r.target_type AND t.id = r.target_id
         WHERE rp.status = 'open' AND r.deleted_at IS NULL
         ORDER BY rp.created_at DESC
         LIMIT 100`
      )
      .all<{
        id: string;
        review_id: string;
        reason: string;
        details: string | null;
        status: string;
        created_at: string;
        alias: string;
        target_code: string | null;
      }>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM reviews WHERE status = 'pending' AND deleted_at IS NULL) AS pending_reviews,
          (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports,
          (SELECT COUNT(*) FROM reviews WHERE status = 'published' AND deleted_at IS NULL) AS published_reviews,
          (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users`
      )
      .first<{ pending_reviews: number; open_reports: number; published_reviews: number; users: number }>()
  ]);

  const adminReviews: AdminReviewDto[] = reviews.results.map((row) => ({
    id: row.id,
    targetType: row.target_type as TargetType,
    targetCode: row.target_code ?? "",
    targetName: row.target_name ?? "",
    userId: row.user_id,
    alias: row.alias,
    title: row.title,
    body: row.body,
    semester: row.semester,
    status: row.status as ReviewStatus,
    flags: parseFlags(row.flags_json),
    createdAt: row.created_at,
    reportCount: row.report_count
  }));

  const adminReports: AdminReportDto[] = reports.results.map((row) => ({
    id: row.id,
    reviewId: row.review_id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    alias: row.alias,
    targetCode: row.target_code ?? ""
  }));

  return {
    reviews: adminReviews,
    reports: adminReports,
    stats: {
      pendingReviews: stats?.pending_reviews ?? 0,
      openReports: stats?.open_reports ?? 0,
      publishedReviews: stats?.published_reviews ?? 0,
      users: stats?.users ?? 0
    }
  };
}

const ADMIN_STATS_TTL_MS = 60 * 1000;
const ADMIN_STATS_SERIES_DAYS = 14;
let adminStatsCache: { at: number; value: AdminStatsDto } | null = null;

/**
 * Admin dashboard numbers.
 *
 * Everything here is a read. The only write this feature adds is the daily
 * activity row recorded at sign-in (see lib/activity.ts).
 *
 * The queries are chosen so each one touches an index rather than a table:
 * "today" filters use the created_at indexes added in migration 0014, the
 * activity series uses the user_activity primary key, and the catalogue totals
 * come from the Worker's bundled course index instead of D1.
 */
export async function getAdminStats(db: D1Database): Promise<AdminStatsDto> {
  const now = Date.now();
  if (adminStatsCache && now - adminStatsCache.at < ADMIN_STATS_TTL_MS) {
    return adminStatsCache.value;
  }

  const today = statsDay(now);
  const dayStart = dayStartIso(today);
  const seriesStart = dayStartIso(shiftDay(today, -(ADMIN_STATS_SERIES_DAYS - 1)));
  const weekStart = dayStartIso(shiftDay(today, -6));
  const monthStart = dayStartIso(shiftDay(today, -29));

  const results = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM user_activity WHERE day = ?").bind(today),
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?").bind(dayStart),
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE verified_at >= ?").bind(dayStart),
    db.prepare(
      "SELECT status, COUNT(*) AS n FROM reviews WHERE created_at >= ? AND deleted_at IS NULL GROUP BY status"
    ).bind(dayStart),
    db.prepare("SELECT COUNT(*) AS n FROM reports WHERE created_at >= ?").bind(dayStart),
    db.prepare("SELECT COUNT(*) AS n FROM course_questions WHERE created_at >= ? AND deleted_at IS NULL").bind(
      dayStart
    ),
    db.prepare("SELECT COUNT(*) AS n FROM course_answers WHERE created_at >= ? AND deleted_at IS NULL").bind(dayStart),
    db.prepare(
      `SELECT
         SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS accounts,
         SUM(CASE WHEN verified_at IS NOT NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) AS verified,
         SUM(CASE WHEN deleted_at IS NOT NULL OR status = 'deleted' THEN 1 ELSE 0 END) AS deleted
       FROM users`
    ),
    db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM bans WHERE until IS NULL OR until > ?").bind(
      new Date(now).toISOString()
    ),
    db.prepare(
      `SELECT
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) AS hidden,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last7,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last30
       FROM reviews WHERE deleted_at IS NULL`
    ).bind(weekStart, monthStart),
    db.prepare(
      `SELECT COUNT(*) AS contributors, SUM(CASE WHEN n >= 2 THEN 1 ELSE 0 END) AS repeat_contributors
       FROM (SELECT user_id, COUNT(*) AS n FROM reviews
             WHERE status = 'published' AND deleted_at IS NULL GROUP BY user_id)`
    ),
    db.prepare(
      `SELECT target_type AS type, COUNT(*) AS reviews, COUNT(DISTINCT target_id) AS targets
       FROM reviews WHERE status = 'published' AND deleted_at IS NULL GROUP BY target_type`
    ),
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM programs) AS programs,
              (SELECT COUNT(*) FROM entities WHERE type = 'club' AND active = 1) AS clubs,
              (SELECT COUNT(*) FROM entities WHERE type = 'place' AND active = 1) AS places`
    ),
    db.prepare("SELECT day, COUNT(*) AS n FROM user_activity WHERE day >= ? GROUP BY day").bind(
      shiftDay(today, -(ADMIN_STATS_SERIES_DAYS - 1))
    ),
    db.prepare(
      `SELECT substr(datetime(created_at, '+8 hours'), 1, 10) AS day, COUNT(*) AS n
       FROM users WHERE created_at >= ? GROUP BY day`
    ).bind(seriesStart),
    db.prepare(
      `SELECT substr(datetime(created_at, '+8 hours'), 1, 10) AS day, COUNT(*) AS n
       FROM reviews WHERE created_at >= ? AND deleted_at IS NULL GROUP BY day`
    ).bind(seriesStart)
  ]);

  const rowsOf = <T>(index: number): T[] => (results[index]?.results ?? []) as T[];
  const firstOf = <T>(index: number): T | null => rowsOf<T>(index)[0] ?? null;
  const countOf = (index: number): number => Number(firstOf<{ n: number }>(index)?.n ?? 0);

  const todayByStatus = new Map(
    rowsOf<{ status: string; n: number }>(3).map((row) => [row.status, Number(row.n)])
  );
  const userTotals = firstOf<{ accounts: number | null; verified: number | null; deleted: number | null }>(7);
  const reviewTotals = firstOf<{
    published: number | null;
    pending: number | null;
    hidden: number | null;
    last7: number | null;
    last30: number | null;
  }>(9);
  const contributorTotals = firstOf<{ contributors: number | null; repeat_contributors: number | null }>(10);
  const typeRows = rowsOf<{ type: string; reviews: number; targets: number }>(11);
  const catalogue = firstOf<{ programs: number; clubs: number; places: number }>(12);

  const byType = new Map(
    typeRows.map((row) => [row.type, { reviews: Number(row.reviews), targets: Number(row.targets) }])
  );

  const toSeriesMap = (index: number) =>
    new Map(rowsOf<{ day: string; n: number }>(index).map((row) => [row.day, Number(row.n)]));
  const activityByDay = toSeriesMap(13);
  const signupsByDay = toSeriesMap(14);
  const reviewsByDay = toSeriesMap(15);

  const series = Array.from({ length: ADMIN_STATS_SERIES_DAYS }, (_, index) => {
    const day = shiftDay(today, index - (ADMIN_STATS_SERIES_DAYS - 1));
    return {
      day,
      activeUsers: activityByDay.get(day) ?? 0,
      signups: signupsByDay.get(day) ?? 0,
      reviews: reviewsByDay.get(day) ?? 0
    };
  });

  const pendingToday = todayByStatus.get("pending") ?? 0;
  const hiddenToday = todayByStatus.get("hidden") ?? 0;

  const stats: AdminStatsDto = {
    day: today,
    today: {
      activeUsers: countOf(0),
      signups: countOf(1),
      verified: countOf(2),
      reviews: pendingToday + hiddenToday + (todayByStatus.get("published") ?? 0),
      pendingReviews: pendingToday,
      hiddenReviews: hiddenToday,
      reports: countOf(4),
      questions: countOf(5),
      answers: countOf(6)
    },
    totals: {
      accounts: Number(userTotals?.accounts ?? 0),
      verified: Number(userTotals?.verified ?? 0),
      deleted: Number(userTotals?.deleted ?? 0),
      banned: countOf(8),
      publishedReviews: Number(reviewTotals?.published ?? 0),
      pendingReviews: Number(reviewTotals?.pending ?? 0),
      hiddenReviews: Number(reviewTotals?.hidden ?? 0),
      reviews7d: Number(reviewTotals?.last7 ?? 0),
      reviews30d: Number(reviewTotals?.last30 ?? 0),
      contributors: Number(contributorTotals?.contributors ?? 0),
      repeatContributors: Number(contributorTotals?.repeat_contributors ?? 0)
    },
    coverage: {
      courses: COURSE_INDEX.length,
      coursesReviewed: byType.get("course")?.targets ?? 0,
      programs: Number(catalogue?.programs ?? 0),
      programsReviewed: byType.get("program")?.targets ?? 0,
      clubs: Number(catalogue?.clubs ?? 0),
      clubsReviewed: byType.get("club")?.targets ?? 0,
      places: Number(catalogue?.places ?? 0),
      placesReviewed: byType.get("place")?.targets ?? 0
    },
    reviewsByType: typeRows
      .map((row) => ({ type: row.type as TargetType, count: Number(row.reviews) }))
      .sort((left, right) => right.count - left.count),
    series
  };

  adminStatsCache = { at: now, value: stats };
  return stats;
}

export async function logAudit(
  db: D1Database,
  actorId: string,
  action: string,
  target: string,
  meta: Record<string, unknown>
): Promise<void> {
  await db
    .prepare("INSERT INTO audit_log (id, actor_id, action, target, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), actorId, action, target, JSON.stringify(meta), new Date().toISOString())
    .run();
}
