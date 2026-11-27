import { REWARD_THEMES, type RewardTheme } from "@pintukaca/shared";
import { getTelegram } from "./telegram";

interface ThemePalette {
  bg: string;
  bg2: string;
  text: string;
  hint: string;
  link: string;
  button: string;
  buttonText: string;
  border: string;
  card: string;
  danger: string;
  success: string;
  warning: string;
  brand: string;
  brandStrong: string;
  brandLink: string;
  brandSoft: string;
  brandRing: string;
  brandInk: string;
  heroFrom: string;
  heroTo: string;
  btnFrom: string;
  btnTo: string;
  barFrom: string;
  barTo: string;
  markBg: string;
  markText: string;
}

const PALETTES: Record<RewardTheme, ThemePalette> = {
  default: {
    bg: "#0f1115",
    bg2: "#171a21",
    text: "#f3f4f6",
    hint: "#9ca3af",
    link: "#4ade80",
    button: "#0caa41",
    buttonText: "#ffffff",
    border: "rgba(148, 163, 184, 0.16)",
    card: "rgba(148, 163, 184, 0.08)",
    danger: "#f87171",
    success: "#4ade80",
    warning: "#fbbf24",
    brand: "#0caa41",
    brandStrong: "#0a7f38",
    brandLink: "#4ade80",
    brandSoft: "rgba(12, 170, 65, 0.14)",
    brandRing: "rgba(12, 170, 65, 0.32)",
    brandInk: "#ffffff",
    heroFrom: "#0fb84a",
    heroTo: "#0a7f38",
    btnFrom: "#10b84a",
    btnTo: "#0a9c3c",
    barFrom: "#0caa41",
    barTo: "#4ade80",
    markBg: "#ffffff",
    markText: "#0caa41"
  },
  light: {
    bg: "#f4f7f4",
    bg2: "#ffffff",
    text: "#0f172a",
    hint: "#64748b",
    link: "#0a7d31",
    button: "#0caa41",
    buttonText: "#ffffff",
    border: "#e2e8f0",
    card: "#ffffff",
    danger: "#dc2626",
    success: "#16a34a",
    warning: "#d97706",
    brand: "#0caa41",
    brandStrong: "#0a7f38",
    brandLink: "#0a7d31",
    brandSoft: "rgba(12, 170, 65, 0.10)",
    brandRing: "rgba(12, 170, 65, 0.22)",
    brandInk: "#ffffff",
    heroFrom: "#16a34a",
    heroTo: "#0a7f38",
    btnFrom: "#10b84a",
    btnTo: "#0a9c3c",
    barFrom: "#0caa41",
    barTo: "#16a34a",
    markBg: "#ffffff",
    markText: "#0caa41"
  },
  ocean: {
    bg: "#061018",
    bg2: "#0b1a26",
    text: "#e6f6fb",
    hint: "#8fb6c8",
    link: "#67e8f9",
    button: "#22d3ee",
    buttonText: "#06202a",
    border: "rgba(56, 189, 248, 0.20)",
    card: "rgba(34, 211, 238, 0.08)",
    danger: "#fb7185",
    success: "#2dd4bf",
    warning: "#fbbf24",
    brand: "#22d3ee",
    brandStrong: "#0e7490",
    brandLink: "#67e8f9",
    brandSoft: "rgba(34, 211, 238, 0.14)",
    brandRing: "rgba(34, 211, 238, 0.32)",
    brandInk: "#06202a",
    heroFrom: "#0e7490",
    heroTo: "#062b3a",
    btnFrom: "#22d3ee",
    btnTo: "#0891b2",
    barFrom: "#22d3ee",
    barTo: "#67e8f9",
    markBg: "#e6f6fb",
    markText: "#0e7490"
  },
  cutesy: {
    bg: "#fff5fa",
    bg2: "#ffffff",
    text: "#3f2a3f",
    hint: "#8a6a85",
    link: "#db2777",
    button: "#ec4899",
    buttonText: "#ffffff",
    border: "#f7d6e6",
    card: "#fff0f7",
    danger: "#dc2626",
    success: "#16a34a",
    warning: "#d97706",
    brand: "#ec4899",
    brandStrong: "#be185d",
    brandLink: "#db2777",
    brandSoft: "rgba(236, 72, 153, 0.12)",
    brandRing: "rgba(236, 72, 153, 0.28)",
    brandInk: "#ffffff",
    heroFrom: "#f9a8d4",
    heroTo: "#ec4899",
    btnFrom: "#f472b6",
    btnTo: "#db2777",
    barFrom: "#f472b6",
    barTo: "#ec4899",
    markBg: "#ffffff",
    markText: "#db2777"
  },
  gold: {
    bg: "#0a0a0c",
    bg2: "#141217",
    text: "#f8f1df",
    hint: "#b9a98a",
    link: "#e8c46a",
    button: "#d4af37",
    buttonText: "#1a1400",
    border: "rgba(212, 175, 55, 0.24)",
    card: "rgba(212, 175, 55, 0.08)",
    danger: "#f87171",
    success: "#e8c46a",
    warning: "#fbbf24",
    brand: "#d4af37",
    brandStrong: "#a67c00",
    brandLink: "#e8c46a",
    brandSoft: "rgba(212, 175, 55, 0.16)",
    brandRing: "rgba(212, 175, 55, 0.32)",
    brandInk: "#1a1400",
    heroFrom: "#3a2f12",
    heroTo: "#a67c00",
    btnFrom: "#e8c46a",
    btnTo: "#d4af37",
    barFrom: "#d4af37",
    barTo: "#f8e7a1",
    markBg: "#f8e7a1",
    markText: "#1a1400"
  }
};

function resolveTheme(theme: string | null | undefined): RewardTheme {
  return theme && (REWARD_THEMES as readonly string[]).includes(theme) ? (theme as RewardTheme) : "default";
}

export function applyAppTheme(theme: string | null | undefined): void {
  const resolved = resolveTheme(theme);
  const palette = PALETTES[resolved];
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved === "light" || resolved === "cutesy" ? "light" : "dark";

  const variables: Record<string, string> = {
    "--tg-bg": palette.bg,
    "--tg-bg-2": palette.bg2,
    "--tg-text": palette.text,
    "--tg-hint": palette.hint,
    "--tg-link": palette.link,
    "--tg-button": palette.button,
    "--tg-button-text": palette.buttonText,
    "--tg-border": palette.border,
    "--tg-card": palette.card,
    "--tg-danger": palette.danger,
    "--tg-success": palette.success,
    "--tg-warning": palette.warning,
    "--brand": palette.brand,
    "--brand-strong": palette.brandStrong,
    "--brand-link": palette.brandLink,
    "--brand-soft": palette.brandSoft,
    "--brand-ring": palette.brandRing,
    "--brand-ink": palette.brandInk,
    "--hero-from": palette.heroFrom,
    "--hero-to": palette.heroTo,
    "--btn-from": palette.btnFrom,
    "--btn-to": palette.btnTo,
    "--bar-from": palette.barFrom,
    "--bar-to": palette.barTo,
    "--brand-mark-bg": palette.markBg,
    "--brand-mark-text": palette.markText
  };
  for (const [key, value] of Object.entries(variables)) root.style.setProperty(key, value);

  const app = getTelegram();
  if (app) {
    try {
      app.setHeaderColor(palette.bg);
      app.setBackgroundColor(palette.bg);
    } catch {
      void 0;
    }
  }
}
