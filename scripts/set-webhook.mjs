import fs from "node:fs";
import path from "node:path";

function parseVars(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    vars[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return vars;
}

const devVarsPath = path.resolve("apps/api/.dev.vars");
const vars = fs.existsSync(devVarsPath) ? parseVars(fs.readFileSync(devVarsPath, "utf8")) : {};
const token = process.env.TELEGRAM_BOT_TOKEN || vars.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || vars.TELEGRAM_WEBHOOK_SECRET || "";
const url = process.argv[2] || process.env.WEBHOOK_URL;

if (!token || !url) {
  console.error("Usage: node scripts/set-webhook.mjs https://your-worker.workers.dev/telegram/webhook");
  console.error("Set TELEGRAM_BOT_TOKEN in apps/api/.dev.vars or the environment first.");
  process.exit(1);
}

if (!url.startsWith("https://")) {
  console.error("Telegram requires an HTTPS webhook URL.");
  process.exit(1);
}

const payload = {
  url,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: false
};
if (secret) payload.secret_token = secret;

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload)
});

const body = await response.json();
console.log(JSON.stringify(body, null, 2));
if (!response.ok || !body.ok) process.exit(1);
