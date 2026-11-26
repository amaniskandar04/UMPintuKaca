import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const apiDir = path.join(root, "apps", "api");
const webDir = path.join(root, "apps", "web");
const wranglerBin = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const dryRun = process.argv.includes("--dry-run");
const envArg = process.argv.find((value) => value.startsWith("--env="));
const envPath = envArg ? path.resolve(root, envArg.slice("--env=".length)) : path.join(root, "deploy.env");

const SECRET_KEYS = [
  "JWT_SECRET",
  "TELEGRAM_WEBHOOK_SECRET",
  "OAUTH_ENC_KEY",
  "EMAIL_HMAC_PEPPER",
  "ALIAS_PEPPER"
];

const PROVIDED_SECRET_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "JWT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "OAUTH_ENC_KEY",
  "EMAIL_HMAC_PEPPER",
  "ALIAS_PEPPER"
];

function clean(value) {
  if (value === undefined) return "";
  let result = String(value).trim();
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1);
  }
  return result;
}

function parseEnvFile(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    vars[trimmed.slice(0, index).trim()] = clean(trimmed.slice(index + 1));
  }
  return vars;
}

function persistVar(key, value) {
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const pattern = new RegExp(`^${key}=.*$`, "m");
  let next;
  if (pattern.test(current)) {
    next = current.replace(pattern, () => `${key}=${value}`);
  } else {
    next = `${current}${current.endsWith("\n") || current === "" ? "" : "\n"}${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, next, "utf8");
}

function generateSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function randomSuffix(length = 4) {
  return crypto.randomBytes(length).toString("hex");
}

function requireValues(vars, keys) {
  const missing = keys.filter((key) => !clean(vars[key]));
  if (missing.length > 0) {
    console.error("Missing values in deploy.env:");
    for (const key of missing) console.error(`  - ${key}`);
    console.error("\nCopy deploy.env.example to deploy.env and fill in the values.");
    process.exit(1);
  }
}

function assertName(value, label) {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(value)) {
    console.error(`${label} must be 3-63 characters of lowercase letters, numbers, or hyphens.`);
    process.exit(1);
  }
}

function assertD1Name(value, label) {
  if (!/^[a-z0-9_][a-z0-9_-]{1,61}[a-z0-9_]$/.test(value)) {
    console.error(`${label} must be 3-63 characters of lowercase letters, numbers, underscores, or hyphens.`);
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n> ${printable}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env: { ...process.env, ...options.env },
    stdio: options.stdio || "inherit",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    if (options.stdio === "pipe") {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`Command failed: ${printable}`);
  }
  return result.stdout || "";
}

function wrangler(args, options = {}) {
  return run(process.execPath, [wranglerBin, ...args], {
    ...options,
    env: {
      CLOUDFLARE_API_TOKEN: options.token,
      CLOUDFLARE_ACCOUNT_ID: options.accountId,
      WRANGLER_SEND_METRICS: "false",
      ...options.env
    }
  });
}

async function cf(pathname, token, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const details = payload?.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") || response.statusText;
    const error = new Error(`Cloudflare API failed (${pathname}): ${details}`);
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

async function getAccountId(token, vars) {
  if (clean(vars.CLOUDFLARE_ACCOUNT_ID)) return clean(vars.CLOUDFLARE_ACCOUNT_ID);
  const accounts = await cf("/accounts", token);
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("No Cloudflare accounts found for this token.");
  if (accounts.length > 1) {
    console.error("Multiple Cloudflare accounts found. Set CLOUDFLARE_ACCOUNT_ID in deploy.env:");
    for (const account of accounts) console.error(`  - ${account.name} (${account.id})`);
    process.exit(1);
  }
  persistVar("CLOUDFLARE_ACCOUNT_ID", accounts[0].id);
  return accounts[0].id;
}

async function getWorkersSubdomain(token, accountId, vars) {
  try {
    const result = await cf(`/accounts/${accountId}/workers/subdomain`, token);
    if (result?.subdomain) return result.subdomain;
  } catch {
    void 0;
  }

  if (clean(vars.CLOUDFLARE_WORKERS_SUBDOMAIN)) {
    const requested = clean(vars.CLOUDFLARE_WORKERS_SUBDOMAIN);
    await cf(`/accounts/${accountId}/workers/subdomain`, token, {
      method: "PUT",
      body: JSON.stringify({ subdomain: requested })
    });
    return requested;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = `um-reviews-${randomSuffix(3)}`;
    try {
      await cf(`/accounts/${accountId}/workers/subdomain`, token, {
        method: "PUT",
        body: JSON.stringify({ subdomain: candidate })
      });
      persistVar("CLOUDFLARE_WORKERS_SUBDOMAIN", candidate);
      return candidate;
    } catch {
      void 0;
    }
  }
  throw new Error("Could not create a workers.dev subdomain. Set CLOUDFLARE_WORKERS_SUBDOMAIN in deploy.env and rerun.");
}

async function ensureD1(token, accountId, vars) {
  const dbName = clean(vars.D1_DATABASE_NAME) || "um_reviews";
  const location = clean(vars.D1_LOCATION) || "apac";
  const databases = await cf(`/accounts/${accountId}/d1/database`, token);
  const existing = Array.isArray(databases) ? databases.find((database) => database.name === dbName) : null;
  if (existing) {
    console.log(`Using existing D1 database: ${dbName} (${existing.uuid})`);
    return { name: dbName, id: existing.uuid };
  }

  try {
    const created = await cf(`/accounts/${accountId}/d1/database`, token, {
      method: "POST",
      body: JSON.stringify({ name: dbName, primary_location_hint: location })
    });
    console.log(`Created D1 database: ${dbName} (${created.uuid})`);
    return { name: dbName, id: created.uuid };
  } catch (error) {
    if (error.status !== 400) throw error;
    const created = await cf(`/accounts/${accountId}/d1/database`, token, {
      method: "POST",
      body: JSON.stringify({ name: dbName })
    });
    console.log(`Created D1 database: ${dbName} (${created.uuid})`);
    return { name: dbName, id: created.uuid };
  }
}

async function ensurePagesProject(token, accountId, vars) {
  const requested = clean(vars.CLOUDFLARE_PAGES_PROJECT) || "um-reviews";
  const projects = await cf(`/accounts/${accountId}/pages/projects`, token);
  const existing = Array.isArray(projects) ? projects.find((project) => project.name === requested) : null;
  if (existing) {
    const subdomain = existing.subdomain || `${requested}.pages.dev`;
    console.log(`Using existing Pages project: ${requested} (${subdomain})`);
    return { name: requested, subdomain };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const name = attempt === 0 ? requested : `${requested}-${randomSuffix(2)}`;
    try {
      const created = await cf(`/accounts/${accountId}/pages/projects`, token, {
        method: "POST",
        body: JSON.stringify({ name, production_branch: "main" })
      });
      const subdomain = created.subdomain || `${name}.pages.dev`;
      if (attempt > 0) persistVar("CLOUDFLARE_PAGES_PROJECT", name);
      console.log(`Created Pages project: ${name} (${subdomain})`);
      return { name, subdomain };
    } catch (error) {
      if (attempt === 2) throw error;
      if (clean(vars.CLOUDFLARE_PAGES_PROJECT)) throw error;
      console.log(`Pages project name "${name}" is unavailable, trying another.`);
    }
  }
  throw new Error("Could not create a Pages project.");
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function patchWranglerConfig(databaseName, databaseId, workerName) {
  const configPath = path.join(apiDir, "wrangler.toml");
  let text = fs.readFileSync(configPath, "utf8");
  text = text.replace(/^name\s*=\s*".*"$/m, `name = ${tomlString(workerName)}`);
  text = text.replace(/^database_name\s*=\s*".*"$/m, `database_name = ${tomlString(databaseName)}`);
  text = text.replace(/^database_id\s*=\s*".*"$/m, `database_id = ${tomlString(databaseId)}`);
  fs.writeFileSync(configPath, text, "utf8");
}

function writeProductionConfig(options) {
  const content = `name = ${tomlString(options.workerName)}
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = true

[[d1_databases]]
binding = "DB"
database_name = ${tomlString(options.databaseName)}
database_id = ${tomlString(options.databaseId)}
migrations_dir = "migrations"

[triggers]
crons = ["0 3 * * *"]

[vars]
ENVIRONMENT = "production"
WEB_ORIGIN = ${tomlString(options.pagesUrl)}
WEB_APP_URL = ${tomlString(options.pagesUrl)}
BOT_USERNAME = ${tomlString(options.botUsername)}
GOOGLE_REDIRECT_URI = ${tomlString(options.googleRedirectUri)}
ADMIN_TELEGRAM_IDS = ${tomlString(options.adminIds)}
ALLOWED_EMAIL_DOMAINS = ${tomlString(options.allowedDomains)}
AUTO_HIDE_REPORT_THRESHOLD = ${tomlString(options.reportThreshold)}
`;
  const configPath = path.join(apiDir, "wrangler.production.toml");
  fs.writeFileSync(configPath, content, "utf8");
  return configPath;
}

function writeSecretsFile(vars) {
  const secretsPath = path.join(apiDir, ".secrets.production.dev.vars");
  const lines = PROVIDED_SECRET_KEYS.map((key) => `${key}=${clean(vars[key])}`);
  fs.writeFileSync(secretsPath, `${lines.join("\n")}\n`, "utf8");
  return secretsPath;
}

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) {
    throw new Error(`Telegram ${method} failed: ${payload?.description || response.statusText}`);
  }
  return payload.result;
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error(`Missing ${envPath}.`);
    console.error("Copy deploy.env.example to deploy.env and fill in the values, then rerun.");
    process.exit(1);
  }

  const vars = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  vars.TELEGRAM_BOT_USERNAME = clean(vars.TELEGRAM_BOT_USERNAME).replace(/^@/, "");

  requireValues(vars, [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_USERNAME",
    "TELEGRAM_ADMIN_IDS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  ]);

  if (!/^\d+(,\d+)*$/.test(clean(vars.TELEGRAM_ADMIN_IDS))) {
    console.error("TELEGRAM_ADMIN_IDS must be one or more numeric Telegram IDs, comma-separated.");
    process.exit(1);
  }

  for (const key of SECRET_KEYS) {
    if (!clean(vars[key])) {
      vars[key] = generateSecret();
      if (!dryRun) persistVar(key, vars[key]);
      console.log(`Generated ${key}${dryRun ? " (dry run)" : ""}.`);
    }
  }

  const workerName = clean(vars.CLOUDFLARE_WORKER_NAME) || "um-reviews-api";
  const pagesProject = clean(vars.CLOUDFLARE_PAGES_PROJECT) || "um-reviews";
  const dbName = clean(vars.D1_DATABASE_NAME) || "um_reviews";
  assertName(workerName, "CLOUDFLARE_WORKER_NAME");
  assertName(pagesProject, "CLOUDFLARE_PAGES_PROJECT");
  assertD1Name(dbName, "D1_DATABASE_NAME");

  const allowedDomains = clean(vars.ALLOWED_EMAIL_DOMAINS) || "siswa.um.edu.my";
  const reportThreshold = clean(vars.AUTO_HIDE_REPORT_THRESHOLD) || "3";
  const adminIds = clean(vars.TELEGRAM_ADMIN_IDS).replace(/\s+/g, "");
  const botUsername = clean(vars.TELEGRAM_BOT_USERNAME);

  if (dryRun) {
    const workerUrl = `https://${workerName}.example.workers.dev`;
    const pagesUrl = `https://${pagesProject}.pages.dev`;
    console.log("\nDry run configuration:");
    console.log(`  Worker: ${workerName}`);
    console.log(`  Worker URL (example): ${workerUrl}`);
    console.log(`  Pages project: ${pagesProject}`);
    console.log(`  Pages URL (example): ${pagesUrl}`);
    console.log(`  Database: ${dbName}`);
    console.log(`  Bot: @${botUsername}`);
    console.log(`  Admins: ${adminIds}`);
    console.log(`  Google redirect: ${workerUrl}/api/auth/google/callback`);
    console.log("\nDry run complete. No Cloudflare or Telegram changes were made.");
    return;
  }

  const token = clean(vars.CLOUDFLARE_API_TOKEN);
  const accountId = await getAccountId(token, vars);
  const workersSubdomain = await getWorkersSubdomain(token, accountId, vars);
  const database = await ensureD1(token, accountId, vars);
  const pages = await ensurePagesProject(token, accountId, vars);

  const workerUrl = `https://${workerName}.${workersSubdomain}.workers.dev`;
  const pagesUrl = `https://${pages.subdomain.replace(/^https?:\/\//, "")}`;
  const googleRedirectUri = `${workerUrl}/api/auth/google/callback`;

  console.log(`\nAccount: ${accountId}`);
  console.log(`Worker URL: ${workerUrl}`);
  console.log(`Pages URL: ${pagesUrl}`);
  console.log(`Google redirect URI: ${googleRedirectUri}`);

  patchWranglerConfig(database.name, database.id, workerName);
  const productionConfig = writeProductionConfig({
    workerName,
    databaseName: database.name,
    databaseId: database.id,
    pagesUrl,
    botUsername,
    googleRedirectUri,
    adminIds,
    allowedDomains,
    reportThreshold
  });

  run(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(root, "packages", "shared", "tsconfig.json")], {
    cwd: root
  });

  wrangler(["deploy", "-c", path.basename(productionConfig)], {
    cwd: apiDir,
    token,
    accountId
  });

  const secretsPath = writeSecretsFile(vars);
  try {
    wrangler(["secret", "bulk", path.basename(secretsPath)], {
      cwd: apiDir,
      token,
      accountId,
      stdio: "pipe"
    });
    console.log("Uploaded Worker secrets.");
  } finally {
    fs.rmSync(secretsPath, { force: true });
  }

  wrangler(["deploy", "-c", path.basename(productionConfig)], {
    cwd: apiDir,
    token,
    accountId
  });

  wrangler(["d1", "migrations", "apply", database.name, "--remote"], {
    cwd: apiDir,
    token,
    accountId
  });

  wrangler(["d1", "execute", database.name, "--remote", "--file=seed/seed.sql", "--yes"], {
    cwd: apiDir,
    token,
    accountId
  });

  wrangler(["d1", "execute", database.name, "--remote", "--file=seed/courses_s2.seed.sql", "--yes"], {
    cwd: apiDir,
    token,
    accountId
  });

  wrangler(["d1", "execute", database.name, "--remote", "--file=seed/programs.seed.sql", "--yes"], {
    cwd: apiDir,
    token,
    accountId
  });

  wrangler(["d1", "execute", database.name, "--remote", "--file=seed/clubs.seed.sql", "--yes"], {
    cwd: apiDir,
    token,
    accountId
  });

  wrangler(["d1", "execute", database.name, "--remote", "--file=seed/places.seed.sql", "--yes"], {
    cwd: apiDir,
    token,
    accountId
  });

  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) throw new Error("Vite is not installed. Run npm install first.");
  run(process.execPath, [viteBin, "build"], {
    cwd: webDir,
    env: { VITE_API_BASE_URL: workerUrl }
  });

  wrangler(
    [
      "pages",
      "deploy",
      "dist",
      "--project-name",
      pages.name,
      "--branch",
      "main",
      "--commit-dirty"
    ],
    {
      cwd: webDir,
      token,
      accountId
    }
  );

  const botToken = clean(vars.TELEGRAM_BOT_TOKEN);
  const webhookSecret = clean(vars.TELEGRAM_WEBHOOK_SECRET);

  await telegram(botToken, "setWebhook", {
    url: `${workerUrl}/telegram/webhook`,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false
  });
  console.log("Telegram webhook set.");

  await telegram(botToken, "setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "UM Reviews",
      web_app: { url: pagesUrl }
    }
  });
  console.log("Telegram menu button set.");

  await telegram(botToken, "setMyCommands", {
    commands: [
      { command: "start", description: "Open UM Reviews" },
      { command: "app", description: "Open the review app" },
      { command: "myreviews", description: "Open your reviews" },
      { command: "rewards", description: "Open your points and badges" },
      { command: "help", description: "Show help" },
      { command: "privacy", description: "How anonymity works" },
      { command: "guidelines", description: "Community guidelines" },
      { command: "report", description: "How to report a review" },
      { command: "deleteaccount", description: "Delete your account" }
    ]
  });
  console.log("Telegram commands set.");

  await telegram(botToken, "setMyShortDescription", {
    short_description: "Anonymous course, programme, and club reviews for UM students."
  });
  await telegram(botToken, "setMyDescription", {
    description:
      "Verify once with SiswaMail, then review courses, degree programmes, and clubs anonymously. Earn helpful badges and levels. Reviews are student opinions. Not affiliated with Universiti Malaya."
  });

  const outputs = {
    workerUrl,
    pagesUrl,
    googleRedirectUri,
    webhookUrl: `${workerUrl}/telegram/webhook`,
    databaseName: database.name,
    databaseId: database.id,
    pagesProject: pages.name,
    botUsername
  };
  fs.writeFileSync(path.join(root, "deploy.outputs.json"), `${JSON.stringify(outputs, null, 2)}\n`, "utf8");

  console.log("\nDeployment complete.");
  console.log(`Mini App: ${pagesUrl}`);
  console.log(`API: ${workerUrl}`);
  console.log(`\nFinal manual step: add this exact redirect URI to your Google OAuth web client:\n  ${googleRedirectUri}`);
  console.log("\nThen open Telegram, send /start to @" + botUsername + ", and verify with your SiswaMail account.");
}

main().catch((error) => {
  console.error(`\nDeployment failed: ${error.message}`);
  process.exit(1);
});
