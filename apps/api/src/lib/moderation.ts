export const FLAG_LABELS: Record<string, string> = {
  PROFANITY: "Profanity",
  SPAM: "Spam, links, or advertising",
  PII: "Possible personal information",
  NAMED_INDIVIDUAL: "Names an individual",
  THREAT: "Threatening language",
  HARSH_LANGUAGE: "Harsh or potentially defamatory language",
  LOW_EFFORT: "Very short review",
  DUPLICATE: "Duplicate content"
};

const PROFANITY = new Set([
  "fuck",
  "fucking",
  "shit",
  "bullshit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "cunt",
  "prick",
  "slut",
  "whore",
  "bodoh",
  "babi",
  "anjing",
  "sial",
  "celaka",
  "bangsat",
  "tolol",
  "goblok",
  "pukimak",
  "kimak",
  "jilaka"
]);

const HARSH = new Set([
  "worst",
  "useless",
  "trash",
  "garbage",
  "rubbish",
  "scam",
  "corrupt",
  "racist",
  "sexist",
  "harass",
  "harassment",
  "bully",
  "bullying",
  "incompetent",
  "lazy",
  "stupid",
  "idiot",
  "disgusting",
  "terrible",
  "awful",
  "pathetic",
  "hopeless",
  "fraud",
  "fake"
]);

const THREATS = new Set([
  "kill",
  "murder",
  "beat",
  "punch",
  "shoot",
  "bomb",
  "destroy",
  "hurt",
  "attack",
  "stab"
]);

// Flags that hold a review for moderation before anyone else can read it.
//
// HARSH_LANGUAGE is deliberately NOT here. Negative reviews are the point of a
// review app, and holding every review containing "worst" or "terrible" meant
// honest criticism was invisible until an admin approved it. The flag is still
// raised and shown in the admin queue, so it can be reviewed after the fact.
const PENDING_FLAGS = new Set([
  "PROFANITY",
  "SPAM",
  "PII",
  "NAMED_INDIVIDUAL",
  "THREAT"
]);

const URL_PATTERN = /(https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,})/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /\b(?:\+?6?0\d{8,10})\b/;
const IC_PATTERN = /\b\d{6}-?\d{2}-?\d{4}\b/;
const LONG_DIGITS_PATTERN = /\b\d{10,}\b/;
const REPEATED_PATTERN = /(.)\1{7,}/;
const NAMED_PATTERN = /\b(?:[Pp]rof(?:essor)?|[Dd]r|[Mm]r|[Mm]rs|[Mm]s|[Ss]ir|[Mm]adam)\.?\s+[A-Z][a-z]+/;
const LECTURER_PATTERN = /\b(?:[Ll]ecturer|[Tt]eacher|[Tt]utor|[Pp]rofessor)\s+[A-Z][a-z]+/;

export interface ModerationResult {
  flags: string[];
  status: "published" | "pending";
  reasons: string[];
}

export function moderateReview(input: { title?: string | null; body?: string | null }): ModerationResult {
  const title = input.title ?? "";
  const body = input.body ?? "";
  const text = `${title}\n${body}`.trim();
  const flags = new Set<string>();

  if (!text) {
    return { flags: [], status: "published", reasons: [] };
  }

  const lower = text.toLowerCase();
  const tokens = lower
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.some((token) => PROFANITY.has(token))) flags.add("PROFANITY");
  if (tokens.some((token) => THREATS.has(token))) flags.add("THREAT");
  if (tokens.some((token) => HARSH.has(token))) flags.add("HARSH_LANGUAGE");

  const links = text.match(URL_PATTERN);
  if (links && links.length > 0) flags.add("SPAM");
  if (REPEATED_PATTERN.test(text)) flags.add("SPAM");
  if (text.length > 30) {
    const letters = text.replace(/[^A-Za-z]/g, "");
    if (letters.length > 15) {
      const upper = letters.replace(/[^A-Z]/g, "").length;
      if (upper / letters.length > 0.7) flags.add("SPAM");
    }
  }

  if (
    EMAIL_PATTERN.test(text) ||
    PHONE_PATTERN.test(text) ||
    IC_PATTERN.test(text) ||
    LONG_DIGITS_PATTERN.test(text)
  ) {
    flags.add("PII");
  }

  if (NAMED_PATTERN.test(text) || LECTURER_PATTERN.test(text)) flags.add("NAMED_INDIVIDUAL");

  const trimmedBody = body.trim();
  if (!title.trim() && trimmedBody.length > 0 && trimmedBody.length < 15) flags.add("LOW_EFFORT");

  const flagList = Array.from(flags);
  const pending = flagList.some((flag) => PENDING_FLAGS.has(flag));
  return {
    flags: flagList,
    status: pending ? "pending" : "published",
    reasons: flagList.map((flag) => FLAG_LABELS[flag] ?? flag)
  };
}

export function isSeriousFlag(flag: string): boolean {
  return PENDING_FLAGS.has(flag);
}
