PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  deleted_at TEXT
);

CREATE TABLE identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_sub TEXT NOT NULL UNIQUE,
  email_hmac TEXT UNIQUE,
  verified_at TEXT NOT NULL
);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_verifier_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX oauth_states_expiry_idx ON oauth_states(expires_at);

CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  faculty TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'undergraduate',
  created_at TEXT NOT NULL
);

CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  faculty TEXT NOT NULL,
  department TEXT,
  credits INTEGER,
  program_id TEXT REFERENCES programs(id),
  created_at TEXT NOT NULL
);

CREATE INDEX courses_faculty_idx ON courses(faculty);
CREATE INDEX programs_faculty_idx ON programs(faculty);

CREATE TABLE dimensions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  applies_to TEXT NOT NULL,
  min_score INTEGER NOT NULL DEFAULT 1,
  max_score INTEGER NOT NULL DEFAULT 5,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX dimensions_target_idx ON dimensions(applies_to, active, sort_order);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  title TEXT,
  body TEXT,
  semester TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX reviews_one_active_per_target
  ON reviews(user_id, target_type, target_id)
  WHERE deleted_at IS NULL;

CREATE INDEX reviews_target_idx ON reviews(target_type, target_id, status, created_at);
CREATE INDEX reviews_user_idx ON reviews(user_id, created_at);
CREATE INDEX reviews_status_idx ON reviews(status, created_at);

CREATE TABLE review_scores (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL REFERENCES dimensions(key),
  score INTEGER NOT NULL,
  PRIMARY KEY (review_id, dimension_key)
);

CREATE INDEX review_scores_dimension_idx ON review_scores(dimension_key);

CREATE TABLE review_stats (
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  score_sum INTEGER NOT NULL DEFAULT 0,
  score_avg REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (target_type, target_id, dimension_key)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE UNIQUE INDEX reports_one_per_user ON reports(review_id, reporter_user_id);
CREATE INDEX reports_review_idx ON reports(review_id, status);
CREATE INDEX reports_status_idx ON reports(status, created_at);

CREATE TABLE bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  until TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX bans_user_idx ON bans(user_id, until);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX audit_log_created_idx ON audit_log(created_at);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
