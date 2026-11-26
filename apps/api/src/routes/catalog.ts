import { Hono } from "hono";
import { PROGRAM_LEVELS, TARGET_TYPES, type TargetType } from "@um-reviews/shared";
import type { AppEnv, UserRow } from "../env";
import { optionalAuthMiddleware } from "../middleware";
import {
  getCategories,
  getCourseDetail,
  getEntityDetail,
  getFaculties,
  getProgramDetail,
  listCourses,
  listEntities,
  listPrograms
} from "../db/queries";

const catalog = new Hono<AppEnv>();

function clampPage(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(500, Math.floor(parsed));
}

function parseSort(value: string | undefined): "newest" | "helpful" {
  return value === "helpful" ? "helpful" : "newest";
}

catalog.get("/courses", async (c) => {
  const query = (c.req.query("q") || "").trim().slice(0, 100);
  const faculty = (c.req.query("faculty") || "").trim().slice(0, 160);
  return c.json({ courses: await listCourses(c.env.DB, query, faculty) });
});

catalog.get("/courses/:code", optionalAuthMiddleware, async (c) => {
  const viewerUser = c.get("user") as UserRow | undefined;
  const viewer = viewerUser ? { id: viewerUser.id, role: viewerUser.role } : null;
  const detail = await getCourseDetail(
    c.env.DB,
    c.req.param("code"),
    clampPage(c.req.query("page")),
    viewer,
    parseSort(c.req.query("sort")),
    (c.req.query("semester") || "").trim().slice(0, 32)
  );
  if (!detail) return c.json({ error: "Course not found", code: "NOT_FOUND" }, 404);
  return c.json({ course: detail });
});

catalog.get("/programs", async (c) => {
  const query = (c.req.query("q") || "").trim().slice(0, 100);
  const faculty = (c.req.query("faculty") || "").trim().slice(0, 160);
  const levelParam = (c.req.query("level") || "").trim().toLowerCase();
  const level = PROGRAM_LEVELS.includes(levelParam as (typeof PROGRAM_LEVELS)[number]) ? levelParam : "";
  return c.json({ programs: await listPrograms(c.env.DB, query, faculty, level) });
});

catalog.get("/programs/:code", optionalAuthMiddleware, async (c) => {
  const viewer = (c.get("user") as UserRow | undefined)?.id ?? null;
  const detail = await getProgramDetail(
    c.env.DB,
    c.req.param("code"),
    clampPage(c.req.query("page")),
    viewer,
    parseSort(c.req.query("sort"))
  );
  if (!detail) return c.json({ error: "Program not found", code: "NOT_FOUND" }, 404);
  return c.json({ program: detail });
});

catalog.get("/faculties", async (c) => {
  // Short cache only. A long one kept a stale (duplicated) list alive in the
  // Telegram webview after the data was canonicalised. The server-side isolate
  // cache already prevents repeat D1 scans.
  c.header("Cache-Control", "public, max-age=60, must-revalidate");
  return c.json({ faculties: await getFaculties(c.env.DB) });
});

catalog.get("/categories", async (c) => {
  const type = (c.req.query("type") || "club").trim();
  if (!TARGET_TYPES.includes(type as TargetType)) {
    return c.json({ error: "Unknown review type", code: "BAD_TYPE" }, 400);
  }
  return c.json({ categories: await getCategories(c.env.DB, type as TargetType) });
});

catalog.get("/entities", async (c) => {
  const type = (c.req.query("type") || "club").trim();
  if (!TARGET_TYPES.includes(type as TargetType)) {
    return c.json({ error: "Unknown review type", code: "BAD_TYPE" }, 400);
  }
  const query = (c.req.query("q") || "").trim().slice(0, 100);
  const faculty = (c.req.query("faculty") || "").trim().slice(0, 160);
  const category = (c.req.query("category") || "").trim().slice(0, 80);
  return c.json({ entities: await listEntities(c.env.DB, type as TargetType, query, faculty, category) });
});

catalog.get("/entities/:type/:code", optionalAuthMiddleware, async (c) => {
  const type = c.req.param("type");
  if (!TARGET_TYPES.includes(type as TargetType)) {
    return c.json({ error: "Unknown review type", code: "BAD_TYPE" }, 400);
  }
  const viewer = (c.get("user") as UserRow | undefined)?.id ?? null;
  const detail = await getEntityDetail(
    c.env.DB,
    type as TargetType,
    c.req.param("code"),
    clampPage(c.req.query("page")),
    viewer,
    parseSort(c.req.query("sort"))
  );
  if (!detail) return c.json({ error: "Entry not found", code: "NOT_FOUND" }, 404);
  return c.json({ entity: detail });
});

export default catalog;
