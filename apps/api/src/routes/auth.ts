import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { InitSchema } from "@um-reviews/shared";
import type { AppEnv, UserRow } from "../env";
import { authMiddleware } from "../middleware";
import {
  decryptString,
  encryptString,
  hmacHex,
  randomBytes,
  randomId,
  sha256Base64Url,
  sha256Hex,
  toBase64Url
} from "../lib/crypto";
import { AppError } from "../lib/errors";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleConfigured,
  oauthEncryptionKey
} from "../lib/google";
import { callbackPage, clientIpHash, getBearerToken } from "../lib/http";
import { signSession, verifySession } from "../lib/jwt";
import { enforceRateLimit } from "../lib/rate-limit";
import { recomputeStats, toUserDto } from "../db/queries";
import { touchDailyActivity } from "../lib/activity";
import { validateInitData } from "../lib/telegram";

const auth = new Hono<AppEnv>();

interface OAuthStateRow {
  state_hash: string;
  user_id: string;
  code_verifier_enc: string;
  expires_at: string;
  used_at: string | null;
}

function adminTelegramIds(env: AppEnv["Bindings"]): string[] {
  return (env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function emailPepper(env: AppEnv["Bindings"]): string {
  const pepper = env.EMAIL_HMAC_PEPPER || (env.ENVIRONMENT === "production" ? "" : "dev-email-pepper-change-me");
  if (!pepper) throw new AppError(500, "EMAIL_HMAC_PEPPER is not configured", "SERVER_MISCONFIGURED");
  return pepper;
}

auth.post("/init", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = InitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const telegramUser = await validateInitData(parsed.data.initData, c.env.TELEGRAM_BOT_TOKEN || "");
  const pepper = c.env.JWT_SECRET || "dev-only-init-rate-limit";
  await enforceRateLimit(c.env.DB, `auth:init:ip:${clientIpHash(c, pepper)}`, 240, 3600);
  await enforceRateLimit(c.env.DB, `auth:init:tg:${telegramUser.id}`, 120, 3600);

  const now = new Date().toISOString();
  const isAdmin = adminTelegramIds(c.env).includes(String(telegramUser.id));
  const role = isAdmin ? "admin" : "student";

  let user = await c.env.DB.prepare(
    "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE telegram_id = ?"
  )
    .bind(telegramUser.id)
    .first<UserRow>();

  if (!user) {
    const id = randomId();
    await c.env.DB.prepare(
      "INSERT INTO users (id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at) VALUES (?, ?, ?, 'active', 1, ?, NULL, NULL)"
    )
      .bind(id, telegramUser.id, role, now)
      .run();
    user = await c.env.DB.prepare(
      "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE id = ?"
    )
      .bind(id)
      .first<UserRow>();
  } else {
    if (user.deleted_at) throw new AppError(403, "This account has been deleted", "ACCOUNT_DELETED");
    if (user.status !== "active") throw new AppError(403, "This account is not active", "ACCOUNT_INACTIVE");
    if (user.role !== role) {
      await c.env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(role, user.id).run();
      user.role = role;
    }
  }

  if (!user) throw new AppError(500, "Could not create user", "USER_CREATE_FAILED");
  // One row per user per day; the first open writes, later opens that day are a
  // primary-key lookup. This is the only write the statistics feature adds.
  await touchDailyActivity(c.env.DB, user.id);
  const token = await signSession(c.env, user);
  return c.json({ token, user: await toUserDto(c.env.DB, user) });
});

auth.post("/dev-init", async (c) => {
  if (c.env.ENVIRONMENT === "production" || c.env.DEV_AUTH_BYPASS !== "true") {
    throw new AppError(404, "Not found", "NOT_FOUND");
  }
  const now = new Date().toISOString();
  const id = randomId();
  const telegramId = -(Math.floor(Math.random() * 1_000_000_000) + 1_000_000_000);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users (id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at) VALUES (?, ?, 'admin', 'active', 1, ?, ?, NULL)"
    ).bind(id, telegramId, now, now),
    c.env.DB.prepare(
      "INSERT INTO identities (user_id, provider, provider_sub, email_hmac, verified_at) VALUES (?, 'dev', ?, NULL, ?)"
    ).bind(id, `dev:${id}`, now)
  ]);
  const user = await c.env.DB.prepare(
    "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE id = ?"
  )
    .bind(id)
    .first<UserRow>();
  if (!user) throw new AppError(500, "Could not create dev user", "USER_CREATE_FAILED");
  await touchDailyActivity(c.env.DB, user.id);
  const token = await signSession(c.env, user);
  return c.json({ token, user: await toUserDto(c.env.DB, user) });
});

auth.post("/dev-verify", authMiddleware, async (c) => {
  if (c.env.ENVIRONMENT === "production" || c.env.DEV_AUTH_BYPASS !== "true") {
    throw new AppError(404, "Not found", "NOT_FOUND");
  }
  const user = c.get("user");
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET verified_at = ? WHERE id = ?").bind(now, user.id),
    c.env.DB.prepare(
      "INSERT INTO identities (user_id, provider, provider_sub, email_hmac, verified_at) VALUES (?, 'dev', ?, NULL, ?) ON CONFLICT(user_id) DO UPDATE SET provider = 'dev', provider_sub = excluded.provider_sub, verified_at = excluded.verified_at"
    ).bind(user.id, `dev:${user.id}`, now)
  ]);
  const updated = await c.env.DB.prepare(
    "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first<UserRow>();
  if (!updated) throw new AppError(404, "User not found", "NO_USER");
  return c.json({ user: await toUserDto(c.env.DB, updated) });
});

auth.post("/dev-unverify", authMiddleware, async (c) => {
  if (c.env.ENVIRONMENT === "production" || c.env.DEV_AUTH_BYPASS !== "true") {
    throw new AppError(404, "Not found", "NOT_FOUND");
  }
  const user = c.get("user");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET verified_at = NULL WHERE id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM identities WHERE user_id = ?").bind(user.id)
  ]);
  const updated = await c.env.DB.prepare(
    "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE id = ?"
  )
    .bind(user.id)
    .first<UserRow>();
  if (!updated) throw new AppError(404, "User not found", "NO_USER");
  return c.json({ user: await toUserDto(c.env.DB, updated) });
});

auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  // Covers browser sessions that boot from a stored token instead of initData.
  await touchDailyActivity(c.env.DB, user.id);
  return c.json({ user: await toUserDto(c.env.DB, user) });
});

auth.delete("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  const now = new Date().toISOString();
  const targets = await c.env.DB.prepare(
    "SELECT DISTINCT target_type, target_id FROM reviews WHERE user_id = ? AND deleted_at IS NULL"
  )
    .bind(user.id)
    .all<{ target_type: string; target_id: string }>();

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE reviews SET status = 'deleted', deleted_at = ? WHERE user_id = ? AND deleted_at IS NULL").bind(now, user.id),
    c.env.DB.prepare("DELETE FROM identities WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM oauth_states WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare(
      "UPDATE users SET status = 'deleted', deleted_at = ?, verified_at = NULL, session_version = session_version + 1, telegram_id = ? WHERE id = ?"
    ).bind(now, -(Date.now() % 1_000_000_000) - 1, user.id)
  ]);

  for (const target of targets.results) {
    const type = target.target_type === "program" ? "program" : "course";
    await recomputeStats(c.env.DB, type, target.target_id);
  }

  return c.json({ ok: true });
});

auth.post("/google/start", authMiddleware, async (c) => {
  const user = c.get("user");
  await enforceRateLimit(c.env.DB, `oauth:start:${user.id}`, 30, 86400);
  if (!googleConfigured(c.env)) {
    throw new AppError(503, "Google OAuth is not configured yet", "OAUTH_NOT_CONFIGURED");
  }

  const state = toBase64Url(randomBytes(32));
  const verifier = toBase64Url(randomBytes(48));
  const challenge = await sha256Base64Url(verifier);
  const encryptedVerifier = await encryptString(verifier, oauthEncryptionKey(c.env));
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    "INSERT INTO oauth_states (state_hash, user_id, code_verifier_enc, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
  )
    .bind(await sha256Hex(state), user.id, encryptedVerifier, expires, now.toISOString())
    .run();

  return c.json({ authUrl: buildGoogleAuthUrl(c.env, state, challenge) });
});

auth.get("/google/callback", async (c) => {
  const error = c.req.query("error");
  const code = c.req.query("code");
  const state = c.req.query("state");
  const botUsername = c.env.BOT_USERNAME;
  const webAppUrl = c.env.WEB_APP_URL;

  if (error) {
    return c.html(
      callbackPage({
        title: "Verification cancelled",
        message: "Google sign-in was cancelled. You can return to the app and try again.",
        botUsername,
        webAppUrl
      }),
      400
    );
  }

  if (!code || !state) {
    return c.html(
      callbackPage({
        title: "Verification failed",
        message: "The verification response was incomplete. Please return to the app and try again.",
        botUsername,
        webAppUrl
      }),
      400
    );
  }

  try {
    const stateHash = await sha256Hex(state);
    const row = await c.env.DB.prepare(
      "SELECT state_hash, user_id, code_verifier_enc, expires_at, used_at FROM oauth_states WHERE state_hash = ?"
    )
      .bind(stateHash)
      .first<OAuthStateRow>();

    if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) {
      throw new AppError(400, "This verification link has expired. Please start again from the app.", "OAUTH_STATE_INVALID");
    }

    await c.env.DB.prepare("UPDATE oauth_states SET used_at = ? WHERE state_hash = ?").bind(new Date().toISOString(), stateHash).run();

    const account = await c.env.DB.prepare(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND status = 'active'"
    )
      .bind(row.user_id)
      .first<{ id: string }>();
    if (!account) throw new AppError(403, "This account is no longer active", "ACCOUNT_INACTIVE");

    const verifier = await decryptString(row.code_verifier_enc, oauthEncryptionKey(c.env));
    const identity = await exchangeGoogleCode(c.env, code, verifier);
    const emailHmac = await hmacHex(new TextEncoder().encode(emailPepper(c.env)), new TextEncoder().encode(identity.email));

    const existing = await c.env.DB.prepare(
      "SELECT user_id FROM identities WHERE provider_sub = ? OR email_hmac = ? LIMIT 1"
    )
      .bind(identity.sub, emailHmac)
      .first<{ user_id: string }>();

    if (existing && existing.user_id !== row.user_id) {
      throw new AppError(
        409,
        "This SiswaMail account is already linked to another Telegram account. Contact support if this is a mistake.",
        "EMAIL_ALREADY_LINKED"
      );
    }

    const now = new Date().toISOString();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO identities (user_id, provider, provider_sub, email_hmac, verified_at) VALUES (?, 'google', ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET provider = 'google', provider_sub = excluded.provider_sub, email_hmac = excluded.email_hmac, verified_at = excluded.verified_at"
      ).bind(row.user_id, identity.sub, emailHmac, now),
      c.env.DB.prepare("UPDATE users SET verified_at = ? WHERE id = ?").bind(now, row.user_id)
    ]);

    const bot = botUsername?.replace(/^@/, "");
    if (bot) return c.redirect(`https://t.me/${bot}?startapp=verified`);
    if (webAppUrl) return c.redirect(`${webAppUrl}${webAppUrl.includes("?") ? "&" : "?"}verified=1`);

    return c.html(
      callbackPage({
        title: "Verified",
        message: "Your SiswaMail account is now linked. Return to the app to continue.",
        botUsername,
        webAppUrl
      })
    );
  } catch (caught) {
    const message = caught instanceof AppError ? caught.message : "Verification could not be completed. Please try again.";
    return c.html(
      callbackPage({
        title: "Verification failed",
        message,
        botUsername,
        webAppUrl
      }),
      (caught instanceof AppError ? caught.status : 500) as ContentfulStatusCode
    );
  }
});

auth.get("/session", async (c) => {
  const token = getBearerToken(c);
  if (!token) return c.json({ valid: false });
  try {
    const payload = await verifySession(c.env, token);
    return c.json({ valid: true, userId: payload.sub });
  } catch {
    return c.json({ valid: false });
  }
});

export default auth;
