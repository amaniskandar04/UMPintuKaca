PRAGMA foreign_keys = ON;

ALTER TABLE reviews ADD COLUMN helpful_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE review_votes (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL DEFAULT 'helpful',
  created_at TEXT NOT NULL,
  PRIMARY KEY (review_id, voter_user_id, vote_type)
);

CREATE INDEX review_votes_voter_idx ON review_votes(voter_user_id, created_at);
CREATE INDEX review_votes_review_idx ON review_votes(review_id);

CREATE TABLE user_rewards (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  published_reviews INTEGER NOT NULL DEFAULT 0,
  written_reviews INTEGER NOT NULL DEFAULT 0,
  long_reviews INTEGER NOT NULL DEFAULT 0,
  helpful_received INTEGER NOT NULL DEFAULT 0,
  helpful_given INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_review_week TEXT,
  show_achievements INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'default',
  updated_at TEXT NOT NULL
);

CREATE INDEX user_rewards_points_idx ON user_rewards(total_points DESC);
CREATE INDEX user_rewards_level_idx ON user_rewards(level DESC);

CREATE TABLE badges (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL REFERENCES badges(key),
  awarded_at TEXT NOT NULL,
  PRIMARY KEY (user_id, badge_key)
);

CREATE INDEX user_badges_badge_idx ON user_badges(badge_key);

CREATE TABLE reward_adjustments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX reward_adjustments_user_idx ON reward_adjustments(user_id, created_at);

INSERT OR IGNORE INTO badges (key, label, description, icon, sort_order) VALUES
  ('level_2', 'Level 2', 'Reach level 2', 'star', 10),
  ('level_3', 'Level 3', 'Reach level 3', 'star', 20),
  ('level_4', 'Level 4', 'Reach level 4', 'star', 30),
  ('level_5', 'Level 5', 'Reach level 5', 'star', 40),
  ('level_6', 'Level 6', 'Reach level 6', 'star', 50),
  ('level_7', 'Level 7', 'Reach level 7', 'star', 60),
  ('level_8', 'Level 8', 'Reach level 8', 'star', 70),
  ('level_9', 'Level 9', 'Reach level 9', 'star', 80),
  ('level_10', 'Level 10', 'Reach level 10', 'star', 90),
  ('first_review', 'First Steps', 'Publish your first review', 'plus', 100),
  ('reviews_5', 'Getting Started', 'Publish 5 reviews', 'edit', 110),
  ('reviews_10', 'Prolific', 'Publish 10 reviews', 'edit', 120),
  ('reviews_25', 'Authority', 'Publish 25 reviews', 'shield', 130),
  ('reviews_40', 'Completionist', 'Publish 40 reviews', 'star', 140),
  ('course_critic', 'Course Critic', 'Review 5 courses', 'check', 150),
  ('club_connector', 'Club Connector', 'Review 5 clubs', 'check', 160),
  ('program_guide', 'Programme Guide', 'Review 3 programmes', 'check', 170),
  ('long_form_10', 'Long-Form Contributor', 'Write 10 reviews over 200 characters', 'edit', 180),
  ('faculty_explorer', 'Faculty Explorer', 'Review across 5 faculties', 'search', 190),
  ('category_explorer', 'Category Explorer', 'Review clubs in 5 categories', 'search', 200),
  ('helpful_10', 'Helpful 10', 'Receive 10 helpful votes', 'spark', 210),
  ('helpful_50', 'Helpful 50', 'Receive 50 helpful votes', 'spark', 220),
  ('helpful_100', 'Helpful 100', 'Receive 100 helpful votes', 'spark', 230),
  ('streak_4', '4-Week Streak', 'Review for 4 weeks in a row', 'spark', 240),
  ('streak_12', '12-Week Streak', 'Review for 12 weeks in a row', 'spark', 250),
  ('early_reviewer', 'Early Reviewer', 'Be first to review 3 targets', 'flag', 260);
