import type { Env } from "../env";

export interface TelegramSendResult {
  ok: boolean;
  status?: number;
  retryAfter?: number;
  error?: string;
}

function adminIds(env: Env): string[] {
  return (env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function sendTelegramMessage(
  env: Env,
  chatId: string | number,
  text: string
): Promise<TelegramSendResult> {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, error: "Telegram bot token is not configured" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });
    if (response.ok) return { ok: true };

    let description: string | undefined;
    let retryAfter: number | undefined;
    try {
      const payload = (await response.json()) as {
        description?: string;
        parameters?: { retry_after?: number };
      };
      description = payload.description;
      retryAfter = payload.parameters?.retry_after;
    } catch {
      // Telegram occasionally returns a non-JSON error body; the status is enough.
    }
    return {
      ok: false,
      status: response.status,
      retryAfter,
      error: description || `Telegram responded with ${response.status}`
    };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Telegram request failed" };
  }
}

export async function notifyAdmins(env: Env, text: string): Promise<void> {
  const ids = adminIds(env);
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => sendTelegramMessage(env, id, text)));
}

export async function notifyUser(env: Env, userId: string, text: string): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT telegram_id FROM users WHERE id = ? AND deleted_at IS NULL AND telegram_id > 0"
  )
    .bind(userId)
    .first<{ telegram_id: number }>();
  if (!row) return;
  await sendTelegramMessage(env, row.telegram_id, text);
}
