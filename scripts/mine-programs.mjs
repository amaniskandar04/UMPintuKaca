import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data", "programs");
const RAW_DIR = path.join(DATA_DIR, "raw");
const SOURCES_PATH = path.join(DATA_DIR, "sources.json");
const OUTPUT_JSON = path.join(ROOT, "data", "um_programs.json");
const OUTPUT_RAW = path.join(ROOT, "data", "um_programs_raw.json");
const OUTPUT_CSV = path.join(ROOT, "data", "um_programs.csv");
const OUTPUT_REPORT = path.join(ROOT, "data", "um_programs_report.json");
const OUTPUT_SQL = path.join(ROOT, "apps", "api", "seed", "programs.seed.sql");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CREATED_AT = "2026-11-25T00:00:00.000Z";

const NAME_OVERRIDES = new Map([
  ["Bachelor of Urban and Regional", "Bachelor of Urban and Regional Planning"],
  ["Bachelor of Computer Science (AI)", "Bachelor of Computer Science (Artificial Intelligence)"],
  ["Bachelor of Science in Ecology", "Bachelor of Science in Ecology and Biodiversity"],
  ["Bachelor of Science in Environment", "Bachelor of Science in Environmental Management"],
  ["Bachelor of Science of Mathematics", "Bachelor of Science in Mathematics"],
  ["Bachelor of Sport Sciences", "Bachelor of Sports Science (Exercise Science)"],
  ["Bachelor of Malay Linguistic", "Bachelor of Malay Linguistics"],
  ["Bachelor of Proffesional Malay Language", "Bachelor of Professional Malay Language"],
  ["Bachelor of Counseling", "Bachelor of Counselling"],
  ["Bachelor of Education TESL", "Bachelor of Education (Teaching English as a Second Language)"],
  ["Master of System Engineering", "Master of Systems Engineering"],
  ["Master of Law", "Master of Laws"],
  ["Master of Sports Administrations and Leadership", "Master of Sports Administration and Leadership"],
  ["Master of Education Psychology", "Master of Educational Psychology"],
  ["Doctor of Philosophy (ISLAMIC STUDIES)", "Doctor of Philosophy (Islamic Studies)"],
  ["Doctor of Philosophy (PHARMACY)", "Doctor of Philosophy (Pharmacy)"],
  ["Doctor of Philosophy (SPORTS & EXERCISE SCIENCE)", "Doctor of Philosophy (Sports & Exercise Science)"],
  ["Doctor of Philosophy Faculty of Business & Economics", "Doctor of Philosophy (Faculty of Business & Economics)"],
  ["Doctor of Philosophy in Faculty of Built Environment", "Doctor of Philosophy (Faculty of Built Environment)"],
  ["Doctor of Philosophy (Asia Europe Institute)", "Doctor of Philosophy (Asia-Europe Institute)"],
  ["Master of Education in English as A Second Language", "Master of Education in English as a Second Language"],
  ["Master of Professional Counseling", "Master of Professional Counselling"],
  ["Master of Arts (Strategic and Defense Studies)", "Master of Arts (Strategic and Defence Studies)"]
]);

const CODE_OVERRIDES = new Map([
  ["Bachelor of Business Administration", "UG-BBA"],
  ["Bachelor in Accounting", "UG-BACC"],
  ["Bachelor of Finance", "UG-BFIN"],
  ["Bachelor of Economics", "UG-BECON"],
  ["Bachelor of Laws", "UG-LLB"],
  ["Bachelor of Medicine and Bachelor of Surgery", "UG-MBBS"],
  ["Bachelor of Dental Surgery", "UG-BDS"],
  ["Bachelor of Pharmacy with Honours", "UG-BPHARM"],
  ["Bachelor of Nursing Science", "UG-BNURS"],
  ["Bachelor of Education (Teaching English as a Second Language)", "UG-EDUC-TESL"],
  ["Bachelor of Jurisprudence (External)", "UG-BJURIS"],
  ["Master of Business Administration", "PG-MBA"],
  ["Master of Laws", "PG-LLM"],
  ["Postgraduate Diploma in Education", "PG-PGDE"]
]);

const FACULTY_SHORT = {
  "ACADEMY OF ISLAMIC STUDIES": "ISL",
  "ACADEMY OF MALAY STUDIES": "MAL",
  "ASIA-EUROPE INSTITUTE": "AEI",
  "FACULTY OF ARTS AND SOCIAL SCIENCES": "ARTS",
  "FACULTY OF BUILT ENVIRONMENT": "BUILT",
  "FACULTY OF BUSINESS AND ECONOMICS": "BUS",
  "FACULTY OF COMPUTER SCIENCE AND INFORMATION TECHNOLOGY": "COMP",
  "FACULTY OF CREATIVE ARTS": "CREA",
  "FACULTY OF DENTISTRY": "DENT",
  "FACULTY OF EDUCATION": "EDUC",
  "FACULTY OF ENGINEERING": "ENGG",
  "FACULTY OF LANGUAGES AND LINGUISTICS": "LANG",
  "FACULTY OF LAW": "LAW",
  "FACULTY OF MEDICINE": "MED",
  "FACULTY OF NURSING": "NURS",
  "FACULTY OF PHARMACY": "PHAR",
  "FACULTY OF SCIENCE": "SCI",
  "FACULTY OF SPORTS AND EXERCISE SCIENCE": "SPOR",
  // Canonical spellings. Keep the same codes so programme ids stay stable.
  "FACULTY OF SPORTS AND EXERCISE SCIENCES": "SPOR",
  "INSTITUTE FOR ADVANCED STUDIES": "IAS",
  "INTERNATIONAL INSTITUTE OF PUBLIC POLICY AND MANAGEMENT": "INPUMA",
  "CENTRE FOR FOUNDATION STUDIES IN SCIENCE": "PASUM",
  UMCCED: "UMCCED",
  "UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)": "UMCCED"
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanText(value) {
  return decodeEntities(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical faculty name. Matches the expressions in the API so the catalogue,
 * the faculty filter, and the seeds all agree. Uppercase everywhere; the source
 * pages disagree on casing and abbreviate UMCCed.
 */
function canonicalFaculty(value) {
  const text = cleanText(value).toUpperCase();
  if (!text) return null;
  if (text === "FACULTY OF SPORTS AND EXERCISE SCIENCE") return "FACULTY OF SPORTS AND EXERCISE SCIENCES";
  if (text === "UMCCED") return "UNIVERSITI MALAYA CENTRE FOR CONTINUING EDUCATION (UMCCED)";
  return text;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchText(url, cacheFile, offline = false, timeoutMs = 30000) {
  if (offline && fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9"
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      ensureDir(path.dirname(cacheFile));
      fs.writeFileSync(cacheFile, text, "utf8");
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  throw lastError || new Error("fetch failed");
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function extractProgrammes(html, level) {
  const links = [];
  const pattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const name = cleanText(match[2]);
    if (!name) continue;
    if (level === "undergraduate" && !/^Bachelor/i.test(name)) continue;
    if (
      level === "postgraduate" &&
      !/^(Master|Doctor|Postgraduate Diploma)/i.test(name)
    ) {
      continue;
    }
    links.push({ name, href: match[1] });
  }
  const seen = new Set();
  return links.filter((item) => {
    const key = normalize(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function facultyShort(faculty) {
  if (FACULTY_SHORT[faculty]) return FACULTY_SHORT[faculty];
  return faculty
    .replace(/^(FACULTY OF|ACADEMY OF|INSTITUTE FOR|INTERNATIONAL INSTITUTE OF)\s+/i, "")
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 8);
}

function facultyDisplayLabel(faculty) {
  return faculty
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bAnd\b/g, "&")
    .replace(/\bOf\b/g, "of")
    .replace(/\bFor\b/g, "for")
    .replace(/\bIn\b/g, "in")
    .replace(/\bThe\b/g, "the");
}

function deriveCode(level, name, faculty) {
  const override = CODE_OVERRIDES.get(name);
  if (override) return override;

  const prefix = level === "foundation" ? "FD" : level === "diploma" ? (name.startsWith("Advanced") ? "ADIP" : name.startsWith("Executive") ? "EDIP" : "DIP") : level === "undergraduate" ? "UG" : "PG";
  if (/^Doctor of Philosophy/i.test(name)) {
    const mode = name.match(/\((Research|Mixed-Mode)\)/i)?.[1];
    const modeCode = mode ? (mode.toLowerCase() === "research" ? "RES" : "MM") : "";
    return `${prefix}-PHD-${facultyShort(faculty)}${modeCode ? `-${modeCode}` : ""}`;
  }
  if (/^Doctor in |^Doctor of /i.test(name)) {
    const payload = name.replace(/^Doctor (in|of)\s+/i, "");
    const paren = payload.match(/\(([^)]+)\)/);
    const base = paren ? payload.replace(/\([^)]+\)/g, " ") : payload;
    const words = base
      .split(/\s+/)
      .filter((word) => word && !/^(of|in|and|the|for|with)$/i.test(word));
    const initials = words.map((word) => word[0]).join("").toUpperCase().slice(0, 8);
    const parenCode = paren
      ? paren[1]
          .split(/\s+/)
          .filter((word) => word && !/^(of|in|and|the|for|with)$/i.test(word))
          .map((word) => word[0])
          .join("")
          .toUpperCase()
          .slice(0, 6)
      : "";
    return `${prefix}-D-${initials}${parenCode ? `-${parenCode}` : ""}`;
  }

  const stripped = name
    .replace(/^(Bachelor|Master) (of|in)\s+/i, "")
    .replace(/^(Postgraduate|Advanced|Executive) Diploma in\s+/i, "")
    .replace(/^Diploma in\s+/i, "")
    .replace(/^Foundation in\s+/i, "")
    .trim();
  const parenMatch = stripped.match(/\(([^)]+)\)/);
  const base = stripped.replace(/\([^)]+\)/g, " ").trim();
  const stop = new Set(["of", "in", "and", "the", "for", "with", "a", "an"]);
  const words = base.split(/\s+/).filter((word) => word && !stop.has(word.toLowerCase()));
  let initials = words.map((word) => word[0]).join("").toUpperCase().slice(0, 8);
  if (parenMatch) {
    const parenWords = parenMatch[1].split(/\s+/).filter((word) => word && !stop.has(word.toLowerCase()));
    const parenInitials = parenWords.map((word) => word[0]).join("").toUpperCase().slice(0, 6);
    initials = `${initials}-${parenInitials}`;
  }
  if (!initials) initials = "GENERAL";
  const generic = /^(A|EDUCATION|SCIENCE|LAW|ARTS|ARTS-|A-)$/i.test(initials) || /^(MASTER|DOCTOR)/i.test(initials);
  return `${prefix}-${initials}${generic ? `-${facultyShort(faculty)}` : ""}`.slice(0, 32);
}

function normalizeProgram(program, level, faculty, sourceUrl) {
  const overrideName = NAME_OVERRIDES.get(program.name);
  let name = overrideName ?? program.name;
  if (/^Doctor of Philosophy$/i.test(name)) {
    name = `Doctor of Philosophy (${facultyDisplayLabel(faculty)})`;
  }
  return {
    name,
    level,
    faculty: canonicalFaculty(faculty),
    sourceUrl,
    rawName: program.name
  };
}

function ensureUniqueCodes(programs, report) {
  const used = new Set();
  for (const program of programs) {
    let code = deriveCode(program.level, program.name, program.faculty)
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    if (!code) code = "PROGRAM";
    let unique = code;
    if (used.has(unique)) {
      const facultyCode = `${code}-${facultyShort(program.faculty)}`.slice(0, 32);
      unique = facultyCode;
      report.duplicateCodes.push({ name: program.name, original: code, assigned: unique });
    }
    let suffix = 2;
    while (used.has(unique)) {
      unique = `${unique.slice(0, 29)}-${suffix}`;
      suffix += 1;
      report.duplicateCodes.push({ name: program.name, original: code, assigned: unique });
    }
    used.add(unique);
    program.code = unique;
    program.id = `prg_${slugify(unique)}`;
  }
}

function writeCsv(programs, filePath) {
  const header = ["code", "name", "faculty", "level"];
  const lines = [header.join(",")];
  for (const program of programs) {
    lines.push([csvCell(program.code), csvCell(program.name), csvCell(program.faculty), csvCell(program.level)].join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeSql(programs, filePath) {
  const lines = [
    "-- Generated by scripts/mine-programs.mjs. Do not edit by hand.",
    `-- Generated at ${new Date().toISOString()}. Source data: data/um_programs.json.`,
    "",
    "UPDATE courses SET program_id = NULL;",
    "DELETE FROM programs;",
    "",
    "INSERT OR REPLACE INTO programs (id, code, name, faculty, level, created_at) VALUES"
  ];
  const rows = programs.map((program) => {
    return `  (${sqlString(program.id)}, ${sqlString(program.code)}, ${sqlString(program.name)}, ${sqlString(program.faculty)}, ${sqlString(program.level)}, ${sqlString(CREATED_AT)})`;
  });
  lines.push(`${rows.join(",\n")};`);
  lines.push("");
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const offline = process.argv.includes("--offline");
  const sources = readJson(SOURCES_PATH);
  const report = {
    generatedAt: new Date().toISOString(),
    lastVerified: sources.lastVerified ?? "2026-11-25",
    total: 0,
    byLevel: {},
    byFaculty: {},
    sourcePages: [],
    duplicates: [],
    duplicateCodes: [],
    failedPages: []
  };

  const results = await mapLimit(sources.facultyPages, 4, async (page) => {
    const cacheFile = path.join(RAW_DIR, `${slugify(page.url).slice(0, 160)}.html`);
    try {
      const html = await fetchText(page.url, cacheFile, offline, 30000);
      const programmes = extractProgrammes(html, page.level);
      return { page, ok: true, bytes: html.length, programmes };
    } catch (error) {
      return { page, ok: false, error: error.message, programmes: [] };
    }
  });

  const programs = [];
  for (const result of results) {
    report.sourcePages.push({
      url: result.page.url,
      faculty: result.page.faculty,
      level: result.page.level,
      ok: result.ok,
      bytes: result.bytes ?? 0,
      programmes: result.programmes.length,
      error: result.error ?? null
    });
    if (!result.ok) {
      report.failedPages.push({ url: result.page.url, error: result.error });
      continue;
    }
    for (const programme of result.programmes) {
      programs.push(normalizeProgram(programme, result.page.level, result.page.faculty, result.page.url));
    }
  }

  for (const program of sources.specialPrograms ?? []) {
    programs.push({
      name: program.name,
      level: program.level,
      faculty: canonicalFaculty(program.faculty),
      sourceUrl: program.sourceUrl,
      rawName: program.name
    });
  }

  const seen = new Set();
  const unique = [];
  for (const program of programs) {
    const key = `${program.level}|${normalize(program.faculty)}|${normalize(program.name)}`;
    if (seen.has(key)) {
      report.duplicates.push(program);
      continue;
    }
    seen.add(key);
    unique.push(program);
  }

  ensureUniqueCodes(unique, report);
  unique.sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name));
  for (const program of unique) {
    report.byLevel[program.level] = (report.byLevel[program.level] ?? 0) + 1;
    report.byFaculty[program.faculty] = (report.byFaculty[program.faculty] ?? 0) + 1;
  }
  report.total = unique.length;

  const raw = {
    generatedAt: report.generatedAt,
    lastVerified: report.lastVerified,
    sourcePages: results.map((result) => ({
      url: result.page.url,
      faculty: result.page.faculty,
      level: result.page.level,
      ok: result.ok,
      bytes: result.bytes ?? 0,
      programmes: result.programmes,
      error: result.error ?? null
    }))
  };

  ensureDir(DATA_DIR);
  ensureDir(path.dirname(OUTPUT_SQL));
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify({ generatedAt: report.generatedAt, lastVerified: report.lastVerified, programs: unique }, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_RAW, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(unique, OUTPUT_CSV);
  writeSql(unique, OUTPUT_SQL);

  console.log(`Programs: ${unique.length}`);
  console.log(`Levels: ${JSON.stringify(report.byLevel)}`);
  console.log(`Failed pages: ${report.failedPages.length}`);
  console.log(`Duplicate codes: ${report.duplicateCodes.length}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_CSV)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_REPORT)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SQL)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
