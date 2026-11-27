-- Admin statistics, built to spend reads rather than writes.
--
-- `user_activity` keeps one row per user per day. The first time a student opens
-- the app on a given day we write a row; every later open that day is a single
-- primary-key lookup that changes nothing. WITHOUT ROWID is deliberate: a normal
-- composite primary key creates a second B-tree, which D1 would count as two
-- rows written per insert. Without the rowid, the table *is* the index and the
-- cost is one row written per user-day.
CREATE TABLE IF NOT EXISTS user_activity (
  day TEXT NOT NULL,       -- YYYY-MM-DD in Malaysia time (UTC+8)
  user_id TEXT NOT NULL,
  PRIMARY KEY (day, user_id)
) WITHOUT ROWID;

-- The statistics page filters these columns by date. Without the indexes every
-- load would scan the whole users/reviews tables, which is the exact read cost
-- this feature is meant to avoid.
CREATE INDEX IF NOT EXISTS users_created_idx ON users(created_at);
CREATE INDEX IF NOT EXISTS users_verified_idx ON users(verified_at);
CREATE INDEX IF NOT EXISTS reviews_created_idx ON reviews(created_at);
