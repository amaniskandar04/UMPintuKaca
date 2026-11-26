import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const args = process.argv.slice(2);

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = args.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

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

function levelFor(value) {
  return /^BACHELOR$/i.test(cleanText(value)) ? "undergraduate" : "postgraduate";
}

function parsePeriod(code) {
  const raw = cleanText(code).replace(/\s+/g, "");
  const match = raw.match(/^(\d{4})\/([A-Za-z]\d*)$/);
  if (!match) {
    return {
      code: raw,
      year: null,
      term: null,
      label: raw.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      name: raw,
      display: raw
    };
  }
  const year = Number(match[1]);
  const term = match[2].toUpperCase();
  const isStandard = /^S[12]$/.test(term);
  const shortYear = String(year).slice(2);
  const shortNext = String(year + 1).slice(2);
  return {
    code: `${year}/${term}`,
    year,
    term,
    label: isStandard ? `s${term.slice(1)}_${year}_${year + 1}` : `${year}_${term}`.toLowerCase(),
    name: isStandard ? `Semester ${term.slice(1)}, ${year}/${year + 1}` : `${year}/${term}`,
    display: isStandard ? `${shortYear}/${shortNext}, Semester ${term.slice(1)}` : `${year}/${term}`,
    academicSemester: isStandard ? `${year}/${year + 1}-${term}` : `${year}/${term}`
  };
}

function modulePeriods(module) {
  return cleanText(module.details?.["Year + Period"])
    .split(",")
    .map((value) => value.trim().replace(/\s+/g, ""))
    .filter(Boolean);
}

function matchesPeriod(module, period) {
  return modulePeriods(module).includes(period.code);
}

function subjectFromModule(module, period) {
  const details = module.details ?? {};
  const levelDescription = cleanText(details["Level Description"]);
  return {
    code: cleanCode(details["Module Code"]),
    name: cleanText(details["English Description"] || details["Malay Description"] || module.name),
    faculty: canonicalFaculty(details["Faculty Description"] || "UNIVERSITY"),
    faculty_code: cleanText(details.Faculty) || null,
    department_code: canonicalDepartment(details["Department (DPT) Code"]),
    level: levelFor(levelDescription),
    level_description: levelDescription || null,
    credits: Number.isFinite(Number(details.Credit)) ? Number(details.Credit) : null,
    module_type: cleanText(details["Module Type (MOT) Code"]) || null,
    semester: period.academicSemester ?? period.code,
    displaySemester: period.display ?? period.code,
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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCsv(filePath, subjects, header, rowFor) {
  const lines = [header.join(",")];
  for (const subject of subjects) lines.push(rowFor(subject).map(csvCell).join(","));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeSql(filePath, subjects, meta) {
  const lines = [
    `-- UM subjects/courses for ${meta.description}`,
    `-- Source: TimeEdit, Year + Period = ${meta.periods}`,
    `-- Generated: ${new Date().toISOString().slice(0, 10)}`,
    "-- Batched INSERTs (200 rows each) to stay under D1 SQLITE_TOOBIG.",
    "",
    "INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES"
  ];
  const createdAt = "2025-01-01T00:00:00.000Z";
  const batchSize = 200;
  for (let index = 0; index < subjects.length; index += batchSize) {
    const batch = subjects.slice(index, index + batchSize);
    lines.push(batch.map((subject) => {
      const id = `crs_${subject.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      return `  (${sqlString(id)}, ${sqlString(subject.code)}, ${sqlString(subject.name)}, ${sqlString(subject.faculty)}, ${sqlString(subject.department_code)}, ${subject.credits ?? "NULL"}, NULL, ${sqlString(createdAt)})`;
    }).join(",\n") + ";");
    if (index + batchSize < subjects.length) {
      lines.push("", "INSERT OR IGNORE INTO courses (id, code, name, faculty, department, credits, program_id, created_at) VALUES");
    }
  }
  lines.push("");
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function resolveSource() {
  const explicit = getArg("raw") ?? getArg("input");
  if (explicit) return path.resolve(ROOT, explicit);
  const candidates = [
    path.join(DATA_DIR, "timeedit_catalog_raw.json"),
    path.join(DATA_DIR, "timeedit_s1_2026_2027_raw.json"),
    path.join(ROOT, "course_events_with_details.json"),
    path.join(ROOT, "..", "course_events_with_details.json"),
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Downloads", "course_events_with_details.json") : ""
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "No TimeEdit source found. Run `npm run fetch:catalog` first, pass `--raw=<file>`, " +
      "or place an SDK export named course_events_with_details.json in the project root."
    );
  }
  return found;
}

function loadModules(sourcePath) {
  const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const modules = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.results)
      ? parsed.results
      : Array.isArray(parsed.modules)
        ? parsed.modules
        : [];
  if (modules.length === 0) throw new Error(`No modules found in ${sourcePath}`);
  return modules;
}

function summarizeSubjects(subjects) {
  const byLevel = {};
  const byFaculty = {};
  for (const subject of subjects) {
    byLevel[subject.level] = (byLevel[subject.level] ?? 0) + 1;
    byFaculty[subject.faculty] = (byFaculty[subject.faculty] ?? 0) + 1;
  }
  return { byLevel, byFaculty };
}

function main() {
  const periodArg = getArg("periods") ?? "2026/S1,2025/S2";
  const periods = periodArg.split(",").map((value) => parsePeriod(value)).filter((period) => period.code);
  if (periods.length === 0) throw new Error("No target periods supplied. Use --periods=2026/S1,2025/S2");
  const sourcePath = resolveSource();
  const modules = loadModules(sourcePath);
  const sourceRelative = path.relative(ROOT, sourcePath);
  const extractedAt = new Date().toISOString();

  const perPeriod = new Map(periods.map((period) => [period.code, new Map()]));
  const combined = new Map();
  const duplicates = [];
  const invalidModules = [];
  const matchedModuleCounts = Object.fromEntries(periods.map((period) => [period.code, 0]));

  for (const module of modules) {
    const code = cleanCode(module.details?.["Module Code"]);
    const matched = periods.filter((period) => matchesPeriod(module, period));
    if (matched.length === 0) continue;
    if (!code) {
      invalidModules.push({ id: module.id ?? null, idOnly: module.idOnly ?? null, name: module.name ?? null });
      continue;
    }

    const subject = subjectFromModule(module, matched[0]);
    for (const period of matched) {
      matchedModuleCounts[period.code] += 1;
      const bucket = perPeriod.get(period.code);
      const existing = bucket.get(code);
      if (existing) {
        duplicates.push({ period: period.code, code });
        continue;
      }
      bucket.set(code, { ...subject, semester: period.academicSemester ?? period.code });
    }

    const existingCombined = combined.get(code);
    if (existingCombined) {
      for (const period of matched) {
        if (!existingCombined.periods.includes(period.code)) {
          existingCombined.periods.push(period.code);
          existingCombined.periodLabels.push(period.name);
          existingCombined.displayPeriods.push(period.display ?? period.code);
        }
      }
      if (subject.timeedit_id && !existingCombined.timeedit_ids.includes(subject.timeedit_id)) {
        existingCombined.timeedit_ids.push(subject.timeedit_id);
      }
      continue;
    }
    combined.set(code, {
      ...subject,
      periods: matched.map((period) => period.code),
      periodLabels: matched.map((period) => period.name),
      displayPeriods: matched.map((period) => period.display ?? period.code),
      timeedit_ids: subject.timeedit_id ? [subject.timeedit_id] : []
    });
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const written = [];

  for (const period of periods) {
    const subjects = [...perPeriod.get(period.code).values()].sort((a, b) => a.code.localeCompare(b.code));
    const { byLevel, byFaculty } = summarizeSubjects(subjects);
    const base = `um_${period.label}`;
    const jsonPath = path.join(DATA_DIR, `${base}_subjects_timeedit.json`);
    const csvPath = path.join(DATA_DIR, `${base}_subjects_timeedit.csv`);
    const sqlPath = path.join(DATA_DIR, `${base}_courses_seed_timeedit.sql`);
    const summaryPath = path.join(DATA_DIR, `${base}_summary.json`);

    const summary = {
      source: "cloud.timeedit.net/my_um/web/students (TimeEdit)",
      extractedAt,
      requestedSemester: period.name,
      yearPeriod: period.code,
      sourceRaw: sourceRelative,
      sourceModules: modules.length,
      matchedModules: matchedModuleCounts[period.code],
      uniqueCourses: subjects.length,
      byLevel,
      byFaculty,
      duplicates: duplicates.filter((entry) => entry.period === period.code).map((entry) => entry.code),
      invalidCodes: invalidModules.length
    };

    writeJson(jsonPath, subjects);
    writeCsv(
      csvPath,
      subjects,
      ["code", "name", "faculty", "level", "credits", "faculty_code", "department_code", "module_type"],
      (subject) => [subject.code, subject.name, subject.faculty, subject.level, subject.credits, subject.faculty_code, subject.department_code, subject.module_type]
    );
    writeSql(sqlPath, subjects, { description: period.name, periods: period.code });
    writeJson(summaryPath, summary);
    written.push(jsonPath, csvPath, sqlPath, summaryPath);

    console.log(`[${period.code}] ${period.name}: ${subjects.length} unique subjects (${matchedModuleCounts[period.code]} modules matched)`);
  }

  const combinedSubjects = [...combined.values()].sort((a, b) => a.code.localeCompare(b.code));
  const combinedByLevel = {};
  for (const subject of combinedSubjects) combinedByLevel[subject.level] = (combinedByLevel[subject.level] ?? 0) + 1;
  const overlap = combinedSubjects.filter((subject) => subject.periods.length > 1).map((subject) => subject.code);
  const combinedSummary = {
    generatedAt: extractedAt,
    source: sourceRelative,
    sourceModules: modules.length,
    periods: periods.map((period) => ({
      code: period.code,
      label: period.label,
      name: period.name,
      display: period.display ?? period.code,
      courses: perPeriod.get(period.code).size
    })),
    uniqueCourses: combinedSubjects.length,
    byLevel: combinedByLevel,
    overlapCourses: overlap.length,
    overlapCodes: overlap,
    duplicates,
    invalidModules
  };

  const combinedJson = path.join(DATA_DIR, "um_subjects_2026.json");
  const combinedCsv = path.join(DATA_DIR, "um_subjects_2026.csv");
  const combinedSql = path.join(DATA_DIR, "um_subjects_2026_seed.sql");
  const combinedSummaryPath = path.join(DATA_DIR, "um_subjects_2026_summary.json");

  writeJson(combinedJson, combinedSubjects);
  writeCsv(
    combinedCsv,
    combinedSubjects,
    ["code", "name", "faculty", "level", "credits", "faculty_code", "department_code", "module_type", "semesters", "periods"],
    (subject) => [subject.code, subject.name, subject.faculty, subject.level, subject.credits, subject.faculty_code, subject.department_code, subject.module_type, subject.displayPeriods.join("; "), subject.periods.join("; ")]
  );
  writeSql(combinedSql, combinedSubjects, {
    description: periods.map((period) => period.name).join(" + "),
    periods: periods.map((period) => period.code).join(", ")
  });
  writeJson(combinedSummaryPath, combinedSummary);

  console.log(`[combined] ${combinedSubjects.length} unique subjects across ${periods.length} periods (${overlap.length} overlap)`);
  for (const filePath of [...written, combinedJson, combinedCsv, combinedSql, combinedSummaryPath]) {
    console.log(`Wrote ${path.relative(ROOT, filePath)}`);
  }
}

main();
