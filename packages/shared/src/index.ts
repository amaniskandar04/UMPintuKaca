import { z } from "zod";

export const TARGET_TYPES = ["course", "program", "club", "place"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const PROGRAM_LEVELS = ["foundation", "diploma", "undergraduate", "postgraduate"] as const;
export type ProgramLevel = (typeof PROGRAM_LEVELS)[number];
export type ReviewStatus = "published" | "pending" | "hidden" | "deleted";
export type UserRole = "student" | "admin";

export const PROGRAM_DIMENSIONS = [
  { key: "program_job_opportunities", label: "Job opportunities", sort: 10 },
  { key: "program_facilities", label: "Facilities", sort: 20 },
  { key: "program_difficulty", label: "Difficulty", sort: 30 },
  { key: "program_teaching_quality", label: "Teaching quality", sort: 40 },
  { key: "program_workload", label: "Workload", sort: 50 },
  { key: "program_value_for_money", label: "Value for money", sort: 60 },
  { key: "program_administration", label: "Administration", sort: 70 },
  { key: "program_campus_life", label: "Campus life", sort: 80 }
] as const;

export const COURSE_DIMENSIONS = [
  { key: "course_difficulty", label: "Difficulty", sort: 10 },
  { key: "course_teaching_quality", label: "Teaching quality", sort: 20 },
  { key: "course_workload", label: "Workload", sort: 30 },
  { key: "course_usefulness", label: "Usefulness", sort: 40 },
  { key: "course_grading_fairness", label: "Grading fairness", sort: 50 }
] as const;

export const CLUB_DIMENSIONS = [
  { key: "club_community", label: "Community & belonging", sort: 10 },
  { key: "club_activities", label: "Activities & events", sort: 20 },
  { key: "club_inclusivity", label: "Inclusivity", sort: 30 },
  { key: "club_organization", label: "Organisation", sort: 40 },
  { key: "club_time_commitment", label: "Time commitment", sort: 50 },
  { key: "club_value", label: "Value for fees", sort: 60 }
] as const;

export interface RewardLevelDto {
  level: number;
  points: number;
  label: string;
}

export const REWARD_LEVELS: RewardLevelDto[] = [
  { level: 1, points: 0, label: "Newcomer" },
  { level: 2, points: 20, label: "Contributor" },
  { level: 3, points: 60, label: "Regular" },
  { level: 4, points: 120, label: "Reviewer" },
  { level: 5, points: 200, label: "Trusted" },
  { level: 6, points: 300, label: "Specialist" },
  { level: 7, points: 420, label: "Authority" },
  { level: 8, points: 560, label: "Expert" },
  { level: 9, points: 700, label: "Luminary" },
  { level: 10, points: 800, label: "Legend" }
];

export const REWARD_THEMES = ["default", "light", "ocean", "cutesy", "gold"] as const;
export type RewardTheme = (typeof REWARD_THEMES)[number];

/**
 * Minimum level needed to select each theme. Kept in shared so the API's
 * enforcement and the web picker can never disagree.
 */
export const REWARD_THEME_LEVELS: Record<RewardTheme, number> = {
  default: 1,
  light: 1,
  ocean: 3,
  cutesy: 6,
  gold: 10
};

export function unlockedRewardThemes(level: number): RewardTheme[] {
  return REWARD_THEMES.filter((theme) => level >= REWARD_THEME_LEVELS[theme]);
}

export function rewardLevelForPoints(points: number): RewardLevelDto {
  let current = REWARD_LEVELS[0];
  for (const level of REWARD_LEVELS) {
    if (points >= level.points) current = level;
  }
  return current;
}

export function nextRewardLevel(points: number): RewardLevelDto | null {
  return REWARD_LEVELS.find((level) => level.points > points) ?? null;
}

export const REPORT_REASONS = [
  { value: "harassment", label: "Harassment or personal attack" },
  { value: "private_info", label: "Shares private information" },
  { value: "defamation", label: "Names an individual or makes unverified allegations" },
  { value: "spam", label: "Spam or advertising" },
  { value: "false", label: "Clearly false or misleading" },
  { value: "other", label: "Other" }
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

export const SEMESTERS = (() => {
  const out: string[] = [];
  const current = new Date().getFullYear();
  for (let year = current; year >= current - 5; year -= 1) {
    out.push(`${year}/${year + 1} Sem 1`);
    out.push(`${year}/${year + 1} Sem 2`);
  }
  return out;
})();

export const MAX_REVIEW_BODY = 2000;
export const MAX_REVIEW_TITLE = 120;
export const REVIEW_EDIT_WINDOW_DAYS = 30;

export interface DimensionDto {
  key: string;
  label: string;
  appliesTo: TargetType;
  min: number;
  max: number;
  sort: number;
  /** Explanatory text for the 1-star and 5-star ends of the scale. */
  lowLabel: string | null;
  highLabel: string | null;
}

export interface StatDto {
  key: string;
  label: string;
  count: number;
  avg: number;
  lowLabel?: string | null;
  highLabel?: string | null;
}

export interface StatsDto {
  overall: StatDto;
  dimensions: StatDto[];
}

export interface ScoreDto {
  key: string;
  label: string;
  score: number;
}

export interface ReviewDto {
  id: string;
  alias: string;
  title: string | null;
  body: string | null;
  /** Semesters this review covers. Courses use one; clubs may use several. */
  semesters: string[];
  /** The reviewer's explicit overall score. Sub-scores are display-only. */
  overall: number | null;
  status: ReviewStatus;
  flags: string[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  isOwner: boolean;
  scores: ScoreDto[];
  helpfulCount: number;
  viewerHelpful: boolean;
  wouldTakeAgain: boolean | null;
  authorLevel: number;
  authorBadges: AuthorBadgeDto[];
}

export interface RatingDistributionDto {
  /** Counts for scores 1..5, in order. */
  buckets: number[];
  total: number;
}

export interface WouldTakeAgainDto {
  yes: number;
  total: number;
  percent: number;
}

export interface FacultyPercentileDto {
  dimensionKey: string;
  label: string;
  /** 0-100: share of reviewed courses in the same faculty rated lower. */
  percentile: number;
  sampleSize: number;
  faculty: string;
}

export interface AuthorBadgeDto {
  key: string;
  label: string;
  icon: string;
}

export interface RewardBadgeDto {
  key: string;
  label: string;
  description: string;
  icon: string;
  sort: number;
  earnedAt: string | null;
  progress: {
    current: number;
    target: number;
  } | null;
}

export interface PointsBreakdownDto {
  ratingOnly: number;
  written: number;
  long: number;
  helpful: number;
  questions: number;
  answers: number;
  adjustments: number;
  base: number;
  total: number;
}

export interface CourseAnswerDto {
  id: string;
  alias: string;
  body: string;
  createdAt: string;
  isOwner: boolean;
}

export interface CourseQuestionDto {
  id: string;
  alias: string;
  body: string;
  createdAt: string;
  isOwner: boolean;
  answers: CourseAnswerDto[];
  answerCount: number;
}

export const QuestionSchema = z.object({
  body: z.string().trim().min(10, "Ask a bit more than that").max(500)
});

export const AnswerSchema = z.object({
  body: z.string().trim().min(10, "Answer with a little more detail").max(1000)
});

export interface RewardsDto {
  points: number;
  level: number;
  levelLabel: string;
  nextLevel: RewardLevelDto | null;
  progress: {
    current: number;
    target: number;
    percent: number;
  } | null;
  publishedReviews: number;
  writtenReviews: number;
  longReviews: number;
  helpfulReceived: number;
  helpfulGiven: number;
  currentStreak: number;
  longestStreak: number;
  showAchievements: boolean;
  theme: RewardTheme;
  unlockedThemes: RewardTheme[];
  displayBadges: string[];
  badges: RewardBadgeDto[];
  pointsBreakdown: PointsBreakdownDto;
  levels: RewardLevelDto[];
}

export interface RewardsLeaderboardEntryDto {
  userId: string;
  level: number;
  points: number;
  publishedReviews: number;
  helpfulReceived: number;
  badgeCount: number;
}

export interface RewardsLeaderboardDto {
  entries: RewardsLeaderboardEntryDto[];
}

export interface CourseDto {
  id: string;
  code: string;
  name: string;
  faculty: string;
  department: string | null;
  credits: number | null;
  stats: StatsDto;
}

export interface ReviewAccessDto {
  locked: boolean;
  /** Number of qualifying reviews required to unlock the text. */
  required: number;
  /** How many the viewer has inside the rolling window. */
  submitted: number;
  /** Length of the rolling window in days. */
  windowDays: number;
  /**
   * When the oldest counted review ages out of the window and the viewer
   * re-locks. Only set while the viewer is unlocked; null when locked.
   */
  unlocksAt: string | null;
}

export interface CourseDetailDto extends CourseDto {
  reviews: ReviewDto[];
  hasMore: boolean;
  reviewAccess: ReviewAccessDto;
  ratingDistribution: RatingDistributionDto;
  wouldTakeAgain: WouldTakeAgainDto | null;
  facultyPercentile: FacultyPercentileDto | null;
  /** Distinct semesters among published reviews, newest first. */
  semesters: string[];
}

export interface ProgramDto {
  id: string;
  code: string;
  name: string;
  faculty: string;
  level: string;
  stats: StatsDto;
}

export interface ProgramDetailDto extends ProgramDto {
  reviews: ReviewDto[];
  hasMore: boolean;
}

export interface EntityDto {
  id: string;
  type: TargetType;
  code: string;
  name: string;
  faculty: string | null;
  category: string | null;
  description: string | null;
  stats: StatsDto;
}

export interface EntityDetailDto extends EntityDto {
  reviews: ReviewDto[];
  hasMore: boolean;
}

export interface MyReviewDto extends ReviewDto {
  targetType: TargetType;
  targetCode: string;
  targetName: string;
}

export interface UserDto {
  id: string;
  verified: boolean;
  role: UserRole;
  createdAt: string;
  verifiedAt: string | null;
  reviewCount: number;
  level: number;
  theme: RewardTheme;
}

export interface AdminReviewDto {
  id: string;
  targetType: TargetType;
  targetCode: string;
  targetName: string;
  userId: string;
  alias: string;
  title: string | null;
  body: string | null;
  semester: string | null;
  status: ReviewStatus;
  flags: string[];
  createdAt: string;
  reportCount: number;
}

export interface AdminReportDto {
  id: string;
  reviewId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  alias: string;
  targetCode: string;
}

export interface AdminQueueDto {
  reviews: AdminReviewDto[];
  reports: AdminReportDto[];
  stats: {
    pendingReviews: number;
    openReports: number;
    publishedReviews: number;
    users: number;
  };
}

export interface BroadcastDto {
  id: string;
  message: string;
  status: "queued" | "sending" | "sent";
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface AdminBroadcastDto {
  audience: number;
  broadcasts: BroadcastDto[];
}

export interface AdminStatsDto {
  /** Today's date in Malaysia time (UTC+8), YYYY-MM-DD. */
  day: string;
  today: {
    activeUsers: number;
    signups: number;
    verified: number;
    reviews: number;
    pendingReviews: number;
    hiddenReviews: number;
    reports: number;
    questions: number;
    answers: number;
  };
  totals: {
    accounts: number;
    verified: number;
    deleted: number;
    banned: number;
    publishedReviews: number;
    pendingReviews: number;
    hiddenReviews: number;
    reviews7d: number;
    reviews30d: number;
    contributors: number;
    repeatContributors: number;
  };
  coverage: {
    courses: number;
    coursesReviewed: number;
    programs: number;
    programsReviewed: number;
    clubs: number;
    clubsReviewed: number;
    places: number;
    placesReviewed: number;
  };
  reviewsByType: { type: TargetType; count: number }[];
  series: { day: string; activeUsers: number; signups: number; reviews: number }[];
}

export interface ConfigDto {
  environment: string;
  devBypass: boolean;
  googleEnabled: boolean;
  botUsername: string;
  webAppUrl: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

export interface FacultiesDto {
  faculties: string[];
}

export interface CategoryDto {
  value: string;
  count: number;
}

export interface CategoriesDto {
  categories: CategoryDto[];
}

export interface DimensionsResponse {
  dimensions: DimensionDto[];
  flags: Record<string, string>;
}

export const InitSchema = z.object({
  initData: z.string().min(1).max(8192)
});

export const ScoreMapSchema = z.record(z.string().min(1).max(64), z.number().int().min(1).max(5));

export const CreateReviewSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetCode: z.string().trim().min(1).max(32),
  title: z.string().trim().max(MAX_REVIEW_TITLE).optional().nullable(),
  body: z.string().trim().max(MAX_REVIEW_BODY).optional().nullable(),
  semester: z.string().trim().max(32).optional().nullable(),
  wouldTakeAgain: z.boolean().optional().nullable(),
  /** Required: the review's own score. Category scores are optional detail. */
  overall: z.number().int().min(1).max(5),
  /** Courses use one; clubs may list several. Programmes and places use none. */
  semesters: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  scores: ScoreMapSchema.optional()
});

export const UpdateReviewSchema = z
  .object({
    title: z.string().trim().max(MAX_REVIEW_TITLE).optional().nullable(),
    body: z.string().trim().max(MAX_REVIEW_BODY).optional().nullable(),
    wouldTakeAgain: z.boolean().optional().nullable(),
    overall: z.number().int().min(1).max(5).optional(),
    semesters: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
    scores: ScoreMapSchema.optional()
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.semesters !== undefined ||
      value.wouldTakeAgain !== undefined ||
      value.overall !== undefined ||
      value.scores !== undefined,
    {
      message: "Nothing to update"
    }
  );

export const ReportSchema = z.object({
  reason: z.enum(["harassment", "private_info", "defamation", "spam", "false", "other"]),
  details: z.string().trim().max(500).optional().nullable()
});

export const AdminReviewActionSchema = z.object({
  action: z.enum(["approve", "hide", "delete"]),
  note: z.string().trim().max(500).optional()
});

export const AdminReportResolveSchema = z.object({
  action: z.enum(["dismiss", "action_taken"]),
  note: z.string().trim().max(500).optional()
});

export const BroadcastSchema = z.object({
  message: z.string().trim().min(1).max(3000),
  test: z.boolean().optional()
});

export const BanSchema = z.object({
  reason: z.string().trim().min(2).max(200),
  until: z.string().datetime().optional().nullable()
});

export const UpdateRewardsSchema = z
  .object({
    showAchievements: z.boolean().optional(),
    theme: z.enum(REWARD_THEMES).optional(),
    displayBadges: z.array(z.string().trim().min(1).max(64)).max(3).optional()
  })
  .refine(
    (value) =>
      value.showAchievements !== undefined || value.theme !== undefined || value.displayBadges !== undefined,
    {
      message: "Nothing to update"
    }
  );

export const RewardAdjustmentSchema = z.object({
  points: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0, { message: "Points adjustment must not be zero" }),
  reason: z.string().trim().min(2).max(200)
});
