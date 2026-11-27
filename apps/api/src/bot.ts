import { Bot, InlineKeyboard, type Context } from "grammy";
import type { Update } from "grammy/types";
import type { Env } from "./env";

let cached: { token: string; bot: Bot } | null = null;

function appUrl(env: Env, path = ""): string {
  const base = (env.WEB_APP_URL || "").replace(/\/$/, "");
  return `${base}${path}`;
}

function appKeyboard(env: Env, path = ""): InlineKeyboard | undefined {
  const url = appUrl(env, path);
  if (!url.startsWith("https://")) return undefined;
  return new InlineKeyboard().webApp("Open UM Reviews", url);
}

function sendApp(ctx: Context, env: Env, text: string, path = ""): Promise<unknown> {
  const keyboard = appKeyboard(env, path);
  return keyboard ? ctx.reply(text, { reply_markup: keyboard }) : ctx.reply(text);
}

function createBot(env: Env): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN || "");

  bot.command("start", async (ctx) => {
    const text = [
      "Welcome to UM Reviews.",
      "",
      "An anonymous space for Universiti Malaya students to rate courses, degree programmes, and clubs.",
      "",
      "Verify once with your SiswaMail account, then review anonymously. Your email is never shown to other students.",
      "",
      "Tap the button below to open the app."
    ].join("\n");
    await sendApp(ctx, env, text);
  });

  bot.command("app", async (ctx) => {
    await sendApp(ctx, env, "Open UM Reviews to browse and write reviews.");
  });

  bot.command("help", async (ctx) => {
    const text = [
      "UM Reviews commands",
      "",
      "/app - open the review app",
      "/myreviews - open your reviews",
      "/rewards - open your points and badges",
      "/privacy - how anonymity works",
      "/guidelines - community rules",
      "/report - how to report a review",
      "/feedback - send feedback or a complaint",
      "/deleteaccount - delete your account",
      "",
      "Reviews are anonymous to other students. Verified UM status is checked once through Google sign-in."
    ].join("\n");
    await sendApp(ctx, env, text);
  });

  bot.command("myreviews", async (ctx) => {
    await sendApp(ctx, env, "Open your reviews below.", "/my-reviews");
  });

  bot.command("rewards", async (ctx) => {
    await sendApp(ctx, env, "Open your points, level, and badges below.", "/rewards");
  });

  bot.command("privacy", async (ctx) => {
    const text = [
      "Privacy",
      "",
      "We store your Telegram numeric ID so the bot can identify your account, and an opaque Google identifier for verification.",
      "We never store your SiswaMail password. We do not publish your name, email, Telegram username, or Telegram ID.",
      "Reviews are shown under a random animal alias. The app operator can technically link a review to an account, so anonymity is not absolute.",
      "Complaints and suggestions sent through the support form are hosted by Google, which records your IP address.",
      "You can delete your account and your reviews from Settings."
    ].join("\n");
    await sendApp(ctx, env, text, "/privacy");
  });

  bot.command("guidelines", async (ctx) => {
    const text = [
      "Community guidelines",
      "",
      "Review courses, programmes, and clubs, not individual people. Do not name lecturers, club leaders, staff, or students.",
      "Do not post threats, harassment, private information, spam, or unverified allegations.",
      "Reviews are opinions. Keep them specific, honest, and useful to other students.",
      "Flagged reviews may be held for manual review."
    ].join("\n");
    await sendApp(ctx, env, text, "/guidelines");
  });

  bot.command("report", async (ctx) => {
    await sendApp(ctx, env, "Open a review and tap Report. Reports go to the moderation queue.", "/guidelines");
  });

  bot.command("feedback", async (ctx) => {
    await sendApp(
      ctx,
      env,
      "Send a bug report, suggestion, complaint, or moderation appeal from the support page.",
      "/support"
    );
  });

  bot.command("deleteaccount", async (ctx) => {
    await sendApp(ctx, env, "Open Settings in the app to delete your account and reviews.", "/settings");
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    await sendApp(ctx, env, "Use /help to see what this bot can do, or open the app below.");
  });

  bot.catch((error) => {
    console.error("Telegram bot error", error.error);
  });

  return bot;
}

function getBot(env: Env): Bot {
  const token = env.TELEGRAM_BOT_TOKEN || "";
  if (cached && cached.token === token) return cached.bot;
  const bot = createBot(env);
  cached = { token, bot };
  return bot;
}

export async function handleTelegramUpdate(env: Env, update: Update): Promise<void> {
  const bot = getBot(env);
  if (!bot.isInited()) await bot.init();
  await bot.handleUpdate(update);
}
