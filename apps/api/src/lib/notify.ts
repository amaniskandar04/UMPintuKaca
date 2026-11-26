import type { Env } from "../env";

function adminIds(env: Env): string[] {
  return (env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function sendTelegramMessage(env: Env, chatId: string | number, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });
  } catch {
    return;
  }
}

export async function notifyAdmins(env: Env, text: string): Promise<void> {
  const ids = adminIds(env);
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => sendTelegramMessage(env, id, text)));
}

export async function notifyUser(env: Env, userId: string, text: string): Promise<void> {
  const row = await env.DB.prepare("SELECT telegram_id FROM users WHERE id = ? AND deleted_at IS NULL")
    .bind(userId)
    .first<{ telegram_id: number }>();
  if (!row) return;
  await sendTelegramMessage(env, row.telegram_id, text);
}
