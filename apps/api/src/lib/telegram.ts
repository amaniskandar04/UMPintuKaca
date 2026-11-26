import { hmacSha256, timingSafeEqual, toHex } from "./crypto";
import { AppError } from "./errors";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export async function validateInitData(initData: string, botToken: string): Promise<TelegramUser> {
  if (!botToken) throw new AppError(500, "Telegram bot token is not configured", "BOT_NOT_CONFIGURED");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new AppError(401, "Missing initData signature", "INIT_DATA_INVALID");
  params.delete("hash");

  const pairs: [string, string][] = [];
  params.forEach((value, key) => pairs.push([key, value]));
  pairs.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");

  const encoder = new TextEncoder();
  const secret = await hmacSha256(encoder.encode("WebAppData"), encoder.encode(botToken));
  const expected = toHex(await hmacSha256(secret, encoder.encode(dataCheckString)));
  if (!timingSafeEqual(hash.toLowerCase(), expected)) {
    throw new AppError(401, "Invalid initData signature", "INIT_DATA_INVALID");
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || now - authDate > 86400 || authDate > now + 300) {
    throw new AppError(401, "initData has expired", "INIT_DATA_EXPIRED");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new AppError(401, "Missing Telegram user", "INIT_DATA_INVALID");

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new AppError(401, "Invalid Telegram user", "INIT_DATA_INVALID");
  }
  if (!user || typeof user.id !== "number") {
    throw new AppError(401, "Invalid Telegram user", "INIT_DATA_INVALID");
  }
  return user;
}
