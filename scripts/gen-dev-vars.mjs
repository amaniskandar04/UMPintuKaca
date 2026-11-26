import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const target = path.resolve("apps/api/.dev.vars");
const example = path.resolve("apps/api/.dev.vars.example");
const force = process.argv.includes("--force");

if (fs.existsSync(target) && !force) {
  console.log("apps/api/.dev.vars already exists. Use --force to overwrite it.");
  process.exit(0);
}

if (!fs.existsSync(example)) {
  console.error("apps/api/.dev.vars.example is missing.");
  process.exit(1);
}

function secret() {
  return crypto.randomBytes(32).toString("base64url");
}

const replacements = {
  JWT_SECRET: secret(),
  TELEGRAM_WEBHOOK_SECRET: secret(),
  EMAIL_HMAC_PEPPER: secret(),
  ALIAS_PEPPER: secret(),
  OAUTH_ENC_KEY: secret()
};

if (process.env.TELEGRAM_BOT_TOKEN) replacements.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const lines = fs.readFileSync(example, "utf8").split(/\r?\n/).map((line) => {
  const index = line.indexOf("=");
  if (index === -1) return line;
  const key = line.slice(0, index).trim();
  if (Object.prototype.hasOwnProperty.call(replacements, key)) {
    return `${key}=${replacements[key]}`;
  }
  return line;
});

fs.writeFileSync(target, `${lines.join("\n").trimEnd()}\n`, "utf8");
console.log("Created apps/api/.dev.vars with generated local secrets.");
console.log("Next: add TELEGRAM_BOT_TOKEN and Google OAuth credentials.");
