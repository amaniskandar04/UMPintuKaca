-- A review now carries its own overall score, instead of the overall being the
-- average of the category scores. Categories become optional, display-only
-- detail. Backfill existing reviews from their category average so historical
-- aggregates survive the change.

ALTER TABLE reviews ADD COLUMN overall_rating INTEGER;

UPDATE reviews
SET overall_rating = (
  SELECT CAST(ROUND(AVG(score)) AS INTEGER)
  FROM review_scores
  WHERE review_scores.review_id = reviews.id
)
WHERE overall_rating IS NULL;
