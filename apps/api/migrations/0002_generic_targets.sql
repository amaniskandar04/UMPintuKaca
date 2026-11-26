PRAGMA foreign_keys = ON;

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  faculty TEXT,
  category TEXT,
  description TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX entities_type_code ON entities(type, code);
CREATE INDEX entities_type_idx ON entities(type, active, name);
CREATE INDEX entities_faculty_idx ON entities(faculty);

CREATE VIEW targets AS
  SELECT 'course' AS type, id, code, name, faculty, department AS category, NULL AS description FROM courses
  UNION ALL
  SELECT 'program' AS type, id, code, name, faculty, level AS category, NULL AS description FROM programs
  UNION ALL
  SELECT type, id, code, name, faculty, category, description FROM entities WHERE active = 1;

INSERT OR IGNORE INTO dimensions (key, label, applies_to, min_score, max_score, sort_order, active) VALUES
  ('club_community', 'Community & belonging', 'club', 1, 5, 10, 1),
  ('club_activities', 'Activities & events', 'club', 1, 5, 20, 1),
  ('club_inclusivity', 'Inclusivity', 'club', 1, 5, 30, 1),
  ('club_organization', 'Organisation', 'club', 1, 5, 40, 1),
  ('club_time_commitment', 'Time commitment', 'club', 1, 5, 50, 1),
  ('club_value', 'Value for fees', 'club', 1, 5, 60, 1);
