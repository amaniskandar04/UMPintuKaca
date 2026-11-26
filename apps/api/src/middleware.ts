import { createMiddleware } from "hono/factory";
import type { AppEnv, UserRow } from "./env";
import { AppError } from "./lib/errors";
import { getBearerToken } from "./lib/http";
import { verifySession } from "./lib/jwt";

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = getBearerToken(c);
  if (!token) throw new AppError(401, "Missing session token", "NO_TOKEN");

  let subject: string;
  let version: number;
  try {
    const payload = await verifySession(c.env, token);
    subject = payload.sub;
    version = payload.ver;
  } catch {
    throw new AppError(401, "Session is invalid or expired", "BAD_TOKEN");
  }

  const user = await c.env.DB.prepare(
    "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE id = ?"
  )
    .bind(subject)
    .first<UserRow>();

  if (!user || user.deleted_at) throw new AppError(401, "Session is no longer valid", "NO_USER");
  if (user.status !== "active") throw new AppError(403, "This account is not active", "ACCOUNT_INACTIVE");
  if (Number(version) !== user.session_version) throw new AppError(401, "Session has been revoked", "SESSION_REVOKED");

  c.set("user", user);
  await next();
});

export const optionalAuthMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = getBearerToken(c);
  if (!token) {
    await next();
    return;
  }
  try {
    const payload = await verifySession(c.env, token);
    const user = await c.env.DB.prepare(
      "SELECT id, telegram_id, role, status, session_version, created_at, verified_at, deleted_at FROM users WHERE id = ?"
    )
      .bind(payload.sub)
      .first<UserRow>();
    if (
      user &&
      !user.deleted_at &&
      user.status === "active" &&
      Number(payload.ver) === user.session_version
    ) {
      c.set("user", user);
    }
  } catch {
    await next();
    return;
  }
  await next();
});

export const requireVerified = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user?.verified_at) {
    throw new AppError(403, "Verify your SiswaMail account before reviewing", "NOT_VERIFIED");
  }
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") throw new AppError(403, "Admin access required", "NOT_ADMIN");
  await next();
});
