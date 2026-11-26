export interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    start_param?: string;
    user?: TelegramUser;
  };
  themeParams: TelegramThemeParams;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  close(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  showConfirm?(message: string, callback?: (confirmed: boolean) => void): void;
  showAlert?(message: string, callback?: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  BackButton: {
    show(): void;
    hide(): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegram(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getStartParam(): string | null {
  return getTelegram()?.initDataUnsafe?.start_param ?? null;
}

export function applyTelegramTheme(): void {
  const app = getTelegram();
  if (!app) return;
  app.ready();
  app.expand();
  try {
    app.enableClosingConfirmation();
  } catch {
    void 0;
  }
  const params = app.themeParams ?? {};
  const root = document.documentElement;
  const mapping: Array<[keyof TelegramThemeParams, string]> = [
    ["bg_color", "--tg-bg"],
    ["secondary_bg_color", "--tg-bg-2"],
    ["text_color", "--tg-text"],
    ["hint_color", "--tg-hint"]
  ];
  for (const [source, target] of mapping) {
    const value = params[source];
    if (value) root.style.setProperty(target, value);
  }
  const dark = app.colorScheme === "dark";
  root.style.setProperty("--tg-card", dark ? "rgba(255, 255, 255, 0.06)" : "#ffffff");
  root.style.setProperty("--tg-border", dark ? "rgba(255, 255, 255, 0.10)" : "#e6e8eb");
  root.style.setProperty("--brand-link", dark ? "#4ade80" : "#0a7d31");
  root.style.setProperty("--brand-soft", dark ? "rgba(12, 170, 65, 0.18)" : "rgba(12, 170, 65, 0.10)");
  const background = params.bg_color ?? "#0f1115";
  try {
    app.setHeaderColor(background);
    app.setBackgroundColor(background);
  } catch {
    void 0;
  }
}

export function openExternal(url: string): void {
  const app = getTelegram();
  if (app) app.openLink(url);
  else window.location.href = url;
}

export function haptic(type: "light" | "medium" | "success" | "error" = "light"): void {
  const feedback = getTelegram()?.HapticFeedback;
  if (!feedback) return;
  if (type === "success" || type === "error") feedback.notificationOccurred(type);
  else feedback.impactOccurred(type);
}

export function confirmAction(message: string, onConfirm: () => void): void {
  const app = getTelegram();
  if (app?.showConfirm) {
    app.showConfirm(message, (confirmed) => {
      if (confirmed) onConfirm();
    });
    return;
  }
  if (window.confirm(message)) onConfirm();
}
