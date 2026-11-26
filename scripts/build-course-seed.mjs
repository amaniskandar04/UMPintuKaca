// Builds `courses` seed SQL from a subject dataset.
//
// Unlike scripts/mine-courses.mjs (which derives subjects from the TimeEdit
// `Year + Period` metadata field), this reads the event-verified subject lists
// produced by scripts/sdk-browser-scrape.mjs, so the seeded catalogue only
// contains modules that actually had timetable reservations in that semester.
//
// Usage:
//   node scripts/build-course-seed.mjs \
//     --subjects=data/um_s1_2026_2027_subjects_events.json \
//     --out=data/um_s1_2026_2027_courses_seed.sql \
//     --seed=apps/api/seed/seed.sql \
//     --label="26/27, Semester 1"
//
// `--seed` splices the generated INSERTs into an existing seed file, keeping
// everything above the first `INSERT ... INTO courses` (dimensions, programs).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = args.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const SUBJECTS_PATH = getArg("subjects");
const OUT_PATH = getArg("out");
const SEED_PATH = getArg("seed");
const INDEX_PATH = getArg("index");
const INDEX_ONLY = args.includes("--index-only");
const LABEL = getArg("label") ?? "TimeEdit";

if (!SUBJECTS_PATH || (!OUT_PATH && !INDEX_ONLY)) {
  console.error("Usage: node scripts/build-course-seed.mjs --subjects=<file[,file]> --out=<file> [--seed=<seed.sql>] [--index=<json>] [--index-only] [--label=<text>]");
  process.exit(1);
}

const CREATED_AT = "2025-01-01T00:00:00.000Z";
const BATCH_SIZE = 200;
const COURSES_HEADER = "INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES";

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && value !== null && value !== "" ? String(num) : "NULL";
}

function courseId(code) {
  return `crs_${code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

// Some TimeEdit records leave "Faculty Description" blank (or set it to the
// literal "UNIVERSITY") while still carrying a faculty code such as "K" for
// Engineering. Resolve those from the same code seen on other records.
function buildFacultyLookup(rows) {
  const counts = new Map();
  for (const row of rows) {
    const facultyCode = cleanText(row.faculty_code).toUpperCase();
    const facultyName = cleanText(row.faculty ?? row["Faculty Description"]);
    if (!facultyCode || !facultyName) continue;
    if (facultyName.toUpperCase() === "UNIVERSITY") continue;
    const key = `${facultyCode}\u0000${facultyName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const lookup = new Map();
  for (const [key, count] of counts) {
    const [facultyCode, facultyName] = key.split("\u0000");
    const current = lookup.get(facultyCode);
    if (!current || count > current.count) lookup.set(facultyCode, { name: facultyName, count });
  }
  return lookup;
}

function loadSubjects(filePaths) {
  const rows = [];
  for (const filePath of filePaths) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const part = Array.isArray(raw) ? raw : Array.isArray(raw.subjects) ? raw.subjects : Array.isArray(raw.results) ? raw.results : [];
    rows.push(...part);
  }
  const facultyLookup = buildFacultyLookup(rows);
  const seen = new Set();
  const subjects = [];
  let skippedNoCode = 0;
  let duplicates = 0;
  let facultyResolved = 0;

  for (const row of rows) {
    const code = cleanText(row.code ?? row["Module Code"]).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) {
      skippedNoCode += 1;
      continue;
    }
    if (seen.has(code)) {
      duplicates += 1;
      continue;
    }
    const name = cleanText(row.name ?? row["English Description"] ?? row["Malay Description"]);
    if (!name) {
      skippedNoCode += 1;
      continue;
    }
    seen.add(code);

    let faculty = cleanText(row.faculty ?? row["Faculty Description"]);
    if (!faculty || faculty.toUpperCase() === "UNIVERSITY") {
      const facultyCode = cleanText(row.faculty_code).toUpperCase();
      const known = facultyCode ? facultyLookup.get(facultyCode) : null;
      if (known) {
        faculty = known.name;
        facultyResolved += 1;
      }
    }

    subjects.push({
      code,
      name,
      faculty: faculty || "UNIVERSITY",
      department: cleanText(row.department_code ?? row.department) || null,
      credits: row.credits ?? row.Credit ?? null
    });
  }

  subjects.sort((a, b) => a.code.localeCompare(b.code));
  return { subjects, skippedNoCode, duplicates, facultyResolved, sourceRows: rows.length };
}

// Serialises the catalogue for the API's in-memory search index. Faculties are
// deduplicated into a lookup table and courses are stored positionally, which
// keeps the bundled file small enough to ship with the Worker.
function buildSearchIndex(subjects) {
  const faculties = [];
  const facultyIndex = new Map();
  for (const subject of subjects) {
    if (!facultyIndex.has(subject.faculty)) {
      facultyIndex.set(subject.faculty, faculties.length);
      faculties.push(subject.faculty);
    }
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    count: subjects.length,
    faculties,
    courses: subjects.map((subject) => [
      subject.code,
      subject.name,
      facultyIndex.get(subject.faculty),
      subject.department ?? null,
      subject.credits ?? null
    ])
  };
}

function buildCourseBlock(subjects) {
  const lines = [];
  for (let index = 0; index < subjects.length; index += BATCH_SIZE) {
    const batch = subjects.slice(index, index + BATCH_SIZE);
    lines.push(COURSES_HEADER);
    lines.push(
      batch
        .map(
          (subject) =>
            `  (${sqlString(courseId(subject.code))}, ${sqlString(subject.code)}, ${sqlString(subject.name)}, ${sqlString(subject.faculty)}, ${sqlString(subject.department)}, ${sqlNumber(subject.credits)}, NULL, ${sqlString(CREATED_AT)})`
        )
        .join(",\n") + ";"
    );
    if (index + BATCH_SIZE < subjects.length) lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const subjectPaths = SUBJECTS_PATH.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(ROOT, value));
  for (const filePath of subjectPaths) {
    if (!fs.existsSync(filePath)) throw new Error(`Missing subject dataset: ${filePath}`);
  }

  const { subjects, skippedNoCode, duplicates, facultyResolved, sourceRows } = loadSubjects(subjectPaths);
  if (subjects.length === 0) throw new Error(`No usable subjects in ${subjectPaths.join(", ")}`);

  if (OUT_PATH && !INDEX_ONLY) {
    const header = [
      `-- UM course catalogue: ${LABEL}`,
      `-- Source: ${subjectPaths.map((value) => path.relative(ROOT, value)).join(", ")} (event-verified TimeEdit subjects)`,
      `-- Generated: ${new Date().toISOString().slice(0, 10)}`,
      `-- Courses: ${subjects.length}`,
      `-- Batched INSERTs (${BATCH_SIZE} rows each) to stay under the D1 SQLITE_TOOBIG limit.`,
      ""
    ].join("\n");

    const block = buildCourseBlock(subjects);

    fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT_PATH)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, OUT_PATH), `${header}${block}\n`, "utf8");
    console.log(`Wrote ${OUT_PATH} with ${subjects.length} courses`);
  }

  if (INDEX_PATH) {
    const indexPath = path.resolve(ROOT, INDEX_PATH);
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, `${JSON.stringify(buildSearchIndex(subjects))}\n`, "utf8");
    const sizeKb = (fs.statSync(indexPath).size / 1024).toFixed(0);
    console.log(`Wrote ${INDEX_PATH} (${subjects.length} courses, ${sizeKb} KB)`);
  }

  if (SEED_PATH) {
    const seedPath = path.resolve(ROOT, SEED_PATH);
    if (!fs.existsSync(seedPath)) throw new Error(`Missing seed file to splice into: ${seedPath}`);

    const existing = fs.readFileSync(seedPath, "utf8").split(/\r?\n/);
    const startIndex = existing.findIndex((line) => line.trim().startsWith("INSERT OR IGNORE INTO courses"));
    if (startIndex === -1) throw new Error(`No courses INSERT found in ${seedPath}`);

    const preserved = existing.slice(0, startIndex).join("\n").replace(/\s+$/, "");
    fs.writeFileSync(seedPath, `${preserved}\n\n${block}\n`, "utf8");
    console.log(`Spliced courses section into ${SEED_PATH} (preserved ${startIndex} lines above it)`);
  }

  console.log(`Source rows: ${sourceRows}; duplicates dropped: ${duplicates}; skipped: ${skippedNoCode}; faculty resolved by code: ${facultyResolved}`);
}

main();
