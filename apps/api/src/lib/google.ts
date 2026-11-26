import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../env";
import { AppError } from "./errors";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleIdentity {
  sub: string;
  email: string;
  hostedDomain: string | null;
}

export function googleConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

export function oauthEncryptionKey(env: Env): string {
  const key = env.OAUTH_ENC_KEY || (env.ENVIRONMENT === "production" ? "" : env.JWT_SECRET || "dev-oauth-encryption-key");
  if (!key) throw new AppError(500, "OAUTH_ENC_KEY is not configured", "OAUTH_NOT_CONFIGURED");
  return key;
}

export function allowedEmailDomains(env: Env): string[] {
  return (env.ALLOWED_EMAIL_DOMAINS || "siswa.um.edu.my")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function buildGoogleAuthUrl(env: Env, state: string, codeChallenge: string): string {
  if (!googleConfigured(env)) throw new AppError(503, "Google OAuth is not configured", "OAUTH_NOT_CONFIGURED");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  const domain = allowedEmailDomains(env)[0];
  if (domain) url.searchParams.set("hd", domain);
  return url.toString();
}

export async function exchangeGoogleCode(env: Env, code: string, codeVerifier: string): Promise<GoogleIdentity> {
  if (!googleConfigured(env)) throw new AppError(503, "Google OAuth is not configured", "OAUTH_NOT_CONFIGURED");
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    client_secret: env.GOOGLE_CLIENT_SECRET!,
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: env.GOOGLE_REDIRECT_URI!
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  const payload = (await response.json()) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.id_token) {
    throw new AppError(
      502,
      payload.error_description || payload.error || "Google did not return an identity token",
      "OAUTH_EXCHANGE_FAILED"
    );
  }

  let verified: Awaited<ReturnType<typeof jwtVerify>>;
  try {
    verified = await jwtVerify(payload.id_token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID!
    });
  } catch {
    throw new AppError(502, "Google identity token could not be verified", "OAUTH_TOKEN_INVALID");
  }

  const claims = verified.payload as typeof verified.payload & {
    email?: string;
    email_verified?: boolean;
    hd?: string;
  };

  if (!claims.email || (claims.email_verified !== true && String(claims.email_verified) !== "true")) {
    throw new AppError(403, "Your Google account email is not verified", "EMAIL_NOT_VERIFIED");
  }

  const domain = claims.email.split("@")[1]?.toLowerCase() ?? "";
  const allowed = allowedEmailDomains(env);
  if (!allowed.includes(domain)) {
    throw new AppError(403, `Only ${allowed.join(", ")} accounts can verify`, "EMAIL_DOMAIN_NOT_ALLOWED");
  }
  if (claims.hd && !allowed.includes(claims.hd.toLowerCase())) {
    throw new AppError(403, "This Google Workspace domain is not allowed", "EMAIL_DOMAIN_NOT_ALLOWED");
  }
  if (!claims.sub) throw new AppError(502, "Google identity is missing a subject", "OAUTH_TOKEN_INVALID");

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    hostedDomain: claims.hd?.toLowerCase() ?? null
  };
}
