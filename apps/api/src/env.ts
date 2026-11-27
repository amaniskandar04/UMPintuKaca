export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  DEV_AUTH_BYPASS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  BOT_USERNAME?: string;
  WEB_APP_URL?: string;
  WEB_ORIGIN?: string;
  EMAIL_HMAC_PEPPER?: string;
  ALIAS_PEPPER?: string;
  OAUTH_ENC_KEY?: string;
  ADMIN_TELEGRAM_IDS?: string;
  ALLOWED_EMAIL_DOMAINS?: string;
  AUTO_HIDE_REPORT_THRESHOLD?: string;
  BROADCAST_BATCH_SIZE?: string;
  FEEDBACK_URL?: string;
}

export interface UserRow {
  id: string;
  telegram_id: number;
  role: string;
  status: string;
  session_version: number;
  created_at: string;
  verified_at: string | null;
  deleted_at: string | null;
}

export interface Variables {
  user: UserRow;
}

export type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};

export interface DimensionRow {
  key: string;
  label: string;
  applies_to: string;
  min_score: number;
  max_score: number;
  sort_order: number;
  active: number;
  low_label?: string | null;
  high_label?: string | null;
}

export interface ReviewRow {
  id: string;
  target_type: string;
  target_id: string;
  user_id: string;
  alias: string;
  title: string | null;
  body: string | null;
  semester: string | null;
  status: string;
  flags_json: string;
  would_take_again?: number | null;
  overall_rating?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  helpful_count?: number;
}

export interface StatsRow {
  target_type: string;
  target_id: string;
  dimension_key: string;
  review_count: number;
  score_sum: number;
  score_avg: number;
  updated_at: string;
}

export interface CourseRow {
  id: string;
  code: string;
  name: string;
  faculty: string;
  department: string | null;
  credits: number | null;
  overall_avg?: number;
  overall_count?: number;
}

export interface ProgramRow {
  id: string;
  code: string;
  name: string;
  faculty: string;
  level: string;
  overall_avg?: number;
  overall_count?: number;
}

export interface EntityRow {
  id: string;
  type: string;
  code: string;
  name: string;
  faculty: string | null;
  category: string | null;
  description: string | null;
  metadata_json?: string;
}

export interface UserRewardRow {
  user_id: string;
  total_points: number;
  level: number;
  published_reviews: number;
  written_reviews: number;
  long_reviews: number;
  helpful_received: number;
  helpful_given: number;
  current_streak: number;
  longest_streak: number;
  last_review_week: string | null;
  show_achievements: number;
  theme: string;
  display_badges_json: string;
  updated_at: string;
}

export interface BadgeRow {
  key: string;
  label: string;
  description: string;
  icon: string;
  sort_order: number;
}
