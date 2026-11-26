import { SignJWT, jwtVerify } from "jose";
import type { Env, UserRow } from "../env";

export interface SessionPayload {
  sub: string;
  role: string;
  ver: number;
}

function sessionKey(env: Env): Uint8Array {
  const value = env.JWT_SECRET || (env.ENVIRONMENT === "production" ? "" : "dev-only-insecure-jwt-secret-change-me");
  if (!value || value.length < 16) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export async function signSession(env: Env, user: UserRow): Promise<string> {
  return new SignJWT({ role: user.role, ver: user.session_version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(sessionKey(env));
}

export async function verifySession(env: Env, token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, sessionKey(env));
  if (!payload.sub) throw new Error("Missing subject");
  return {
    sub: payload.sub,
    role: String(payload.role ?? "student"),
    ver: Number(payload.ver ?? 0)
  };
}
