-- Rating taxonomy overhaul.
--
-- Courses drop "grading fairness" for "easiness to score"; programmes drop
-- "campus life" and swap "administration" for "satisfaction"; clubs drop
-- "inclusivity" and "value for fees", reword community to an anti-toxicity
-- framing, and gain "personal value". Campus places drop every category now
-- that a review carries its own explicit overall rating.
--
-- Each dimension gains 1-star and 5-star endpoint labels for the review form.

ALTER TABLE dimensions ADD COLUMN low_label TEXT;
ALTER TABLE dimensions ADD COLUMN high_label TEXT;

-- Remove retired dimensions. Scores and cached stats must go first because
-- review_scores.dimension_key is a foreign key.
DELETE FROM review_scores WHERE dimension_key IN (
  'course_grading_fairness',
  'program_administration',
  'program_campus_life',
  'club_community',
  'club_inclusivity',
  'club_value',
  'place_accessibility',
  'place_condition',
  'place_wait',
  'place_staff',
  'place_value',
  'place_reliability'
);

DELETE FROM review_stats WHERE dimension_key IN (
  'course_grading_fairness',
  'program_administration',
  'program_campus_life',
  'club_community',
  'club_inclusivity',
  'club_value',
  'place_accessibility',
  'place_condition',
  'place_wait',
  'place_staff',
  'place_value',
  'place_reliability'
);

DELETE FROM dimensions WHERE key IN (
  'course_grading_fairness',
  'program_administration',
  'program_campus_life',
  'club_community',
  'club_inclusivity',
  'club_value',
  'place_accessibility',
  'place_condition',
  'place_wait',
  'place_staff',
  'place_value',
  'place_reliability'
);

INSERT INTO dimensions (key, label, applies_to, min_score, max_score, sort_order, active, low_label, high_label) VALUES
  ('course_difficulty',        'Difficulty',        'course',  1, 5, 10, 1, 'Very easy',   'Very hard'),
  ('course_teaching_quality',  'Teaching quality',  'course',  1, 5, 20, 1, 'Poor',        'Excellent'),
  ('course_workload',          'Workload',          'course',  1, 5, 30, 1, 'Very light',  'Very heavy'),
  ('course_usefulness',        'Usefulness',        'course',  1, 5, 40, 1, 'Useless',     'Very useful'),
  ('course_easiness',          'Easiness to score', 'course',  1, 5, 50, 1, 'Too hard',    'Too easy'),

  ('program_job_opportunities','Job opportunities', 'program', 1, 5, 10, 1, 'Poor',        'Excellent'),
  ('program_facilities',       'Facilities',        'program', 1, 5, 20, 1, 'Poor',        'Excellent'),
  ('program_difficulty',       'Difficulty',        'program', 1, 5, 30, 1, 'Very easy',   'Very hard'),
  ('program_teaching_quality', 'Teaching quality',  'program', 1, 5, 40, 1, 'Poor',        'Excellent'),
  ('program_workload',         'Workload',          'program', 1, 5, 50, 1, 'Very light',  'Very heavy'),
  ('program_value_for_money',  'Value for money',   'program', 1, 5, 60, 1, 'Wasteful',    'Great value'),
  ('program_satisfaction',     'Satisfaction',      'program', 1, 5, 70, 1, 'Unsatisfied', 'Very satisfied'),

  ('club_culture',             'Positive culture',  'club',    1, 5, 10, 1, 'Toxic',       'Welcoming'),
  ('club_activities',          'Activities & events','club',   1, 5, 20, 1, 'Boring',      'Great'),
  ('club_organization',        'Organisation',      'club',    1, 5, 30, 1, 'Chaotic',     'Well run'),
  ('club_time_commitment',     'Time commitment',   'club',    1, 5, 40, 1, 'Minimal',     'Heavy'),
  ('club_personal_value',      'Personal value',    'club',    1, 5, 50, 1, 'Not worth it','Very worth it')
ON CONFLICT(key) DO UPDATE SET
  label = excluded.label,
  applies_to = excluded.applies_to,
  min_score = excluded.min_score,
  max_score = excluded.max_score,
  sort_order = excluded.sort_order,
  active = excluded.active,
  low_label = excluded.low_label,
  high_label = excluded.high_label;
