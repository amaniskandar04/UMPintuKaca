import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data", "clubs");
const RAW_DIR = path.join(DATA_DIR, "raw");
const SOURCES_PATH = path.join(DATA_DIR, "sources.json");
const EXTRAS_PATH = path.join(DATA_DIR, "extras.json");
const OUTPUT_JSON = path.join(ROOT, "data", "um_clubs.json");
const OUTPUT_RAW = path.join(ROOT, "data", "um_clubs_raw.json");
const OUTPUT_CSV = path.join(ROOT, "data", "um_clubs.csv");
const OUTPUT_REPORT = path.join(ROOT, "data", "um_clubs_report.json");
const OUTPUT_SQL = path.join(ROOT, "apps", "api", "seed", "clubs.seed.sql");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const LAST_VERIFIED = new Date().toISOString().slice(0, 10);
const CREATED_AT = "2026-11-25T00:00:00.000Z";

const HEADER_NAMES = new Set([
  "name",
  "faculty",
  "negeri",
  "college",
  "student union of each faculty",
  "anak negeri",
  "faculty society"
]);

const GENERIC_WORDS = new Set([
  "universiti",
  "university",
  "malaya",
  "malaysia",
  "um",
  "of",
  "the",
  "dan",
  "and",
  "for",
  "kelab",
  "persatuan",
  "club",
  "society",
  "association",
  "student",
  "students",
  "badan"
]);

const CODE_PAIRS = [
  ["Persatuan Ekonomi UM (PEKUMA)", "PEKUMA"],
  ["Business Club UM (UMBC)", "UMBC"],
  ["Finance Association UM (UMFA)", "UMFA"],
  ["Accounting Club UM (UMAC)", "UMAC"],
  ["ANSOS UM (Anthropology Society)", "ANSOS"],
  ["Persatuan Sejarah UM (History Society)", "PSUM"],
  ["Persatuan Geografi UM (Geography Society)", "PGUM"],
  ["International Relations Society (IRSOC)", "IRSOC"],
  ["South East Asian Studies (SEAS)", "SEAS"],
  ["East Asian Studies Association（EASA）", "EASA"],
  ["Persatuan Pentadbiran Kerja Sosial Universiti Malaya (PPKSUM)", "PPKSUM"],
  ["Persatuan Bahasa Arab UM (PBAUM)", "PBAUM"],
  ["Persatuan Bahasa Arab Um", "PBAUM"],
  ["Google Developer Group On Campus Universiti Malaya", "GDG"],
  ["Persatuan Komputer Universiti Malaya", "PEKOM"],
  ["Data Analytics Club (UMDAC)", "UMDAC"],
  ["ArtScience Club Universiti Malaya (ASC UM)", "ASC"],
  ["UM Dental Society", "UMDENSOC"],
  ["Persatuan Kaunseling UM", "PERKUM"],
  ["Engineering Society UM", "PKUM"],
  ["Angkatan Kejuruteraan Islam Universiti Malaya (AKIUM)", "AKIUM"],
  ["Malayan Electrical Student Association", "MESA"],
  ["American Society of Heating, Refrigerating and Air-Conditioning Engineers (ASHRAE)", "ASHRAE"],
  ["University of Malaya Law Society (UMLS)", "UMLS"],
  ["Universiti Malaya Medical Society", "UMMEDSOC"],
  ["Biomedical Science Society UM", "UMBIO"],
  ["Pharmacy Society of UM", "UMPHARMASOC"],
  ["Persatuan Biokimia Universiti Malaya (PBUM)", "PBUM"],
  ["UM Mathematical Association", "UMMA"],
  ["Universiti Malaya Actuarial & Financial Mathematics Society", "UMACT"],
  ["Persatuan Fizik UM", "PERFUM"],
  ["Alam Bina Society (ABSOC)", "ABSOC"],
  ["Persatuan Pelajar Sains Sukan Universiti Malaya (PPSSUM)", "PPSSUM"],

  ["UM 24 Festive Drum", "UM24"],
  ["Persatuan Mahasiswa Istimewa Universiti Malaya (PERMIUM)", "PERMIUM"],
  ["SEKRETARIAT RAKAN MUDA UNIVERSITY MALAYAS", "RAKANMUDA"],
  ["Pesta Tanglung Universiti Malaya (PTUM)", "PTUM"],
  ["National Blood Donation (NBD) UM Club :", "NBD"],
  ["National Blood Donation (NBD) UM Club", "NBD"],
  ["Temuan Tutoring", "TEMUAN"],

  ["PERSATUAN KEBANGSAAN PELAJAR ISLAM MALAYSIA UNIVERSITI MALAYA", "PKPIM"],
  ["Persaudaraan Kristian Varsiti Universiti Malaya (PKVUM)", "PKVUM"],
  ["PERSATUAN BELIA HARMONI UNIVERSITI MALAYA", "HARMONI"],
  ["PERSATUAN SIKH UNIVERSITI MALAYA (UMSS)", "UMSS"],
  ["PERSATUAN MAHASISWA ISLAM UNIVERSITI MALAYA", "PMIUM"],
  ["PERSATUAN HINDU UNIVERSITI MALAYA", "PHUM"],
  ["Persatuan Pelajar Katolik Universiti Malaya (PKUM)", "CSSUM"],

  ["UM Makers Club", "UMMAKERS"],
  ["Malaya Debate Society", "MALAYADEBATE"],
  ["Majlis Oratar UM", "MORUM"],
  ["UM Toastmasters Club", "UMTMC"],

  ["Universiti Malaya Entrepreneurship Secretaria", "UMES"],
  ["Universiti Malaya Startup Community", "UMSCOM"],
  ["Science Startup Club UM", "SCIENCESTARTUP"],

  ["UM Dancesport Club", "UMDANCESPORT"],
  ["University Malaya Cheerleading Club", "UMCHEER"],
  ["International Taekwondo Federation (ITF UM)", "TKD-ITF"],
  ["Kelab Lawan Pedang UM (Olympic Fencing)", "KLPUM"],
  ["UM Taekwondo Club WT (for Beginner)", "TKD-WT"],
  ["UM Official Taekwondo Team (for players only)", "TKD-TEAM"],
  ["Silat Cekak Hanafi UM", "CHUM"],
  ["Persatuan Seni Silat Cekak Malaysia Universiti Malaya (PSSCMU", "PSSCMUM"],
  ["UM Bandminton Club", "UMBADMINTON"],
  ["Malaya Esport Club", "UMESPORTS"],
  ["Universiti Malaya Chess Club", "UMCHESS"],
  ["Pendekar Seabad UM (Silat Gayong)", "PSSGM"],
  ["UM Tigers (Tamil Language Soceity)", "UMTIGERS"],
  ["Kabaddi Club of Universiti Malaya (KCUM)", "KCUM"],
  ["Universiti Malaya FC", "UMFC"],
  ["UM Badminton Club", "UMBADMINTON"],
  ["UM Volleyball (Women)", "UMVB-W"],
  ["Official UM Volleyball Team", "UMVB-TEAM"],
  ["Universiti Malaya Tennis Team", "UMTENNIS"],
  ["City Glider Ultimate Frisbee (UM)", "CITYGLIDER"],
  ["One Point Ultimate (Based in UM)", "ONEPOINT"],
  ["Universiti Malaya Basketball Team", "UMBASKETBALL"],
  ["University Malaya Rugby Club (UM Blues RC)", "UMBLUES"],
  ["Universiti Malaya Floorball Club (UM Lynx)", "UMLYNX"],
  ["UM Handballerz", "UMHANDBALL"],
  ["UM Futsal (Men)", "UMFUTSAL-M"],
  ["UM Futsal (Women)", "UMFUTSAL-W"],
  ["UM Netball (Cougars)", "UMNETBALL"],
  ["Sepak Takraw Universiti Malaya", "UMSEPAK"],
  ["UM Panthers (Men's Softball)", "UMPANTHERS"],
  ["Universiti Malaya FC (UMFC)", "UMFC"],
  ["UM Law Sports Club", "UMLAWSRC"],
  ["Universiti Malaya Cycling Club (UMCC)", "UMCC"],
  ["Persatuan Bouldering Universiti Malaya (PBUM)", "PBOLD"],

  ["Suara Siswa", "SSUM"],
  ["Liga Mahasiswa", "LIGA"],
  ["HARAM", "HARAM"],

  ["Mahasiswa Progresif", "MPROG"],
  ["Siswa Malaya", "SISWAMALAYA"],
  ["UMANY", "UMANY"],
  ["New Gen", "NEWGEN"],
  ["Demokrat", "DEMOKRAT"],
  ["Neo Siswa", "NEOSISWA"],

  ["Umnosiswa UM", "UMNOSISWA"],
  ["SiswaPAS UM", "SISWAPAS"],
  ["Mahasiswa Keadilan UM", "MKUM"]
];

const CODE_BY_NAME = new Map(CODE_PAIRS.map(([name, code]) => [normalize(name), code]));

const NAME_BY_CODE = new Map([
  ["CSSUM", "Catholic Students Society of Universiti Malaya"],
  ["PKUM", "Engineering Society Universiti Malaya"],
  ["PBAUM", "Persatuan Bahasa Arab Universiti Malaya"],
  ["PBUM", "Persatuan Biokimia Universiti Malaya"],
  ["PBOLD", "Persatuan Bouldering Universiti Malaya"],
  ["MESA", "Malaya Electrical Students Association"],
  ["PSSGM", "Pendekar Seabad UM (Silat Gayong)"],
  ["PSSCMUM", "Persatuan Seni Silat Cekak Malaysia Universiti Malaya"],
  ["CHUM", "Persatuan Silat Cekak Ustaz Hanafi Universiti Malaya"],
  ["TKD-ITF", "International Taekwondo Federation UM"],
  ["TKD-WT", "UM Taekwondo Club WT"],
  ["TKD-TEAM", "UM Official Taekwondo Team"],
  ["UMBADMINTON", "UM Badminton Club"],
  ["UMESPORTS", "Malaya Esports Club"],
  ["UMTIGERS", "UM Tigers (Tamil Language Society)"],
  ["UMFC", "Universiti Malaya FC"],
  ["MORUM", "Majlis Orator Universiti Malaya"],
  ["UM24", "UM 24 Festive Drum"],
  ["RAKANMUDA", "Sekretariat Rakan Muda Universiti Malaya"],
  ["UMES", "Universiti Malaya Entrepreneurship Secretariat"],
  ["SEAS", "South East Asian Studies"],
  ["PKPIM", "Persatuan Kebangsaan Pelajar Islam Malaysia Universiti Malaya"],
  ["HARMONI", "Persatuan Belia Harmoni Universiti Malaya"],
  ["UMSS", "Persatuan Sikh Universiti Malaya"],
  ["PMIUM", "Persatuan Mahasiswa Islam Universiti Malaya"],
  ["PHUM", "Persatuan Hindu Universiti Malaya"],
  ["PKVUM", "Persaudaraan Kristian Varsiti Universiti Malaya"],
  ["UMANY", "UMANY"],
  ["NBD", "National Blood Donation (NBD) UM Club"]
]);

const ALIASES_BY_CODE = new Map([
  ["CSSUM", ["PKUM (sheet label)", "Persatuan Pelajar Katolik Universiti Malaya", "CSA", "Catholic Student Association"]],
  ["PKUM", ["Persatuan Kejuruteraan Universiti Malaya", "Engineering Society UM"]],
  ["PBAUM", ["Persatuan Bahasa Arab UM"]],
  ["PBUM", ["Persatuan Biokimia UM"]],
  ["PBOLD", ["Persatuan Bouldering UM", "PBUM (sheet label)"]],
  ["MESA", ["Malayan Electrical Student Association"]],
  ["PSSGM", ["Persatuan Seni Silat Gayong Malaysia Universiti Malaya"]],
  ["PSSCMUM", ["PSSCMU", "PSSCMUM"]],
  ["CHUM", ["Silat Cekak Hanafi UM"]],
  ["TKD-ITF", ["International Taekwondo Federation (ITF UM)"]],
  ["TKD-WT", ["UM Taekwondo Club WT (for Beginner)"]],
  ["TKD-TEAM", ["UM Official Taekwondo Team (for players only)"]],
  ["UMBADMINTON", ["UM Bandminton Club"]],
  ["UMESPORTS", ["Malaya Esport Club"]],
  ["UMTIGERS", ["UM Tigers (Tamil Language Soceity)"]],
  ["UMFC", ["Universiti Malaya FC (UMFC)", "UMFC"]],
  ["MORUM", ["Majlis Oratar UM", "Debat Malaya"]],
  ["UM24", ["Gendang 24 Musim UM", "UM 24"]],
  ["RAKANMUDA", ["SEKRETARIAT RAKAN MUDA UNIVERSITY MALAYAS"]],
  ["UMES", ["Universiti Malaya Entrepreneurship Secretaria"]],
  ["SEAS", ["South East Asian Studies (SEAS)", "SEASUM"]],
  ["PKPIM", ["PERSATUAN KEBANGSAAN PELAJAR ISLAM MALAYSIA UNIVERSITI MALAYA"]],
  ["HARMONI", ["PERSATUAN BELIA HARMONI UNIVERSITI MALAYA"]],
  ["UMSS", ["PERSATUAN SIKH UNIVERSITI MALAYA (UMSS)"]],
  ["PMIUM", ["PERSATUAN MAHASISWA ISLAM UNIVERSITI MALAYA"]],
  ["PHUM", ["PERSATUAN HINDU UNIVERSITI MALAYA"]],
  ["PKVUM", ["Persaudaraan Kristian Varsiti Universiti Malaya (PKVUM)"]],
  ["UMANY", ["University of Malaya Association of New Youth"]],
  ["NBD", ["National Blood Donation (NBD) UM Club :"]]
]);

const CATEGORY_BY_CODE = new Map([
  ["CSSUM", "Religious"],
  ["PKUM", "Faculty Society"],
  ["PBUM", "Faculty Society"],
  ["PBOLD", "Sports"],
  ["MESA", "Faculty Society"],
  ["PSSGM", "Sports"],
  ["PSSCMUM", "Sports"],
  ["CHUM", "Sports"],
  ["TKD-ITF", "Sports"],
  ["TKD-WT", "Sports"],
  ["TKD-TEAM", "Sports"],
  ["UMBADMINTON", "Sports"],
  ["UMFC", "Sports"],
  ["MORUM", "Development"],
  ["UM24", "Social"],
  ["RAKANMUDA", "Social"],
  ["UMES", "Entrepreneurship"],
  ["SEAS", "Faculty Society"],
  ["PKPIM", "Religious"],
  ["HARMONI", "Religious"],
  ["UMSS", "Religious"],
  ["PMIUM", "Religious"],
  ["PHUM", "Religious"],
  ["PKVUM", "Religious"],
  ["UMANY", "Campus Politics"]
]);

const FACULTY_BY_CODE = new Map([
  ["PKUM", "Faculty of Engineering"],
  ["PBAUM", "Faculty of Languages and Linguistics"],
  ["PBUM", "Faculty of Science"],
  ["MESA", "Faculty of Engineering"],
  ["PBOLD", null],
  ["PSSGM", null],
  ["PSSCMUM", null],
  ["CHUM", null],
  ["TKD-ITF", null],
  ["TKD-WT", null],
  ["TKD-TEAM", null],
  ["UMBADMINTON", null],
  ["UMFC", null],
  ["MORUM", null],
  ["UM24", null],
  ["RAKANMUDA", null],
  ["UMES", null],
  ["CSSUM", null],
  ["SEAS", "Faculty of Arts and Social Sciences"],
  ["PKPIM", null],
  ["HARMONI", null],
  ["UMSS", null],
  ["PMIUM", null],
  ["PHUM", null],
  ["PKVUM", null],
  ["UMANY", null]
]);

const STATE_MAP = new Map([
  ["johor", { code: "PEMASHOR", name: "Persatuan Mahasiswa Johor Universiti Malaya" }],
  ["kedah", { code: "PERMADAH", name: "Persatuan Mahasiswa Kedah Universiti Malaya" }],
  ["kelantan", { code: "PMKUM", name: "Persatuan Mahasiswa Kelantan Universiti Malaya" }],
  ["melaka", { code: "MAKMUM", name: "Persatuan Mahasiswa Anak Melaka Universiti Malaya" }],
  ["negeri sembilan", { code: "PERMANIS", name: "Persatuan Anak Negeri Sembilan Universiti Malaya" }],
  ["pahang", { code: "PMPUM", name: "Persatuan Mahasiswa Pahang Universiti Malaya" }],
  ["pulau pinang", { code: "PMPPUM", name: "Persatuan Mahasiswa Pulau Pinang Universiti Malaya" }],
  ["perak", { code: "PEMARAK", name: "Persatuan Mahasiswa Perak Universiti Malaya" }],
  ["perlis", { code: "PERLIS", name: "Persatuan Mahasiswa Perlis Universiti Malaya" }],
  ["sabah", { code: "PERMASA", name: "Persatuan Mahasiswa Sabah Universiti Malaya" }],
  ["sarawak", { code: "PMSUM", name: "Persatuan Mahasiswa Sarawak Universiti Malaya" }],
  ["selangor", { code: "PERMAS", name: "Persatuan Mahasiswa Selangor Universiti Malaya" }],
  ["terengganu", { code: "PERMATA", name: "Persatuan Mahasiswa Anak Terengganu Universiti Malaya" }]
]);

const UNION_CODES = new Map([
  ["faculty of arts and social sciences", "UMSU-FASS"],
  ["faculty of business and economics", "UMSU-FBE"],
  ["faculty of computer science and information technology", "UMSU-FCSIT"],
  ["faculty of creative arts", "UMSU-FCA"],
  ["faculty of dentistry", "UMSU-FOD"],
  ["faculty of education", "UMSU-FED"],
  ["faculty of engineering", "UMSU-FENG"],
  ["faculty of languages and linguistics", "UMSU-FLL"],
  ["faculty of law", "UMSU-FOL"],
  ["faculty of medicine", "UMSU-FOM"],
  ["faculty of pharmacy", "UMSU-FOP"],
  ["faculty of science", "UMSU-FOS"],
  ["faculty of built environment", "UMSU-FOBE"],
  ["faculty of sports and exercise science", "UMSU-FSES"],
  ["faculty of sports and exercise sciences", "UMSU-FSES"],
  ["academy of islamic studies", "UMSU-API"],
  ["academy of malay studies", "UMSU-APM"],
  ["institute for advanced studies", "UMSU-IAS"]
]);

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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function cleanText(value) {
  return stripTags(String(value ?? "")).replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\buniversiti\s+malaya\b/g, " ")
    .replace(/\buniversity\s+of\s+malaya\b/g, " ")
    .replace(/\buniversity\s+malaya\b/g, " ")
    .replace(/\bum\b/g, " ")
    .replace(/\bmalaya\b/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function deriveCode(name) {
  const paren = name.match(/\(([A-Za-z0-9&.\- ]{2,20})\)/);
  if (paren) {
    const candidate = paren[1].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (candidate.length >= 2 && candidate.length <= 16) return candidate;
  }
  const words = normalize(name).split(" ").filter((word) => word && !GENERIC_WORDS.has(word));
  if (words.length >= 2) {
    const initials = words.map((word) => word[0]).join("").toUpperCase();
    if (initials.length >= 2) return initials.slice(0, 12);
  }
  return (slugify(name).replace(/_/g, "").slice(0, 12).toUpperCase() || "CLUB");
}

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseGviz(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Unexpected Google Sheets response");
  return JSON.parse(text.slice(start, end + 1));
}

function cellValue(row, index) {
  const value = row?.c?.[index]?.v;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function extractInstagram(value) {
  const text = cleanText(value);
  if (!text) return null;
  const at = text.match(/^@([A-Za-z0-9_.]+)$/);
  if (at) return `@${at[1].toLowerCase()}`;
  const matches = [...text.matchAll(/instagram\.com\/([A-Za-z0-9_.]+)/gi)];
  for (const match of matches) {
    const handle = match[1].toLowerCase();
    if (["p", "reel", "reels", "explore", "stories", "tv"].includes(handle)) continue;
    return `@${handle}`;
  }
  return null;
}

function canonicalFaculty(value) {
  if (!value) return null;
  const normalized = normalize(value);
  if (normalized.includes("computer science")) return "FACULTY OF COMPUTER SCIENCE AND INFORMATION TECHNOLOGY";
  if (normalized.includes("business and economics") || normalized.includes("fbe") || normalized.includes("fpe")) return "FACULTY OF BUSINESS AND ECONOMICS";
  if (normalized.includes("arts and social sciences") || normalized.includes("fass")) return "FACULTY OF ARTS AND SOCIAL SCIENCES";
  if (normalized.includes("islamic studies") || normalized.includes("api")) return "ACADEMY OF ISLAMIC STUDIES";
  if (normalized.includes("malay studies") || normalized.includes("apm")) return "ACADEMY OF MALAY STUDIES";
  if (normalized.includes("advanced studies") || normalized.includes("ias")) return "INSTITUTE FOR ADVANCED STUDIES";
  if (normalized.includes("built environment") || normalized.includes("fobe")) return "FACULTY OF BUILT ENVIRONMENT";
  if (normalized.includes("creative arts") || normalized.includes("fca")) return "FACULTY OF CREATIVE ARTS";
  if (normalized.includes("languages and linguistics") || normalized.includes("fll")) return "FACULTY OF LANGUAGES AND LINGUISTICS";
  if (normalized.includes("sports and exercise") || normalized.includes("fses")) return "FACULTY OF SPORTS AND EXERCISE SCIENCES";
  if (normalized.includes("dentistry")) return "FACULTY OF DENTISTRY";
  if (normalized.includes("pharmacy")) return "FACULTY OF PHARMACY";
  if (normalized.includes("medicine")) return "FACULTY OF MEDICINE";
  if (normalized.includes("engineering")) return "FACULTY OF ENGINEERING";
  if (normalized.includes("education")) return "FACULTY OF EDUCATION";
  if (normalized.includes("science")) return "FACULTY OF SCIENCE";
  if (normalized.includes("law")) return "FACULTY OF LAW";
  return cleanText(value).toUpperCase();
}

/** Display form for a club name ("Faculty of Science Student Union"). */
const SMALL_WORDS = new Set(["of", "and", "the", "for", "in"]);
function facultyTitle(value) {
  return String(value ?? "")
    .toLowerCase()
    .split(" ")
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function descriptionFor(category) {
  const descriptions = {
    "Faculty Society": "Faculty-level academic student society at Universiti Malaya.",
    Social: "Social or cultural student group at Universiti Malaya.",
    Religious: "Religious student society at Universiti Malaya.",
    Development: "Student development or debate society at Universiti Malaya.",
    Entrepreneurship: "Student entrepreneurship group at Universiti Malaya.",
    Sports: "Sports and recreation student group at Universiti Malaya.",
    State: "State-based student association at Universiti Malaya.",
    "Residential College": "Residential college student body at Universiti Malaya.",
    Activism: "Student activism group at Universiti Malaya.",
    "Campus Politics": "Campus political student group at Universiti Malaya.",
    "National Politics": "National political party student wing at Universiti Malaya.",
    "Student Union": "Faculty-level student union under the Universiti Malaya Students' Union.",
    Cultural: "Cultural student society at Universiti Malaya.",
    Independent: "Independent student society at Universiti Malaya.",
    International: "International student association at Universiti Malaya.",
    Service: "Student volunteer or community-service group at Universiti Malaya."
  };
  return descriptions[category] ?? "Student club or society at Universiti Malaya.";
}

function uniqueAliases(name, aliases) {
  const nameKey = normalize(name);
  const seen = new Set();
  const result = [];
  for (const alias of aliases ?? []) {
    const text = cleanText(alias);
    const key = normalize(text);
    if (!text || !key || key === nameKey || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

async function fetchSheetTab(sheetId, tab, offline) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${tab.gid}`;
  const cacheFile = path.join(RAW_DIR, `sheet-${tab.gid}.json`);
  if (offline && fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json,text/plain,*/*",
          "accept-language": "en-US,en;q=0.9"
        },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      ensureDir(path.dirname(cacheFile));
      fs.writeFileSync(cacheFile, text, "utf8");
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    }
  }
  if (fs.existsSync(cacheFile)) {
    console.warn(`warning: using cached ${url} after fetch failed: ${lastError?.message ?? "unknown error"}`);
    return fs.readFileSync(cacheFile, "utf8");
  }
  throw new Error(`failed to fetch ${url}: ${lastError?.message ?? "unknown error"}`);
}

function parseSheetTab(tab, data, sheetId, report) {
  const rows = data.table.rows ?? [];
  const sourceUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?gid=${tab.gid}`;
  const entries = [];
  const push = (name, extra = {}) => {
    const cleaned = cleanText(name);
    if (!cleaned || HEADER_NAMES.has(normalize(cleaned))) return;
    const mappedCode = extra.code || CODE_BY_NAME.get(normalize(cleaned)) || null;
    entries.push({
      name: cleaned,
      aliases: [],
      category: tab.category,
      faculty: null,
      instagram: null,
      linkedin: null,
      sources: ["suara-siswa-2026"],
      sourceUrls: [sourceUrl],
      ...extra,
      code: extra.code || mappedCode || deriveCode(cleaned),
      explicitCode: Boolean(extra.code || mappedCode)
    });
  };

  if (tab.mode === "faculty-society") {
    let currentFaculty = null;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const facultyCell = cleanText(cellValue(row, tab.facultyColumn ?? 1));
      if (facultyCell && !HEADER_NAMES.has(normalize(facultyCell))) currentFaculty = facultyCell;
      const name = cleanText(cellValue(row, tab.nameColumn));
      if (!name || HEADER_NAMES.has(normalize(name))) continue;
      if (/Google Developer Group On Campus/i.test(name) && name.includes(",")) {
        const names = [
          "Google Developer Group On Campus Universiti Malaya",
          "Persatuan Komputer Universiti Malaya",
          "Data Analytics Club (UMDAC)"
        ];
        const instagrams = [
          extractInstagram(cellValue(row, tab.instagramColumn)),
          extractInstagram(cellValue(rows[index + 1], tab.instagramColumn)),
          extractInstagram(cellValue(rows[index + 2], tab.instagramColumn))
        ];
        names.forEach((item, offset) => {
          push(item, {
            faculty: canonicalFaculty(currentFaculty),
            instagram: instagrams[offset]
          });
        });
        index += 2;
        continue;
      }
      push(name, {
        faculty: canonicalFaculty(currentFaculty),
        instagram: extractInstagram(cellValue(row, tab.instagramColumn))
      });
    }
    return entries;
  }

  if (tab.mode === "state") {
    for (const row of rows) {
      const state = cleanText(cellValue(row, tab.nameColumn));
      if (!state || HEADER_NAMES.has(normalize(state))) continue;
      const mapped = STATE_MAP.get(normalize(state));
      if (!mapped) {
        report.unmappedStates.push(state);
        continue;
      }
      push(mapped.name, {
        code: mapped.code,
        category: "State",
        instagram: extractInstagram(cellValue(row, tab.instagramColumn))
      });
    }
    return entries;
  }

  if (tab.mode === "college") {
    for (const row of rows) {
      const raw = cleanText(cellValue(row, tab.nameColumn));
      const match = raw.match(/^KK\s*(\d+)$/i);
      if (!match) continue;
      const number = Number(match[1]);
      push(`Kolej Kediaman ${number} (KK${number})`, {
        code: `KK${number}`,
        category: "Residential College",
        instagram: extractInstagram(cellValue(row, tab.instagramColumn))
      });
    }
    return entries;
  }

  if (tab.mode === "faculty-union") {
    for (const row of rows) {
      const raw = cleanText(cellValue(row, tab.nameColumn));
      if (!raw || HEADER_NAMES.has(normalize(raw))) continue;
      const faculty = canonicalFaculty(raw);
      if (!faculty) continue;
      const code = UNION_CODES.get(normalize(faculty));
      if (!code) {
        report.unmappedUnions.push(raw);
        continue;
      }
      push(`${facultyTitle(faculty)} Student Union`, {
        code,
        category: "Student Union",
        faculty,
        instagram: extractInstagram(cellValue(row, tab.instagramColumn))
      });
    }
    return entries;
  }

  for (const row of rows) {
    const name = cleanText(cellValue(row, tab.nameColumn));
    if (!name || HEADER_NAMES.has(normalize(name))) continue;
    push(name, {
      instagram: extractInstagram(cellValue(row, tab.instagramColumn))
    });
  }
  return entries;
}

function mergeEntry(target, source) {
  if (source.name && normalize(source.name) !== normalize(target.name)) {
    target.aliases = [...new Set([...(target.aliases ?? []), source.name])];
  }
  target.aliases = [...new Set([...(target.aliases ?? []), ...(source.aliases ?? [])])];
  target.sources = [...new Set([...(target.sources ?? []), ...(source.sources ?? [])])];
  target.sourceUrls = [...new Set([...(target.sourceUrls ?? []), ...(source.sourceUrls ?? [])])];
  target.instagram = target.instagram || source.instagram || null;
  target.linkedin = target.linkedin || source.linkedin || null;
  target.faculty = target.faculty || source.faculty || null;
  target.category = target.category || source.category || "Independent";
}

function dedupeEntries(entries, report) {
  const byName = new Map();
  for (const entry of entries) {
    const key = normalize(entry.name);
    if (!key) continue;
    const existing = byName.get(key);
    if (existing) mergeEntry(existing, entry);
    else byName.set(key, entry);
  }

  const byExplicitCode = new Map();
  const result = [];
  for (const entry of byName.values()) {
    if (entry.explicitCode && entry.code) {
      const existing = byExplicitCode.get(entry.code);
      if (existing) {
        mergeEntry(existing, entry);
        report.mergedByCode.push({ code: entry.code, name: entry.name });
        continue;
      }
      byExplicitCode.set(entry.code, entry);
    }
    result.push(entry);
  }
  return result;
}

function applyOverrides(clubs) {
  for (const club of clubs) {
    const overrideName = NAME_BY_CODE.get(club.code);
    if (overrideName) {
      if (normalize(overrideName) !== normalize(club.name)) {
        club.aliases = [...new Set([...(club.aliases ?? []), club.name])];
      }
      club.name = overrideName;
    }
    const aliases = ALIASES_BY_CODE.get(club.code);
    if (aliases) club.aliases = [...new Set([...(club.aliases ?? []), ...aliases])];
    if (CATEGORY_BY_CODE.has(club.code)) club.category = CATEGORY_BY_CODE.get(club.code);
    if (FACULTY_BY_CODE.has(club.code)) club.faculty = FACULTY_BY_CODE.get(club.code);
    club.faculty = canonicalFaculty(club.faculty);
    club.description = club.description || descriptionFor(club.category);
    club.aliases = uniqueAliases(club.name, club.aliases);
    club.sources = [...new Set(club.sources ?? [])];
    club.sourceUrls = [...new Set(club.sourceUrls ?? [])];
  }
}

function assignUniqueCodes(clubs, report) {
  const used = new Set();
  for (const club of clubs) {
    let code = String(club.code || CODE_BY_NAME.get(normalize(club.name)) || deriveCode(club.name))
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 16);
    if (!code) code = "CLUB";
    let unique = code;
    let suffix = 2;
    while (used.has(unique)) {
      unique = `${code}-${suffix}`;
      suffix += 1;
      report.duplicateCodes.push({ name: club.name, original: code, assigned: unique });
    }
    used.add(unique);
    club.code = unique;
  }
}

function assignUniqueIds(clubs, report) {
  const used = new Set();
  for (const club of clubs) {
    const base = `ent_club_${slugify(club.code)}`;
    let unique = base;
    let suffix = 2;
    while (used.has(unique)) {
      unique = `${base}_${suffix}`;
      suffix += 1;
      report.duplicateIds.push({ name: club.name, original: base, assigned: unique });
    }
    used.add(unique);
    club.id = unique;
  }
}

function writeCsv(clubs, filePath) {
  const header = ["code", "name", "category", "faculty", "instagram", "linkedin", "aliases", "sources"];
  const lines = [header.join(",")];
  for (const club of clubs) {
    lines.push(
      [
        csvCell(club.code),
        csvCell(club.name),
        csvCell(club.category),
        csvCell(club.faculty),
        csvCell(club.instagram),
        csvCell(club.linkedin ? `https://www.linkedin.com/company/${club.linkedin}` : ""),
        csvCell((club.aliases ?? []).join("; ")),
        csvCell((club.sources ?? []).join("; "))
      ].join(",")
    );
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function writeSql(clubs, filePath) {
  const lines = [
    "-- Generated by scripts/mine-clubs.mjs. Do not edit by hand.",
    `-- Generated at ${new Date().toISOString()}. Source data: data/um_clubs.json.`,
    "",
    "DELETE FROM entities WHERE type = 'club' AND id LIKE 'ent_club_%';",
    "",
    "INSERT OR IGNORE INTO entities (id, type, code, name, faculty, category, description, metadata_json, active, created_at) VALUES"
  ];
  const rows = clubs.map((club) => {
    const metadata = JSON.stringify({
      sources: club.sources ?? [],
      sourceUrls: club.sourceUrls ?? [],
      aliases: club.aliases ?? [],
      instagram: club.instagram ?? null,
      linkedin: club.linkedin ? `https://www.linkedin.com/company/${club.linkedin}` : null,
      lastVerified: club.lastVerified ?? LAST_VERIFIED
    });
    return `  (${sqlString(club.id)}, 'club', ${sqlString(club.code)}, ${sqlString(club.name)}, ${sqlString(club.faculty)}, ${sqlString(club.category)}, ${sqlString(club.description)}, ${sqlString(metadata)}, 1, ${sqlString(CREATED_AT)})`;
  });
  lines.push(`${rows.join(",\n")};`);
  lines.push("");
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const offline = process.argv.includes("--offline");
  const sources = readJson(SOURCES_PATH);
  const sheetConfig = sources.suaraSiswa;
  const extrasFile = readJson(EXTRAS_PATH);
  const report = {
    generatedAt: new Date().toISOString(),
    lastVerified: LAST_VERIFIED,
    tabCounts: {},
    sheetRows: 0,
    sheetEntries: 0,
    extrasInput: 0,
    extrasKept: 0,
    extrasDropped: [],
    unmappedStates: [],
    unmappedUnions: [],
    mergedByCode: [],
    duplicateCodes: [],
    duplicateIds: [],
    counts: {}
  };

  const raw = {
    extractedAt: new Date().toISOString(),
    spreadsheetId: sheetConfig.spreadsheetId,
    tabs: []
  };

  let sheetEntries = [];
  for (const tab of sheetConfig.tabs) {
    const text = await fetchSheetTab(sheetConfig.spreadsheetId, tab, offline);
    const data = parseGviz(text);
    const entries = parseSheetTab(tab, data, sheetConfig.spreadsheetId, report);
    report.tabCounts[tab.name] = entries.length;
    report.sheetRows += entries.length;
    raw.tabs.push({ name: tab.name, gid: tab.gid, entries });
    sheetEntries = sheetEntries.concat(entries);
  }
  report.sheetEntries = sheetEntries.length;

  sheetEntries = dedupeEntries(sheetEntries, report);

  const extras = (extrasFile.clubs ?? []).map((club) => ({
    ...club,
    aliases: [...new Set(club.aliases ?? [])],
    category: club.category || "Independent",
    faculty: canonicalFaculty(club.faculty),
    instagram: club.instagram || null,
    linkedin: club.linkedin || null,
    sources: ["extras"],
    sourceUrls: [],
    lastVerified: LAST_VERIFIED,
    explicitCode: true
  }));
  report.extrasInput = extras.length;

  const keptExtras = [];
  for (const extra of extras) {
    if (!extra.instagram && !extra.linkedin) {
      report.extrasDropped.push({
        code: extra.code,
        name: extra.name,
        reason: "No Instagram or LinkedIn organisation page found"
      });
      continue;
    }
    keptExtras.push(extra);
  }
  report.extrasKept = keptExtras.length;

  let clubs = [...sheetEntries, ...keptExtras];
  clubs = dedupeEntries(clubs, report);
  applyOverrides(clubs);
  clubs.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  assignUniqueCodes(clubs, report);
  assignUniqueIds(clubs, report);

  for (const club of clubs) {
    club.lastVerified = LAST_VERIFIED;
    club.description = club.description || descriptionFor(club.category);
    club.aliases = uniqueAliases(club.name, club.aliases);
    club.sources = [...new Set(club.sources ?? [])];
    club.sourceUrls = [...new Set(club.sourceUrls ?? [])];
  }

  const categoryCounts = {};
  const sourceCounts = {};
  for (const club of clubs) {
    categoryCounts[club.category] = (categoryCounts[club.category] ?? 0) + 1;
    for (const source of club.sources) sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }
  report.counts = {
    total: clubs.length,
    byCategory: categoryCounts,
    bySource: sourceCounts
  };

  ensureDir(DATA_DIR);
  ensureDir(path.dirname(OUTPUT_SQL));
  fs.writeFileSync(
    OUTPUT_JSON,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), lastVerified: LAST_VERIFIED, clubs }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(OUTPUT_RAW, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(clubs, OUTPUT_CSV);
  writeSql(clubs, OUTPUT_SQL);

  console.log(`Total clubs: ${clubs.length}`);
  console.log(`Sheet entries: ${report.sheetEntries} -> ${sheetEntries.length} after dedupe`);
  console.log(`Extras: ${keptExtras.length} kept, ${report.extrasDropped.length} dropped`);
  console.log(`Categories: ${JSON.stringify(categoryCounts)}`);
  console.log(`Sources: ${JSON.stringify(sourceCounts)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_CSV)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_REPORT)}`);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_SQL)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
