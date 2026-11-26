-- Course Q&A. Questions are only ever created by users — nothing is seeded or
-- preset. Answers are the contribution that earns points.

CREATE TABLE IF NOT EXISTS course_questions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS course_questions_course_idx
  ON course_questions(course_id, status, created_at);

CREATE INDEX IF NOT EXISTS course_questions_user_idx
  ON course_questions(user_id);

CREATE TABLE IF NOT EXISTS course_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES course_questions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS course_answers_question_idx
  ON course_answers(question_id, status, created_at);

CREATE INDEX IF NOT EXISTS course_answers_user_idx
  ON course_answers(user_id);
