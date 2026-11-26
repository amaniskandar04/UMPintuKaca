PRAGMA foreign_keys = ON;

ALTER TABLE user_rewards ADD COLUMN display_badges_json TEXT NOT NULL DEFAULT '[]';

DELETE FROM user_badges WHERE badge_key IN ('faculty_explorer', 'program_guide', 'streak_4', 'streak_12');
DELETE FROM badges WHERE key IN ('faculty_explorer', 'program_guide', 'streak_4', 'streak_12');

UPDATE user_rewards SET theme = 'default' WHERE theme NOT IN ('default', 'light', 'cutesy', 'gold');
