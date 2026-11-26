import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getDimensions, toDimensionDto } from "../db/queries";
import { FLAG_LABELS } from "../lib/moderation";
import { googleConfigured } from "../lib/google";

const meta = new Hono<AppEnv>();

meta.get("/config", (c) => {
  // User-independent and only changes on deploy, so let the browser reuse it.
  c.header("Cache-Control", "public, max-age=600");
  return c.json({
    environment: c.env.ENVIRONMENT,
    devBypass: c.env.ENVIRONMENT !== "production" && c.env.DEV_AUTH_BYPASS === "true",
    googleEnabled: googleConfigured(c.env),
    botUsername: c.env.BOT_USERNAME || "",
    webAppUrl: c.env.WEB_APP_URL || ""
  });
});

meta.get("/dimensions", async (c) => {
  const rows = await getDimensions(c.env.DB);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({
    dimensions: rows.map(toDimensionDto),
    flags: FLAG_LABELS
  });
});

export default meta;
