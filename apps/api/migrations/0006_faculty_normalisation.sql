-- Normalise faculty labels so catalogue filters do not list the same faculty more
-- than once.
--
-- The source data disagrees with itself: clubs are seeded in Title Case
-- ("Faculty of Science") while courses and programmes are upper case
-- ("FACULTY OF SCIENCE"). Programmes also use "UMCCED" and the singular
-- "FACULTY OF SPORTS AND EXERCISE SCIENCE", while courses use the plural.
--
-- These statements are idempotent: running them again changes nothing.

-- 1. Upper-case club faculties so they match courses and programmes.
UPDATE entities
SET faculty = UPPER(TRIM(faculty))
WHERE faculty IS NOT NULL
  AND faculty <> ''
  AND faculty <> UPPER(TRIM(faculty));

-- 2. Unify the sports faculty on the plural form used by courses.
UPDATE entities
SET faculty = 'FACULTY OF SPORTS AND EXERCISE SCIENCES'
WHERE faculty = 'FACULTY OF SPORTS AND EXERCISE SCIENCE';

UPDATE programs
SET faculty = 'FACULTY OF SPORTS AND EXERCISE SCIENCES'
WHERE faculty = 'FACULTY OF SPORTS AND EXERCISE SCIENCE';

-- 3. Expand the UMCCed abbreviation to the full centre name.
UPDATE programs
SET faculty = 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)'
WHERE faculty = 'UMCCED';

UPDATE courses
SET faculty = 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)'
WHERE faculty = 'UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCed)';
