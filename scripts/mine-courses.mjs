import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const SEED_DIR = path.join(ROOT, "apps", "api", "seed");
const DEFAULT_RAW = path.join(DATA_DIR, "timeedit_s1_2026_2027_raw.json");

const args = process.argv.slice(2);
const semesterArg = args.find((value) => value.startsWith("--semester="));
const labelArg = args.find((value) => value.startsWith("--label="));
const rawArg = args.find((value) => value.startsWith("--raw="));
const SEMESTER = (semesterArg ? semesterArg.split("=")[1] : "2025/S2").trim();
const LABEL = (labelArg ? labelArg.split("=")[1] : "s2_2025_2026").trim();
const RAW_PATH = rawArg ? path.resolve(ROOT, rawArg.split("=")[1]) : DEFAULT_RAW;

const OUTPUT_RAW = path.join(DATA_DIR, `timeedit_${LABEL}_raw.json`);
const OUTPUT_SUBJECTS = path.join(DATA_DIR, `um_${LABEL}_subjects_timeedit.json`);
const OUTPUT_CSV = path.join(DATA_DIR, `um_${LABEL}_subjects_timeedit.csv`);
const OUTPUT_SQL = path.join(DATA_DIR, `um_${LABEL}_courses_seed_timeedit.sql`);
const OUTPUT_SUMMARY = path.join(DATA_DIR, `um_${LABEL}_summary.json`);
const OUTPUT_SEED = path.join(SEED_DIR, "courses_s2.seed.sql");
const CREATED_AT = "2025-01-01T00:00:00.000Z";

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCode(value) {
  return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalFaculty(value) {
  const faculty = cleanText(value);
  const map = {
    "ASIA EUROPE INSTITUTE": "ASIA-EUROPE INSTITUTE",
    "FACULTY OF SPORTS AND EXERCISE SCIENCE": "FACULTY OF SPORTS AND EXERCISE SCIENCES"
  };
  return map[faculty] ?? faculty;
}

function canonicalDepartment(value) {
  return cleanText(value).replace(/-/g, "");
}

function levelFor(description) {
  return /^BACHELOR$/i.test(cleanText(description)) ? "undergraduate" : "postgraduate";
}

function academicSemester(yearPeriod) {
  const [year, term] = yearPeriod.split("/");
  const nextYear = Number.isFinite(Number(year)) ? Number(year) + 1 : "?";
  return `${year}/${nextYear}-${term}`;
}

function rowsForPeriod(results, yearPeriod) {
  return results.filter((item) => {
    const periods = cleanText(item.details?.["Year + Period"]).split(",").map((value) => value.trim());
    return periods.includes(yearPeriod);
  });
}

function subjectFromRaw(item) {
  const details = item.details ?? {};
  const code = cleanCode(details["Module Code"]);
  const levelDescription = cleanText(details["Level Description"]);
  return {
    code,
    name: cleanText(details["English Description"] || details["Malay Description"]),
    faculty: canonicalFaculty(details["Faculty Description"]),
    faculty_code: cleanText(details.Faculty) || null,
    department_code: canonicalDepartment(details["Department (DPT) Code"]) || null,
    level: levelFor(levelDescription),
    level_description: levelDescription || null,
    credits: Number.isFinite(Number(details.Credit)) ? Number(details.Credit) : null,
    module_type: cleanText(details["Module Type (MOT) Code"]) || null,
    semester: academicSemester(SEMESTER),
    timeedit_id: item.id ?? null,
    timeedit_idonly: item.idOnly ?? null,
    synopsis: null
  };
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(subjects, filePath) {
  const header = ["code", "name", "faculty", "level", "credits", "faculty_code", "department_code", "module_type"];
  const lines = [header.join(",")];
  for (const subject of subjects) {
    lines.push(
      [
        csvCell(subject.code),
        csvCell(subject.name),
        csvCell(subject.faculty),
        csvCell(subject.level),
        csvCell(subject.credits),
        csvCell(subject.faculty_code),
        csvCell(subject.department_code),
        csvCell(subject.module_type)
      ].join(",")
    );
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeSql(subjects, filePath) {
  const header = [
    `-- UM subjects/courses offered in Semester 2, Academic Session 2025/2026`,
    `-- Source: TimeEdit, Year + Period = ${SEMESTER}`,
    `-- Generated: ${new Date().toISOString().slice(0, 10)}`,
    `-- Batched INSERTs (200 rows each) to stay under D1 SQLITE_TOOBIG.`,
    "",
    "INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES"
  ];
  const lines = [...header];
  const batchSize = 200;
  for (let index = 0; index < subjects.length; index += batchSize) {
    const batch = subjects.slice(index, index + batchSize);
    lines.push(
      batch
        .map((subject) => {
          const id = `crs_${subject.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
          return `  (${sqlString(id)}, ${sqlString(subject.code)}, ${sqlString(subject.name)}, ${sqlString(subject.faculty)}, ${sqlString(subject.department_code)}, ${subject.credits ?? "NULL"}, NULL, ${sqlString(CREATED_AT)})`;
        })
        .join(",\n") + ";"
    );
    if (index + batchSize < subjects.length) {
      lines.push("");
      lines.push("INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES");
    }
  }
  lines.push("");
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  if (!fs.existsSync(RAW_PATH)) {
    throw new Error(`Missing raw TimeEdit file: ${RAW_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(RAW_PATH, "utf8"));
  const sourceResults = Array.isArray(raw.results) ? raw.results : [];
  const periodResults = rowsForPeriod(sourceResults, SEMESTER);

  const seen = new Set();
  const subjects = [];
  const duplicates = [];
  const invalidCodes = [];
  for (const item of periodResults) {
    const subject = subjectFromRaw(item);
    if (!subject.code) {
      invalidCodes.push({ id: item.id, name: item.name, details: item.details });
      continue;
    }
    if (seen.has(subject.code)) {
      duplicates.push(subject.code);
      continue;
    }
    seen.add(subject.code);
    subjects.push(subject);
  }
  subjects.sort((a, b) => a.code.localeCompare(b.code));

  const byLevel = {};
  const byFaculty = {};
  for (const subject of subjects) {
    byLevel[subject.level] = (byLevel[subject.level] ?? 0) + 1;
    byFaculty[subject.faculty] = (byFaculty[subject.faculty] ?? 0) + 1;
  }

  const summary = {
    source: "cloud.timeedit.net/my_um/web/students (TimeEdit)",
    extractedAt: new Date().toISOString(),
    requestedSemester: "2025/2026 Semester 2",
    yearPeriod: SEMESTER,
    sourceRaw: path.relative(ROOT, RAW_PATH),
    sourceModules: sourceResults.length,
    matchedModules: periodResults.length,
    uniqueCourses: subjects.length,
    byLevel,
    byFaculty,
    duplicates,
    invalidCodes: invalidCodes.length
  };

  const subset = {
    meta: {
      source: summary.source,
      extractedAt: summary.extractedAt,
      requestedSemester: summary.requestedSemester,
      yearPeriod: SEMESTER,
      sourceRaw: summary.sourceRaw,
      matchedModules: periodResults.length,
      uniqueCourses: subjects.length,
      byLevel,
      byFaculty
    },
    results: periodResults
  };

  fs.mkdirSync(SEED_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_RAW, `${JSON.stringify(subset, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_SUBJECTS, `${JSON.stringify(subjects, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeCsv(subjects, OUTPUT_CSV);
  writeSql(subjects, OUTPUT_SQL);
  fs.copyFileSync(OUTPUT_SQL, OUTPUT_SEED);

  console.log(`Semester: ${SEMESTER}`);
  console.log(`Matched modules: ${periodResults.length}`);
  console.log(`Unique courses: ${subjects.length}`);
  console.log(`Levels: ${JSON.stringify(byLevel)}`);
  console.log(`Duplicates: ${duplicates.length}; invalid codes: ${invalidCodes.length}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_RAW)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SUBJECTS)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_CSV)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SQL)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SUMMARY)}`);
  console.log(`Copied seed to ${path.relative(ROOT, OUTPUT_SEED)}`);
}

main();
