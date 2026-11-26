-- "Would take again" — a single binary signal that is easier to read than a
-- 5-point average. NULL means the reviewer skipped the question, so it is kept
-- separate from a "no" answer in the aggregate.

ALTER TABLE reviews ADD COLUMN would_take_again INTEGER;
