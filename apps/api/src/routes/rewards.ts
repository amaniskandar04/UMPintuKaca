import { Hono } from "hono";
import { UpdateRewardsSchema } from "@pintukaca/shared";
import type { AppEnv } from "../env";
import { authMiddleware } from "../middleware";
import { getUserRewards, updateRewardPreferences } from "../lib/rewards";

const rewards = new Hono<AppEnv>();

rewards.get("/me", authMiddleware, async (c) => {
  return c.json(await getUserRewards(c.env.DB, c.get("user").id));
});

rewards.patch("/me", authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateRewardsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid preference", details: parsed.error.flatten() }, 400);
  }
  return c.json(
    await updateRewardPreferences(c.env.DB, c.get("user").id, {
      showAchievements: parsed.data.showAchievements,
      theme: parsed.data.theme,
      displayBadges: parsed.data.displayBadges
    })
  );
});

export default rewards;
