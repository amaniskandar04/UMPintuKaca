-- Index the foreign-key column on courses.
--
-- `courses.program_id` references `programs(id)`, but it had no index. SQLite
-- must therefore scan the whole `courses` table to check the constraint on
-- every deleted parent row. `seed/programs.seed.sql` starts with
-- `DELETE FROM programs`, so each deploy scanned courses once per programme:
-- 268 x 4,636 ~= 1.24M rows read, which is a quarter of the D1 free-tier daily
-- allowance for a seed that usually changes nothing.
--
-- With this index the constraint check becomes a lookup instead of a scan.

CREATE INDEX IF NOT EXISTS courses_program_idx ON courses(program_id);
