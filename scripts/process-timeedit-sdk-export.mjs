import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const inputArg = process.argv.find((value) => value.startsWith("--input="));
const defaultInputs = [
  path.join(ROOT, "course_events_with_details.json"),
  path.join(ROOT, "..", "course_events_with_details.json"),
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Downloads", "course_events_with_details.json") : ""
].filter(Boolean);
const inputPath = inputArg
  ? path.resolve(ROOT, inputArg.slice("--input=".length))
  : defaultInputs.find((candidate) => fs.existsSync(candidate)) ?? defaultInputs[0];
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_SUBJECTS = path.join(DATA_DIR, "um_courses_sdk_subjects.json");
const OUTPUT_CSV = path.join(DATA_DIR, "um_courses_sdk_subjects.csv");
const OUTPUT_RAW = path.join(DATA_DIR, "timeedit_sdk_filtered_raw.json");
const OUTPUT_REPORT = path.join(DATA_DIR, "timeedit_sdk_export_report.json");
const OUTPUT_SQL = path.join(ROOT, "apps", "api", "seed", "courses.full.seed.sql");
const CREATED_AT = "2025-01-01T00:00:00.000Z";

const TARGETS = {
  s1_2026_2027: {
    label: "2026/2027 Semester 1",
    period: "2026/S1",
    start: new Date("2026-09-01T00:00:00Z"),
    end: new Date("2027-03-01T23:59:59Z")
  },
  s2_2025_2026: {
    label: "2025/2026 Semester 2",
    period: "2025/S2",
    start: new Date("2026-03-01T00:00:00Z"),
    end: new Date("2026-08-01T23:59:59Z")
  }
};

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
  return cleanText(value).replace(/-/g, "") || null;
}

function parseDate(value) {
  const match = String(value ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
}

function eventDates(module) {
  const dates = [];
  for (const event of Array.isArray(module.events) ? module.events : []) {
    for (const value of [event.startdate, event.enddate]) {
      const date = parseDate(value);
      if (date) dates.push(date);
    }
  }
  return dates;
}

function overlapsTarget(module, target) {
  const details = module.details ?? {};
  const periods = cleanText(details["Year + Period"])
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (periods.includes(target.period)) return true;
  return eventDates(module).some((date) => date >= target.start && date <= target.end);
}

function levelFor(value) {
  return /^BACHELOR$/i.test(cleanText(value)) ? "undergraduate" : "postgraduate";
}

function subjectFromModule(module, semesters) {
  const details = module.details ?? {};
  const code = cleanCode(details["Module Code"]);
  const name = cleanText(details["English Description"] || details["Malay Description"] || module.name);
  return {
    code,
    name,
    faculty: canonicalFaculty(details["Faculty Description"] || "UNIVERSITY"),
    faculty_code: cleanText(details.Faculty) || null,
    department_code: canonicalDepartment(details["Department (DPT) Code"]),
    level: levelFor(details["Level Description"]),
    level_description: cleanText(details["Level Description"]) || null,
    credits: Number.isFinite(Number(details.Credit)) ? Number(details.Credit) : null,
    module_type: cleanText(details["Module Type (MOT) Code"]) || null,
    semesters: [...semesters].sort(),
    timeedit_id: module.id ?? null,
    timeedit_idonly: module.idOnly ?? null,
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

function writeCsv(subjects) {
  const lines = ["code,name,faculty,level,credits,department_code,module_type,semesters"];
  for (const subject of subjects) {
    lines.push([
      csvCell(subject.code),
      csvCell(subject.name),
      csvCell(subject.faculty),
      csvCell(subject.level),
      csvCell(subject.credits),
      csvCell(subject.department_code),
      csvCell(subject.module_type),
      csvCell(subject.semesters.join("; "))
    ].join(","));
  }
  fs.writeFileSync(OUTPUT_CSV, `${lines.join("\n")}\n`, "utf8");
}

function writeSql(subjects) {
  const lines = [
    "-- Canonical UM course catalogue generated from the um-timetable-sdk export.",
    "-- Covers 2026/S1 and 2025/S2 as identified by module metadata or event dates.",
    `-- Generated: ${new Date().toISOString()}.`,
    "",
    "UPDATE courses SET program_id = NULL;",
    "DELETE FROM courses;",
    "",
    "INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES"
  ];
  const batchSize = 200;
  for (let index = 0; index < subjects.length; index += batchSize) {
    const batch = subjects.slice(index, index + batchSize);
    lines.push(batch.map((subject) => {
      const id = `crs_${subject.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      return `  (${sqlString(id)}, ${sqlString(subject.code)}, ${sqlString(subject.name)}, ${sqlString(subject.faculty)}, ${sqlString(subject.department_code)}, ${subject.credits ?? "NULL"}, NULL, ${sqlString(CREATED_AT)})`;
    }).join(",\n") + ";");
    if (index + batchSize < subjects.length) {
      lines.push("", "INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES");
    }
  }
  lines.push("");
  fs.writeFileSync(OUTPUT_SQL, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing SDK export: ${inputPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const modules = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.results) ? parsed.results : []);
  if (modules.length === 0) throw new Error("SDK export contains no modules");

  const byCode = new Map();
  const invalidModules = [];
  const duplicateModules = [];
  const matchedRaw = [];
  for (const module of modules) {
    const code = cleanCode(module.details?.["Module Code"]);
    if (!code) {
      invalidModules.push(module.id ?? module.name ?? "unknown");
      continue;
    }
    const matched = Object.entries(TARGETS)
      .filter(([, target]) => overlapsTarget(module, target))
      .map(([key]) => key);
    if (matched.length === 0) continue;
    matchedRaw.push(module);
    const existing = byCode.get(code);
    if (existing) {
      duplicateModules.push(code);
      for (const semester of matched) {
        if (!existing.semesters.includes(semester)) existing.semesters.push(semester);
      }
      continue;
    }
    byCode.set(code, subjectFromModule(module, matched));
  }

  const subjects = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  const bySemester = {};
  const byLevel = {};
  for (const subject of subjects) {
    for (const semester of subject.semesters) bySemester[semester] = (bySemester[semester] ?? 0) + 1;
    byLevel[subject.level] = (byLevel[subject.level] ?? 0) + 1;
  }
  const overlap = subjects.filter((subject) => subject.semesters.includes("s1_2026_2027") && subject.semesters.includes("s2_2025_2026")).map((subject) => subject.code);
  const report = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, inputPath),
    sourceModules: modules.length,
    matchedModules: matchedRaw.length,
    uniqueCourses: subjects.length,
    bySemester,
    byLevel,
    overlapCount: overlap.length,
    overlapCodes: overlap,
    duplicateModules: [...new Set(duplicateModules)],
    invalidModules
  };
  const raw = {
    report,
    targets: TARGETS,
    modules: matchedRaw
  };

  fs.writeFileSync(OUTPUT_SUBJECTS, `${JSON.stringify(subjects, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_RAW, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(subjects);
  writeSql(subjects);
  console.log(`SDK modules: ${modules.length}`);
  console.log(`Matched modules: ${matchedRaw.length}`);
  console.log(`Unique courses: ${subjects.length}`);
  console.log(`By semester: ${JSON.stringify(bySemester)}`);
  console.log(`Overlap: ${overlap.length}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SUBJECTS)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_RAW)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_REPORT)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SQL)}`);
}

main();
