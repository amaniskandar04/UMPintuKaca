-- Semesters move to their own table so a club review can cover several.
-- Course reviews keep a single semester; programme and campus reviews carry none.
--
-- reviews.semester is retained as the "primary" semester (first selection) so
-- older admin views keep working, but reads go through review_semesters.

CREATE TABLE IF NOT EXISTS review_semesters (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  semester TEXT NOT NULL,
  PRIMARY KEY (review_id, semester)
);

CREATE INDEX IF NOT EXISTS review_semesters_review_idx ON review_semesters(review_id);
CREATE INDEX IF NOT EXISTS review_semesters_semester_idx ON review_semesters(semester);

INSERT OR IGNORE INTO review_semesters (review_id, semester)
SELECT id, TRIM(semester)
FROM reviews
WHERE semester IS NOT NULL AND TRIM(semester) <> '';
