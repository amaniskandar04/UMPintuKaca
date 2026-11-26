PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO dimensions (key, label, applies_to, min_score, max_score, sort_order, active) VALUES
  ('place_accessibility', 'Accessibility', 'place', 1, 5, 10, 1),
  ('place_condition', 'Condition and cleanliness', 'place', 1, 5, 20, 1),
  ('place_wait', 'Crowding and wait time', 'place', 1, 5, 30, 1),
  ('place_staff', 'Staff helpfulness', 'place', 1, 5, 40, 1),
  ('place_value', 'Value', 'place', 1, 5, 50, 1),
  ('place_reliability', 'Reliability and availability', 'place', 1, 5, 60, 1);
