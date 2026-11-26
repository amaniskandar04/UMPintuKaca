-- Canonicalise faculty values at rest.
--
-- The three source tables disagreed: courses used uppercase, clubs were seeded
-- in Title Case, and programmes shipped "UMCCED" plus the singular
-- "FACULTY OF SPORTS AND EXERCISE SCIENCE". `targets` is a view over all three,
-- so the faculty filter showed the same faculty several times.
--
-- migration 0006 tried to fix this, but the seed files delete and re-insert
-- clubs and programmes on every deploy with their original casing, undoing it.
-- The generators (scripts/mine-clubs.mjs, scripts/mine-programs.mjs) now emit
-- canonical values, and this migration repairs data that was seeded before
-- that change. The API also canonicalises at query time as a safety net.

-- 1. Clubs and other entities: upper-case everything.
UPDATE entities
SET faculty = UPPER(TRIM(faculty))
WHERE faculty IS NOT NULL
  AND TRIM(faculty) <> ''
  AND faculty <> UPPER(TRIM(faculty));

-- 2. Unify the sports faculty on the plural form used by courses.
UPDATE entities
SET faculty = 'FACULTY OF SPORTS AND EXERCISE SCIENCES'
WHERE UPPER(TRIM(faculty)) = 'FACULTY OF SPORTS AND EXERCISE SCIENCE';

UPDATE programs
SET faculty = 'FACULTY OF SPORTS AND EXERCISE SCIENCES'
WHERE UPPER(TRIM(faculty)) = 'FACULTY OF SPORTS AND EXERCISE SCIENCE';

-- 3. Expand the UMCCed abbreviation everywhere it appears.
UPDATE programs
SET faculty = 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)'
WHERE UPPER(TRIM(faculty)) = 'UMCCED';

UPDATE courses
SET faculty = 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)'
WHERE UPPER(TRIM(faculty)) = 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)'
  AND faculty <> 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)';
