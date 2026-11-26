-- Placeholder clubs for local development only.
-- Do not apply against production. Real UM club data will replace these.
INSERT OR IGNORE INTO entities (id, type, code, name, faculty, category, description, metadata_json, active, created_at) VALUES
  ('ent_club_sample_chess', 'club', 'SAMPLE-CHESS', 'Sample Chess Club (placeholder)', NULL, 'Games', 'Placeholder entry used only for local testing.', '{}', 1, '2026-01-01T00:00:00.000Z'),
  ('ent_club_sample_debate', 'club', 'SAMPLE-DEBATE', 'Sample Debate Society (placeholder)', NULL, 'Academic', 'Placeholder entry used only for local testing.', '{}', 1, '2026-01-01T00:00:00.000Z'),
  ('ent_club_sample_volunteer', 'club', 'SAMPLE-VOLUNTEER', 'Sample Volunteer Network (placeholder)', NULL, 'Service', 'Placeholder entry used only for local testing.', '{}', 1, '2026-01-01T00:00:00.000Z');
