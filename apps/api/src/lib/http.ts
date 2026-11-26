import type { Context } from "hono";

export function getBearerToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export function clientIpHash(c: Context, pepper: string): string {
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
  let hash = 2166136261;
  const input = `${pepper}:${ip}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function callbackPage(options: { title: string; message: string; botUsername?: string; webAppUrl?: string }): string {
  const bot = options.botUsername?.replace(/^@/, "");
  const returnUrl = bot ? `https://t.me/${bot}?startapp=verified` : options.webAppUrl;
  const action = returnUrl
    ? `<a class="button" href="${escapeHtml(returnUrl)}">Return to Telegram</a>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f1115; color: #f3f4f6; font-family: system-ui, -apple-system, Segoe UI, sans-serif; padding: 24px; }
  .card { width: min(440px, 100%); background: #1b1f27; border: 1px solid rgba(255,255,255,.08); border-radius: 20px; padding: 28px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 10px; }
  p { color: #9ca3af; line-height: 1.5; margin: 0 0 20px; }
  .button { display: inline-block; background: #2ea6ff; color: #04121d; text-decoration: none; font-weight: 650; padding: 12px 18px; border-radius: 12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(options.title)}</h1>
    <p>${escapeHtml(options.message)}</p>
    ${action}
  </div>
</body>
</html>`;
}
