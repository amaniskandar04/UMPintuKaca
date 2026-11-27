import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./env";
import { AppError } from "./lib/errors";
import { handleTelegramUpdate } from "./bot";
import { cleanup } from "./cleanup";
import { drainBroadcastQueue } from "./lib/broadcast";
import auth from "./routes/auth";
import catalog from "./routes/catalog";
import meta from "./routes/meta";
import rewards from "./routes/rewards";
import reviews from "./routes/reviews";
import admin from "./routes/admin";
import qa from "./routes/qa";

const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
});

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = String(c.env.WEB_ORIGIN || "")
        .split(",")
        .map((value: string) => value.trim().replace(/\/$/, ""))
        .filter(Boolean);
      if (!origin) return undefined;
      if (allowed.includes(origin)) return origin;
      if (c.env.ENVIRONMENT !== "production" && origin.startsWith("http://localhost:")) return origin;
      return undefined;
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400
  })
);

app.onError((error, c) => {
  if (error instanceof AppError) {
    return c.json({ error: error.message, code: error.code }, error.status as 500);
  }

  // Log one structured line per unhandled error. Cloudflare captures this via
  // `wrangler tail` and the dashboard, and the cf-ray lets a user report be
  // matched back to the exact request.
  const ray = c.req.header("cf-ray") ?? null;
  let path = c.req.path;
  try {
    path = new URL(c.req.url).pathname;
  } catch {
    // keep c.req.path
  }
  console.error(
    JSON.stringify({
      level: "error",
      ray,
      method: c.req.method,
      path,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join("\n") : undefined
    })
  );

  // Surface the ray to the client so it can be quoted in a bug report.
  return c.json({ error: "Internal server error", ...(ray ? { ray } : {}) }, 500);
});

app.get("/", (c) => c.json({ name: "UM Reviews API", ok: true }));
app.get("/api/health", (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }));

app.route("/api/auth", auth);
app.route("/api/reviews", reviews);
app.route("/api/rewards", rewards);
app.route("/api/admin", admin);
app.route("/api", catalog);
app.route("/api", meta);
app.route("/api", qa);

app.post("/telegram/webhook", async (c) => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && c.req.header("x-telegram-bot-api-secret-token") !== secret) {
    return c.json({ ok: false }, 401);
  }
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ ok: false, error: "Bot is not configured" }, 503);
  }
  const update = await c.req.json().catch(() => null);
  if (!update) return c.json({ ok: false }, 400);
  await handleTelegramUpdate(c.env, update);
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  scheduled: async (controller: ScheduledController, env: AppEnv["Bindings"], ctx: ExecutionContext) => {
    // The nightly trigger does housekeeping; every other tick drains the
    // broadcast outbox in small batches.
    ctx.waitUntil(controller.cron === "0 3 * * *" ? cleanup(env) : drainBroadcastQueue(env));
  }
};
