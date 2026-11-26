import type { Env } from "./env";

export async function cleanup(env: Env): Promise<void> {
  const now = new Date().toISOString();
  const unverifiedCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const rateCutoff = Math.floor(Date.now() / 1000) - 8 * 86400;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(rateCutoff),
    env.DB.prepare(
      "DELETE FROM users WHERE verified_at IS NULL AND created_at < ? AND id NOT IN (SELECT DISTINCT user_id FROM reviews)"
    ).bind(unverifiedCutoff)
  ]);
}
