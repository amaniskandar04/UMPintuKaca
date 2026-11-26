import type { Env } from "../env";
import { hmacSha256 } from "./crypto";

const ADJECTIVES = [
  "Quiet",
  "Calm",
  "Brave",
  "Gentle",
  "Swift",
  "Bright",
  "Curious",
  "Steady",
  "Kind",
  "Bold",
  "Clever",
  "Patient",
  "Thoughtful",
  "Cheerful",
  "Focused",
  "Honest",
  "Humble",
  "Lively",
  "Modest",
  "Sharp"
];

const ANIMALS = [
  "Otter",
  "Heron",
  "Lynx",
  "Falcon",
  "Panda",
  "Fox",
  "Deer",
  "Owl",
  "Crane",
  "Tiger",
  "Dolphin",
  "Turtle",
  "Rabbit",
  "Badger",
  "Sparrow",
  "Koala",
  "Penguin",
  "Gecko",
  "Moth",
  "Wombat"
];

export async function makeAlias(env: Env, userId: string, targetType: string, targetId: string): Promise<string> {
  const pepper = env.ALIAS_PEPPER || (env.ENVIRONMENT === "production" ? "" : "dev-alias-pepper-change-me");
  if (!pepper) throw new Error("ALIAS_PEPPER is not configured");
  const digest = await hmacSha256(
    new TextEncoder().encode(pepper),
    new TextEncoder().encode(`${userId}:${targetType}:${targetId}`)
  );
  const bytes = new Uint8Array(digest);
  const adjective = ADJECTIVES[bytes[0] % ADJECTIVES.length];
  const animal = ANIMALS[bytes[1] % ANIMALS.length];
  return `Anonymous ${adjective} ${animal}`;
}
