INSERT OR IGNORE INTO users (id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at) VALUES
  ('seed_user_1', 999999991, 'student', 'active', 1, '2025-09-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z', NULL),
  ('seed_user_2', 999999992, 'student', 'active', 1, '2025-09-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z', NULL),
  ('seed_user_3', 999999993, 'student', 'active', 1, '2025-09-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z', NULL),
  ('seed_user_4', 999999994, 'student', 'active', 1, '2025-09-01T00:00:00.000Z', '2025-09-01T00:00:00.000Z', NULL);

INSERT OR IGNORE INTO identities (user_id, provider, provider_sub, email_hmac, verified_at) VALUES
  ('seed_user_1', 'seed', 'seed:demo:1', NULL, '2025-09-01T00:00:00.000Z'),
  ('seed_user_2', 'seed', 'seed:demo:2', NULL, '2025-09-01T00:00:00.000Z'),
  ('seed_user_3', 'seed', 'seed:demo:3', NULL, '2025-09-01T00:00:00.000Z'),
  ('seed_user_4', 'seed', 'seed:demo:4', NULL, '2025-09-01T00:00:00.000Z');

INSERT OR IGNORE INTO reviews (id, target_type, target_id, user_id, alias, title, body, semester, status, flags_json, created_at, updated_at, deleted_at) VALUES
  ('seed_rv_1', 'course', 'crs_wia1001', 'seed_user_1', 'Anonymous Quiet Otter', 'Good foundation course', 'The labs are useful and the assignments build on the lectures. Start early because the projects stack up near the end of the semester.', '2026/2027 Sem 1', 'published', '[]', '2025-11-02T09:00:00.000Z', '2025-11-02T09:00:00.000Z', NULL),
  ('seed_rv_2', 'course', 'crs_wia1001', 'seed_user_2', 'Anonymous Calm Heron', 'Challenging but fair', 'Weekly tutorials help a lot. The exam rewards understanding rather than memorising. Ask questions during labs.', '2026/2027 Sem 1', 'published', '[]', '2025-11-05T12:30:00.000Z', '2025-11-05T12:30:00.000Z', NULL),
  ('seed_rv_3', 'course', 'crs_kie1004', 'seed_user_3', 'Anonymous Brave Lynx', 'Solid introduction to programming', 'A good first programming course. Practice the exercises every week and you will be fine.', '2026/2027 Sem 1', 'published', '[]', '2025-11-08T15:15:00.000Z', '2025-11-08T15:15:00.000Z', NULL),
  ('seed_rv_4', 'program', 'prg_bcs', 'seed_user_4', 'Anonymous Gentle Falcon', 'Strong industry links', 'The programme has good industry connections and a broad range of electives. Administration can be slow during registration, but the teaching is generally solid.', '2026/2027 Sem 1', 'published', '[]', '2025-11-10T08:45:00.000Z', '2025-11-10T08:45:00.000Z', NULL);

INSERT OR IGNORE INTO review_scores (review_id, dimension_key, score) VALUES
  ('seed_rv_1', 'course_difficulty', 4),
  ('seed_rv_1', 'course_teaching_quality', 4),
  ('seed_rv_1', 'course_workload', 4),
  ('seed_rv_1', 'course_usefulness', 5),
  ('seed_rv_1', 'course_grading_fairness', 4),
  ('seed_rv_2', 'course_difficulty', 4),
  ('seed_rv_2', 'course_teaching_quality', 5),
  ('seed_rv_2', 'course_workload', 3),
  ('seed_rv_2', 'course_usefulness', 5),
  ('seed_rv_2', 'course_grading_fairness', 4),
  ('seed_rv_3', 'course_difficulty', 3),
  ('seed_rv_3', 'course_teaching_quality', 4),
  ('seed_rv_3', 'course_workload', 2),
  ('seed_rv_3', 'course_usefulness', 5),
  ('seed_rv_3', 'course_grading_fairness', 4),
  ('seed_rv_4', 'program_job_opportunities', 5),
  ('seed_rv_4', 'program_facilities', 4),
  ('seed_rv_4', 'program_difficulty', 4),
  ('seed_rv_4', 'program_teaching_quality', 4),
  ('seed_rv_4', 'program_workload', 3),
  ('seed_rv_4', 'program_value_for_money', 4),
  ('seed_rv_4', 'program_administration', 2),
  ('seed_rv_4', 'program_campus_life', 4);

INSERT OR REPLACE INTO review_stats (target_type, target_id, dimension_key, review_count, score_sum, score_avg, updated_at)
SELECT r.target_type, r.target_id, s.dimension_key, COUNT(*), SUM(s.score), AVG(s.score), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM reviews r
JOIN review_scores s ON s.review_id = r.id
WHERE r.status = 'published' AND r.deleted_at IS NULL
GROUP BY r.target_type, r.target_id, s.dimension_key;

INSERT OR REPLACE INTO review_stats (target_type, target_id, dimension_key, review_count, score_sum, score_avg, updated_at)
SELECT target_type, target_id, 'overall', COUNT(*), SUM(review_avg), AVG(review_avg), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM (
  SELECT r.target_type, r.target_id, r.id, AVG(s.score) AS review_avg
  FROM reviews r
  JOIN review_scores s ON s.review_id = r.id
  WHERE r.status = 'published' AND r.deleted_at IS NULL
  GROUP BY r.id
)
GROUP BY target_type, target_id;
