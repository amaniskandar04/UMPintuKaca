import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = "https://cloud.timeedit.net/my_um/web/students/";
const args = process.argv.slice(2);

function getArg(name) {
  const prefix = `--${name}=`;
  const hit = args.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const OUT_PATH = path.resolve(ROOT, getArg("out") ?? "data/timeedit_catalog_raw.json");
const PAGE_SIZE = Math.max(1, Number(getArg("page-size") ?? 100));
const CONCURRENCY = Math.max(1, Number(getArg("concurrency") ?? 8));
const MAX_ITEMS = Math.max(1, Number(getArg("max") ?? 40000));
const START_AT = Math.max(0, Number(getArg("start") ?? 0));
const RESUME = hasFlag("resume");
const REQUEST_TIMEOUT_MS = Number(getArg("timeout") ?? 30000);

const AUTH_HELP = [
  "TimeEdit rejected the request because the session is not authenticated.",
  "Open https://cloud.timeedit.net/my_um/web/students/ in a browser, log in with your UM account,",
  "then copy the full Cookie request header from DevTools > Network (any request to cloud.timeedit.net)",
  "and either set TIMEEDIT_COOKIE, pass --cookie=\"...\", or save it to .timeedit-cookie."
].join(" ");

class AuthError extends Error {}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveCookie() {
  const direct = getArg("cookie");
  if (direct) return direct.trim().replace(/^Cookie:\s*/i, "");
  const cookieFile = getArg("cookie-file") ?? process.env.TIMEEDIT_COOKIE_FILE ?? ".timeedit-cookie";
  const cookiePath = path.resolve(ROOT, cookieFile);
  if (fs.existsSync(cookiePath)) {
    const text = fs.readFileSync(cookiePath, "utf8").trim();
    if (text) return text.replace(/^Cookie:\s*/i, "").split(/\r?\n/).join("; ");
  }
  const env = process.env.TIMEEDIT_COOKIE;
  return env ? env.trim().replace(/^Cookie:\s*/i, "") : null;
}

const cookie = resolveCookie();
if (!cookie) {
  console.error(AUTH_HELP);
  process.exit(1);
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: BASE_URL,
  Origin: "https://cloud.timeedit.net",
  "X-Requested-With": "XMLHttpRequest",
  Cookie: cookie
};

async function request(url) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 401 || response.status === 403 || response.status === 412) throw new AuthError(AUTH_HELP);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      lastError = error;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error(`Request failed: ${url}`);
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeHtml(match[1]).trim() : null;
}

function parseObjects(html) {
  const tags = html.match(/<[^>]*\bdata-idonly\s*=\s*["'][^"']+["'][^>]*>/gi) ?? [];
  const objects = [];
  for (const tag of tags) {
    const idOnly = attr(tag, "data-idonly");
    if (!idOnly) continue;
    objects.push({
      id: attr(tag, "data-id"),
      idOnly,
      type: attr(tag, "data-type"),
      name: attr(tag, "data-name")
    });
  }
  return objects;
}

function parseCount(html) {
  const match = html.match(/class=["'][^"']*searchResultCount[^"']*["'][^>]*>([\s\S]*?)</i);
  if (!match) return null;
  const count = Number(match[1].replace(/\D/g, ""));
  return Number.isFinite(count) ? count : null;
}

async function fetchObjectsPage(start) {
  const url = `${BASE_URL}objects.html?max=${PAGE_SIZE}&fr=t&partajax=t&im=f&sid=4&l=en_US&objects=&types=15&part=t&media=html&start=${start}`;
  const response = await request(url);
  if (!response.ok) throw new Error(`objects.html returned HTTP ${response.status}`);
  const html = await response.text();
  if (html.includes('id="loginmessage"') || html.includes('name="loginForm"')) throw new AuthError(AUTH_HELP);
  return { objects: parseObjects(html), count: parseCount(html) };
}

async function fetchDetails(idOnly) {
  const url = `${BASE_URL}objects/${encodeURIComponent(idOnly)}/o.json?fr=t&types=15&sid=5&l=en_US`;
  try {
    const response = await request(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if (error instanceof AuthError) throw error;
    return null;
  }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function loadExisting() {
  if (!RESUME || !fs.existsSync(OUT_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

function buildRaw(results, countHint) {
  const typeTally = {};
  const yearPeriods = {};
  for (const item of results) {
    const type = item.type ?? "unknown";
    typeTally[type] = (typeTally[type] ?? 0) + 1;
    const periods = String(item.details?.["Year + Period"] ?? "").trim() || "(none)";
    yearPeriods[periods] = (yearPeriods[periods] ?? 0) + 1;
  }
  return {
    meta: {
      source: "cloud.timeedit.net/my_um/web/students (TimeEdit)",
      extractedAt: new Date().toISOString(),
      enumerated: results.length,
      countHint,
      typeTally,
      yearPeriods
    },
    results
  };
}

function writeRaw(results, countHint) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(buildRaw(results, countHint), null, 2)}\n`, "utf8");
}

async function main() {
  const existing = loadExisting();
  const seen = new Set(existing.map((item) => item.idOnly));
  const results = [...existing];
  let countHint = null;
  let start = START_AT;
  let page = 0;

  while (results.length < MAX_ITEMS) {
    const { objects, count } = await fetchObjectsPage(start);
    if (count !== null) countHint = count;
    if (objects.length === 0) {
      if (page === 0 && results.length === 0) {
        throw new Error("TimeEdit returned no objects. The session cookie may be invalid or the catalogue may be empty.");
      }
      break;
    }
    page += 1;

    const fresh = objects.filter((object) => !seen.has(object.idOnly));
    fresh.forEach((object) => seen.add(object.idOnly));

    const detailed = await mapPool(fresh, CONCURRENCY, async (object) => ({
      ...object,
      details: await fetchDetails(object.idOnly)
    }));
    results.push(...detailed);

    const end = start + objects.length;
    console.log(`Fetched ${results.length} objects (page ${page}, range ${start + 1}-${end}${countHint ? ` of ${countHint}` : ""})`);

    if (page % 5 === 0) writeRaw(results, countHint);

    if (countHint !== null && end >= Math.min(countHint, MAX_ITEMS)) break;
    if (objects.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  writeRaw(results, countHint);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} with ${results.length} objects`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
