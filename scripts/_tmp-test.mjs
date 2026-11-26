import fs from "node:fs";
import puppeteer from "puppeteer-core";

const CATALOG = JSON.parse(fs.readFileSync("data/timeedit_s1_2026_2027_raw.json", "utf8")).results;
const byCode = new Map();
for (const item of CATALOG) {
  const details = item.details ?? {};
  const code = String(details["Module Code"] ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code && !byCode.has(code)) byCode.set(code, { code, id: String(item.idOnly) });
}
const first = [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)).slice(0, 10);
const specs = [
  { ids: ["37091"], codes: ["WIX1002"] },
  { ids: ["34988"], codes: ["WID3001"] },
  { ids: first.map((m) => m.id), codes: first.map((m) => m.code) }
];

const browser = await puppeteer.connect({ browserWSEndpoint: process.argv[2], defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("cloud.timeedit.net/my_um")) ?? pages[0];
await page.goto("https://cloud.timeedit.net/my_um/web/students/ri1Q8.html", { waitUntil: "domcontentloaded", timeout: 60000 });
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  const ready = await page.evaluate(() => Boolean(document.querySelector("#logoutbutton")) || [...document.querySelectorAll("a,button")].some((el) => /log out/i.test(el.innerText || ""))).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 200));
}
console.log("first codes:", first.map((m) => m.code).join(","));

const result = await page.evaluate(async ({ specs, p, start, end }) => {
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
      xhr.send();
    });
    if (res.status !== 200) return { status: res.status, bytes: res.text.length, body: res.text.slice(0, 100) };
    let json;
    try { json = JSON.parse(res.text); } catch (error) { return { status: 200, parseError: true, bytes: res.text.length, head: res.text.slice(0, 120) }; }
    const reservations = Array.isArray(json.reservations) ? json.reservations : [];
    const codeSet = new Set(batch.codes);
    const hits = {};
    const samples = [];
    for (const reservation of reservations) {
      const dates = [parse(reservation.startdate), parse(reservation.enddate)].filter((v) => v !== null);
      const min = dates.length ? Math.min(...dates) : null;
      const max = dates.length ? Math.max(...dates) : null;
      const found = new Set();
      for (const column of (reservation.columns || [])) {
        for (const token of String(column).split(",")) {
          const code = token.trim().split("/")[0].toUpperCase();
          if (codeSet.has(code)) found.add(code);
        }
      }
      if (samples.length < 2) samples.push({ startdate: reservation.startdate, columns: (reservation.columns || []).slice(0, 3) });
      if (min === null || max < start || min > end) continue;
      for (const code of found) {
        if (!hits[code]) hits[code] = { count: 0, first: min, last: max };
        hits[code].count += 1;
        if (min < hits[code].first) hits[code].first = min;
        if (max > hits[code].last) hits[code].last = max;
      }
    }
    return { status: 200, bytes: res.text.length, reservations: reservations.length, hits, samples };
  }
  const out = [];
  for (const batch of specs) out.push(await fetchOne(batch));
  return out;
}, { specs, p: "20260801-20270228", start: Date.UTC(2026, 7, 1), end: Date.UTC(2027, 1, 28) });

console.log(JSON.stringify(result, null, 2));
browser.disconnect();
