import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const BASE = "https://cloud.timeedit.net/my_um/web/students/";
const SEARCH_URL = `${BASE}ri1Q8.html`;
const PROFILE_DIR = path.join(DATA_DIR, ".timeedit-profile");
const COOKIE_PATH = path.join(ROOT, ".timeedit-cookie");
const STATUS_PATH = path.join(DATA_DIR, ".sdk-scrape-status.json");
const STATE_PATH = path.join(DATA_DIR, ".sdk-events-state.json");
const EVENTS_PATH = path.join(DATA_DIR, "timeedit_events_2026.json");
const CATALOG_PATH = path.join(DATA_DIR, "timeedit_s1_2026_2027_raw.json");

const args = process.argv.slice(2);
function getArg(name) {
  const prefix = `--${name}=`;
  const hit = args.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const MODE = hasFlag("cookie-only") ? "cookie" : "scrape";
const LIMIT = Number(getArg("limit") ?? 0);
const BATCH_SIZE = Math.max(1, Number(getArg("batch") ?? 10));
const CHUNK_SIZE = Math.max(1, Number(getArg("chunk") ?? 100));
const FETCH_CONCURRENCY = Math.max(1, Number(getArg("concurrency") ?? 8));
const LOGIN_TIMEOUT_MS = Number(getArg("login-timeout") ?? 1800000);
const KEEP_OPEN = hasFlag("keep-open");
const CONNECT = getArg("connect");
const CHROME_PATH_ARG = getArg("chrome");
const RESET = hasFlag("reset");

const WINDOWS = {
  s2_2025_2026: {
    p: "20260201-20260731",
    start: Date.UTC(2026, 1, 1),
    end: Date.UTC(2026, 6, 31),
    display: "25/26, Semester 2",
    label: "s2_2025_2026"
  },
  s1_2026_2027: {
    p: "20260801-20270228",
    start: Date.UTC(2026, 7, 1),
    end: Date.UTC(2027, 1, 28),
    display: "26/27, Semester 1",
    label: "s1_2026_2027"
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(phase, message, extra = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const status = { phase, message, updatedAt: new Date().toISOString(), ...extra };
  fs.writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  console.log(`[${phase}] ${message}`);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function resolveChrome() {
  if (CHROME_PATH_ARG) return path.resolve(CHROME_PATH_ARG);
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    path.join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.ProgramFiles ?? "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft/Edge/Application/msedge.exe")
  ];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error("Chrome/Edge not found. Pass --chrome=<path>.");
  return found;
}

async function launchBrowser() {
  const chromePath = resolveChrome();
  setStatus("launch", `Launching Chrome: ${chromePath}`);
  return puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    args: [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=Translate",
      "--start-maximized"
    ]
  });
}

async function pickPage(browser) {
  const pages = await browser.pages();
  const target = pages.find((page) => page.url().includes("cloud.timeedit.net/my_um")) ?? pages[0] ?? (await browser.newPage());
  if (!target.url().includes("cloud.timeedit.net/my_um")) {
    await target.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  } else if (!target.url().includes("ri1Q")) {
    await target.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }
  return target;
}

async function isLoggedIn(page) {
  try {
    return await page.evaluate(() => {
      const text = document.body ? document.body.innerText : "";
      const logoutLink = Boolean(document.querySelector("#logoutbutton")) ||
        [...document.querySelectorAll("a,button")].some((el) => /log out/i.test(el.innerText || el.value || ""));
      const hasEmail = /@(siswa\d*|um)\.edu\.my/i.test(text) || Boolean(document.querySelector("#changetimezone"));
      return { url: location.href, loggedOut: logoutLink || hasEmail, hasLoginForm: /sign in|log in|login/i.test(text) && !logoutLink };
    });
  } catch {
    return null;
  }
}

async function ensureLoggedIn(page) {
  setStatus("login", "Chrome is open. Log in at cloud.timeedit.net (UM SSO). Waiting for the session...");
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await isLoggedIn(page);
    if (last?.loggedOut) {
      setStatus("authed", "Logged in.");
      return;
    }
    await sleep(2000);
  }
  throw new Error(`Login timed out. Last state: ${JSON.stringify(last)}`);
}

function loadCatalog() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const results = Array.isArray(raw.results) ? raw.results : [];
  const itemsById = new Map();
  const byCode = new Map();
  for (const item of results) {
    const idOnly = String(item.idOnly ?? "").trim();
    if (!idOnly) continue;
    itemsById.set(idOnly, item);
    const details = item.details ?? {};
    const code = cleanCode(details["Module Code"]);
    if (!code) continue;
    if (!byCode.has(code)) {
      byCode.set(code, {
        idOnly,
        code,
        name: cleanText(details["English Description"] || details["Malay Description"] || item.name),
        periods: cleanText(details["Year + Period"]).split(",").map((value) => value.trim()).filter(Boolean)
      });
    }
  }
  return { itemsById, modules: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)) };
}

function loadState() {
  if (!RESET && fs.existsSync(STATE_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
      state.hits ??= {};
      state.windows ??= {};
      for (const key of Object.keys(WINDOWS)) {
        state.windows[key] ??= { done: {} };
        state.windows[key].done ??= {};
      }
      return state;
    } catch {
      // fall through
    }
  }
  const fresh = { hits: {}, windows: {} };
  for (const key of Object.keys(WINDOWS)) fresh.windows[key] = { done: {} };
  return fresh;
}

async function fetchChunk(page, specs, windowConfig) {
  try {
    return await page.evaluate(
      async ({ batches, p, start, end, concurrency }) => {
        const parse = (value) => {
          const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value || "");
          return match ? Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
        };
        async function fetchOne(batch) {
          const query = new URLSearchParams({ h: "f", sid: "3", p, objects: batch.ids.join(","), ox: "0", types: "0", fe: "0", h2: "f", l: "en_EN" });
          const res = await new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "ri.json?" + query.toString(), true);
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            xhr.timeout = 30000;
            xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || "" });
            xhr.onerror = () => resolve({ status: -1, text: "" });
            xhr.ontimeout = () => resolve({ status: -2, text: "" });
            xhr.send();
          });
          if (res.status !== 200) return { status: res.status, bytes: res.text.length };
          let json;
          try { json = JSON.parse(res.text); } catch (error) { return { status: 200, parseError: true, bytes: res.text.length }; }
          const reservations = Array.isArray(json.reservations) ? json.reservations : [];
          const codeSet = new Set(batch.codes);
          const hits = {};
          for (const reservation of reservations) {
            const dates = [parse(reservation.startdate), parse(reservation.enddate)].filter((value) => value !== null);
            if (dates.length === 0) continue;
            const min = Math.min(...dates);
            const max = Math.max(...dates);
            if (max < start || min > end) continue;
            const found = new Set();
            for (const column of (reservation.columns || [])) {
              for (const token of String(column).split(",")) {
                const code = token.trim().split("/")[0].toUpperCase();
                if (codeSet.has(code)) found.add(code);
              }
            }
            for (const code of found) {
              if (!hits[code]) hits[code] = { count: 0, first: min, last: max };
              const entry = hits[code];
              entry.count += 1;
              if (min < entry.first) entry.first = min;
              if (max > entry.last) entry.last = max;
            }
          }
          return { status: 200, bytes: res.text.length, reservations: reservations.length, hits };
        }
        const results = new Array(batches.length);
        let cursor = 0;
        async function worker() {
          while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= batches.length) return;
            results[index] = await fetchOne(batches[index]);
          }
        }
        await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
        return results;
      },
      { batches: specs, p: windowConfig.p, start: windowConfig.start, end: windowConfig.end, concurrency: FETCH_CONCURRENCY }
    );
  } catch (error) {
    return specs.map(() => ({ status: -3, error: String(error) }));
  }
}

async function reloadAndReady(page) {
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(() => {
      const text = document.body ? document.body.innerText : "";
      const logout = Boolean(document.querySelector("#logoutbutton")) ||
        [...document.querySelectorAll("a,button")].some((el) => /log out/i.test(el.innerText || el.value || ""));
      return location.href.includes("cloud.timeedit.net/my_um") && (logout || /@(siswa\d*|um)\.edu\.my/i.test(text));
    }).catch(() => false);
    if (ready) {
      await sleep(75);
      return;
    }
    await sleep(200);
  }
}

function mergeHits(state, windowKey, batchHits) {
  for (const [code, entry] of Object.entries(batchHits || {})) {
    if (!state.hits[code]) state.hits[code] = { windows: {}, first: null, last: null, events: 0 };
    const target = state.hits[code];
    target.windows[windowKey] = true;
    target.events += entry.count;
    if (target.first === null || entry.first < target.first) target.first = entry.first;
    if (target.last === null || entry.last > target.last) target.last = entry.last;
  }
}

async function scrape(page, catalog) {
  const state = loadState();
  const modules = catalog.modules;
  const batches = [];
  for (let index = 0; index < modules.length; index += BATCH_SIZE) batches.push(modules.slice(index, index + BATCH_SIZE));
  const maxBatches = LIMIT > 0 ? Math.min(batches.length, Math.ceil(LIMIT / BATCH_SIZE)) : batches.length;

  let totalRequests = 0;
  const startedAt = Date.now();

  for (const [windowKey, windowConfig] of Object.entries(WINDOWS)) {
    const done = state.windows[windowKey].done;
    let processed = 0;

    for (let chunkStart = 0; chunkStart < maxBatches; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(maxBatches, chunkStart + CHUNK_SIZE);
      let queue = [];
      for (let index = chunkStart; index < chunkEnd; index += 1) {
        if (done[`b${index}`]) processed += 1;
        else queue.push({ index, batch: batches[index] });
      }

      let round = 0;
      while (queue.length > 0) {
        const specs = queue.map((item) => ({
          ids: item.batch.map((module) => module.idOnly),
          codes: item.batch.map((module) => module.code)
        }));
        const results = await fetchChunk(page, specs, windowConfig);
        totalRequests += specs.length;

        const failed = [];
        results.forEach((result, position) => {
          const item = queue[position];
          if (result && result.status === 200 && !result.parseError) {
            mergeHits(state, windowKey, result.hits);
            done[`b${item.index}`] = true;
            processed += 1;
          } else {
            failed.push(item);
          }
        });

        if (failed.length === 0) {
          queue = [];
          break;
        }

        round += 1;
        const statuses = [...new Set(results.filter((result) => result && result.status !== 200).map((result) => result.status))];
        setStatus("retry", `${windowKey}: ${failed.length} batch(es) failed (${JSON.stringify(statuses)}), reloading (round ${round})`);
        await reloadAndReady(page);
        if (round >= 2) await ensureLoggedIn(page).catch(() => {});
        if (round > 5) throw new Error(`${failed.length} batches for ${windowKey} kept failing. Log in again in Chrome and rerun.`);
        queue = failed;
      }

      writeJson(STATE_PATH, state);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      setStatus("scrape", `${windowKey}: ${processed}/${maxBatches} batches, ${Object.keys(state.hits).length} modules with events, ${elapsed}s`, {
        window: windowKey,
        processed,
        total: maxBatches,
        modulesWithEvents: Object.keys(state.hits).length,
        requests: totalRequests
      });
    }
  }
  writeJson(STATE_PATH, state);
  return { state, totalRequests, elapsed: ((Date.now() - startedAt) / 1000).toFixed(0) };
}

function canonicalFaculty(value) {
  const faculty = cleanText(value);
  const map = {
    "ASIA EUROPE INSTITUTE": "ASIA-EUROPE INSTITUTE",
    "FACULTY OF SPORTS AND EXERCISE SCIENCE": "FACULTY OF SPORTS AND EXERCISE SCIENCES"
  };
  return map[faculty] ?? faculty;
}

function buildSubjects(catalog, state) {
  const s2 = [];
  const s1 = [];
  const combined = [];

  function subjectFor(module, extra) {
    const item = catalog.itemsById.get(module.idOnly);
    const details = item?.details ?? {};
    const levelDescription = cleanText(details["Level Description"]);
    return {
      code: module.code,
      name: module.name,
      faculty: canonicalFaculty(details["Faculty Description"] || "UNIVERSITY"),
      faculty_code: cleanText(details.Faculty) || null,
      department_code: cleanText(details["Department (DPT) Code"]).replace(/-/g, "") || null,
      level: /^BACHELOR$/i.test(levelDescription) ? "undergraduate" : "postgraduate",
      level_description: levelDescription || null,
      credits: Number.isFinite(Number(details.Credit)) ? Number(details.Credit) : null,
      module_type: cleanText(details["Module Type (MOT) Code"]) || null,
      timeedit_id: item?.id ?? null,
      timeedit_idonly: module.idOnly,
      ...extra
    };
  }

  for (const module of catalog.modules) {
    const event = state.hits[module.code];
    const fromEventsS2 = Boolean(event?.windows?.s2_2025_2026);
    const fromEventsS1 = Boolean(event?.windows?.s1_2026_2027);
    const fromMetaS2 = module.periods.includes("2025/S2");
    const fromMetaS1 = module.periods.includes("2026/S1");
    const inS2 = fromEventsS2 || fromMetaS2;
    const inS1 = fromEventsS1 || fromMetaS1;
    if (!inS2 && !inS1) continue;

    const eventFirst = event?.first ? new Date(event.first).toISOString().slice(0, 10) : null;
    const eventLast = event?.last ? new Date(event.last).toISOString().slice(0, 10) : null;

    if (inS2) {
      s2.push(subjectFor(module, {
        semester: "2025/2026-S2",
        displaySemester: "25/26, Semester 2",
        source: fromEventsS2 ? "events" : "metadata",
        eventCount: event?.events ?? 0,
        firstEvent: eventFirst,
        lastEvent: eventLast
      }));
    }
    if (inS1) {
      s1.push(subjectFor(module, {
        semester: "2026/2027-S1",
        displaySemester: "26/27, Semester 1",
        source: fromEventsS1 ? "events" : "metadata",
        eventCount: event?.events ?? 0,
        firstEvent: eventFirst,
        lastEvent: eventLast
      }));
    }
    combined.push({
      ...subjectFor(module, {}),
      semesters: [...(inS2 ? ["25/26, Semester 2"] : []), ...(inS1 ? ["26/27, Semester 1"] : [])],
      periods: [...(inS2 ? ["2025/S2"] : []), ...(inS1 ? ["2026/S1"] : [])],
      eventCount: event?.events ?? 0,
      firstEvent: eventFirst,
      lastEvent: eventLast
    });
  }

  s2.sort((a, b) => a.code.localeCompare(b.code));
  s1.sort((a, b) => a.code.localeCompare(b.code));
  combined.sort((a, b) => a.code.localeCompare(b.code));
  return { s2, s1, combined };
}

function writeOutputs(catalog, state, meta) {
  const { s2, s1, combined } = buildSubjects(catalog, state);

  writeJson(path.join(DATA_DIR, "um_s2_2025_2026_subjects_events.json"), s2);
  writeJson(path.join(DATA_DIR, "um_s1_2026_2027_subjects_events.json"), s1);
  writeJson(path.join(DATA_DIR, "um_subjects_2026_events.json"), combined);

  const perHeader = ["code", "name", "faculty", "level", "credits", "faculty_code", "department_code", "module_type", "source", "eventCount", "firstEvent", "lastEvent"];
  const perRow = (subject) => [subject.code, subject.name, subject.faculty, subject.level, subject.credits, subject.faculty_code, subject.department_code, subject.module_type, subject.source, subject.eventCount, subject.firstEvent, subject.lastEvent];
  writeCsv(path.join(DATA_DIR, "um_s2_2025_2026_subjects_events.csv"), perHeader, s2.map(perRow));
  writeCsv(path.join(DATA_DIR, "um_s1_2026_2027_subjects_events.csv"), perHeader, s1.map(perRow));
  writeCsv(
    path.join(DATA_DIR, "um_subjects_2026_events.csv"),
    ["code", "name", "faculty", "level", "credits", "faculty_code", "department_code", "module_type", "semesters", "periods", "eventCount", "firstEvent", "lastEvent"],
    combined.map((subject) => [subject.code, subject.name, subject.faculty, subject.level, subject.credits, subject.faculty_code, subject.department_code, subject.module_type, subject.semesters.join("; "), subject.periods.join("; "), subject.eventCount, subject.firstEvent, subject.lastEvent])
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    source: "cloud.timeedit.net/my_um/web/students (TimeEdit ri.json inside authenticated viewer)",
    windows: Object.fromEntries(Object.entries(WINDOWS).map(([key, value]) => [key, { p: value.p, display: value.display }])),
    catalogModules: catalog.modules.length,
    modulesWithEvents: Object.keys(state.hits).length,
    s2_2025_2026: {
      total: s2.length,
      fromEvents: s2.filter((subject) => subject.source === "events").length,
      fromMetadata: s2.filter((subject) => subject.source === "metadata").length
    },
    s1_2026_2027: {
      total: s1.length,
      fromEvents: s1.filter((subject) => subject.source === "events").length,
      fromMetadata: s1.filter((subject) => subject.source === "metadata").length
    },
    combined: combined.length,
    ...meta
  };
  writeJson(path.join(DATA_DIR, "um_subjects_2026_events_summary.json"), summary);
  writeJson(EVENTS_PATH, { generatedAt: summary.generatedAt, windows: summary.windows, hits: state.hits });
  return summary;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  setStatus("start", `Starting (${CONNECT ? "connect" : "launch"})`);

  const browser = CONNECT
    ? await puppeteer.connect({ browserWSEndpoint: CONNECT, defaultViewport: null })
    : await launchBrowser();
  const owned = !CONNECT;

  try {
    const page = await pickPage(browser);
    await page.bringToFront().catch(() => {});
    await ensureLoggedIn(page);
    if (MODE === "cookie") {
      const cdp = await page.target().createCDPSession();
      const { cookies } = await cdp.send("Network.getAllCookies").catch(() => ({ cookies: [] }));
      const relevant = cookies.filter((cookie) => {
        const domain = String(cookie.domain ?? "").replace(/^\./, "");
        return domain === "timeedit.net" || domain.endsWith(".timeedit.net");
      });
      fs.writeFileSync(COOKIE_PATH, relevant.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "));
      setStatus("done", "Saved .timeedit-cookie");
      return;
    }

    await reloadAndReady(page);
    const catalog = loadCatalog();
    setStatus("scrape", `Scraping ${catalog.modules.length} modules in batches of ${BATCH_SIZE} for 2 semesters`, { modules: catalog.modules.length, batch: BATCH_SIZE });
    const { state, totalRequests, elapsed } = await scrape(page, catalog);
    const summary = writeOutputs(catalog, state, { requests: totalRequests, elapsedSeconds: Number(elapsed) });
    setStatus("done", `Done. S2=${summary.s2_2025_2026.total}, S1=${summary.s1_2026_2027.total}, combined=${summary.combined}`, summary);
  } finally {
    if (owned && !KEEP_OPEN) await browser.close().catch(() => {});
    else if (!owned) browser.disconnect();
  }
}

main().catch((error) => {
  setStatus("error", error.message ?? String(error));
  console.error(error.stack ?? error.message);
  process.exit(1);
});
