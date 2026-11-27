import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  REWARD_THEMES,
  REWARD_THEME_LEVELS,
  type RewardTheme,
  type RewardsDto
} from "@pintukaca/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { cn, formatMonth } from "../lib/format";
import { BadgeIcon } from "../components/BadgeChip";
import { IconCheck, IconSpark, IconStar } from "../components/icons";
import { ErrorState, PageHeader, Spinner } from "../components/ui";

const THEME_ACCENTS: Record<RewardTheme, string> = {
  default: "#0caa41",
  light: "#0caa41",
  ocean: "#22d3ee",
  cutesy: "#ec4899",
  gold: "#d4af37"
};

const THEME_LABELS: Record<RewardTheme, string> = {
  default: "Dark",
  light: "Light",
  ocean: "Ocean",
  cutesy: "Cutesy",
  gold: "Gold premium"
};

export function RewardsPage() {
  const { refresh } = useAuth();
  const [rewards, setRewards] = useState<RewardsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRewards(await api.rewards());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your rewards.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (input: { showAchievements?: boolean; theme?: RewardTheme; displayBadges?: string[] }) => {
    setBusy(true);
    setError(null);
    try {
      setRewards(await api.updateRewards(input));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your rewards settings.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBadge = (key: string) => {
    if (!rewards) return;
    const selected = rewards.displayBadges;
    if (selected.includes(key)) {
      void update({ displayBadges: selected.filter((item) => item !== key) });
    } else if (selected.length < 3) {
      void update({ displayBadges: [...selected, key] });
    }
  };

  if (loading) return <Spinner label="Loading rewards" />;
  if (error && !rewards) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!rewards) return <ErrorState message="Rewards are unavailable." onRetry={() => void load()} />;

  const accent = THEME_ACCENTS[rewards.theme] ?? THEME_ACCENTS.default;
  const style = { "--reward-accent": accent } as CSSProperties;

  return (
    <div style={style}>
      <PageHeader title="Rewards" subtitle="Private points. Public level and badges." back />

      <div className="card mb-4" style={{ borderColor: "var(--reward-accent)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tg-hint)]">
              Level {rewards.level} · {rewards.levelLabel}
            </p>
            <p className="mt-2 text-4xl font-black leading-none text-[var(--reward-accent)]">{rewards.points}</p>
            <p className="mt-1 text-xs text-[var(--tg-hint)]">Private points</p>
          </div>
          <span
            className="avatar-ring flex h-14 w-14 items-center justify-center rounded-2xl border text-[var(--reward-accent)]"
            style={{ borderColor: "var(--reward-accent)" }}
          >
            <IconStar size={26} className="fill-current" />
          </span>
        </div>
        {rewards.nextLevel && rewards.progress ? (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="text-[var(--tg-hint)]">
                {rewards.progress.current} / {rewards.progress.target} to level {rewards.nextLevel.level}
              </span>
              <span className="font-semibold text-[var(--reward-accent)]">{rewards.nextLevel.label}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${rewards.progress.percent}%`, background: "var(--reward-accent)" }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs font-semibold text-[var(--reward-accent)]">Maximum level reached.</p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          ["Published", rewards.publishedReviews],
          ["Written", rewards.writtenReviews],
          ["Long-form", rewards.longReviews],
          ["Helpful votes", rewards.helpfulReceived],
          ["Votes given", rewards.helpfulGiven],
          ["Current streak", `${rewards.currentStreak}w`],
          ["Longest streak", `${rewards.longestStreak}w`],
          ["Badges", rewards.badges.filter((badge) => badge.earnedAt).length]
        ].map(([label, value]) => (
          <div key={label} className="card py-3">
            <p className="text-xl font-black">{value}</p>
            <p className="text-[11px] text-[var(--tg-hint)]">{label}</p>
          </div>
        ))}
      </div>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Points breakdown</h2>
        <div className="card space-y-2 text-sm">
          <Row label="Rating-only reviews" value={`${rewards.pointsBreakdown.ratingOnly} pts`} />
          <Row label="Written reviews" value={`${rewards.pointsBreakdown.written} pts`} />
          <Row label="Long-review bonus" value={`${rewards.pointsBreakdown.long} pts`} />
          <Row label="Helpful votes received" value={`${rewards.pointsBreakdown.helpful} pts`} />
          <Row label="Questions asked" value={`${rewards.pointsBreakdown.questions} pts`} />
          <Row label="Answers given" value={`${rewards.pointsBreakdown.answers} pts`} />
          <Row
            label="Admin adjustments"
            value={`${rewards.pointsBreakdown.adjustments > 0 ? "+" : ""}${rewards.pointsBreakdown.adjustments} pts`}
          />
          <div className="border-t border-[var(--tg-border)] pt-2">
            <Row label="Total" value={`${rewards.pointsBreakdown.total} pts`} strong />
          </div>
        </div>
      </section>

      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Badges</h2>
          <span className="text-xs text-[var(--tg-hint)]">
            {rewards.badges.filter((badge) => badge.earnedAt).length}/{rewards.badges.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {rewards.badges.map((badge) => {
            const earned = Boolean(badge.earnedAt);
            return (
              <div
                key={badge.key}
                className={cn("card space-y-2 py-3", !earned && "opacity-55")}
                style={earned ? { borderColor: "var(--reward-accent)" } : undefined}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
                      earned
                        ? "border-[var(--reward-accent)] text-[var(--reward-accent)]"
                        : "border-[var(--tg-border)] text-[var(--tg-hint)]"
                    )}
                  >
                    <BadgeIcon icon={badge.icon} size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{badge.label}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--tg-hint)]">{badge.description}</p>
                  </div>
                </div>
                {earned ? (
                  <p className="flex items-center gap-1 text-[10px] font-medium text-[var(--reward-accent)]">
                    <IconCheck size={11} />
                    {badge.earnedAt ? formatMonth(badge.earnedAt) : "Earned"}
                  </p>
                ) : badge.progress ? (
                  <div>
                    <div className="bar-track h-1.5">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.min(100, (badge.progress.current / Math.max(1, badge.progress.target)) * 100)}%`
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--tg-hint)]">
                      {Math.min(badge.progress.current, badge.progress.target)} / {badge.progress.target}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Display</h2>
        <div className="card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Show level and badges on my reviews</p>
              <p className="mt-1 text-xs text-[var(--tg-hint)]">Your alias and email are never shown.</p>
            </div>
            <button
              type="button"
              className={cn(
                "chip shrink-0",
                rewards.showAchievements && "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-link)]"
              )}
              onClick={() => void update({ showAchievements: !rewards.showAchievements })}
              disabled={busy}
            >
              {rewards.showAchievements ? "Shown" : "Hidden"}
            </button>
          </div>

          <div>
            <p className="text-sm font-semibold">Badges shown on reviews</p>
            <p className="mt-1 text-xs text-[var(--tg-hint)]">
              Choose up to 3. If none are selected, your top 3 earned badges are shown.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rewards.badges.filter((badge) => badge.earnedAt).length === 0 ? (
                <p className="text-xs text-[var(--tg-hint)]">Earn a badge first.</p>
              ) : (
                rewards.badges
                  .filter((badge) => badge.earnedAt)
                  .map((badge) => {
                    const active = rewards.displayBadges.includes(badge.key);
                    const disabled = !active && rewards.displayBadges.length >= 3;
                    return (
                      <button
                        key={badge.key}
                        type="button"
                        className={cn("chip", active && "border-[var(--brand)] text-[var(--brand-link)]")}
                        disabled={disabled || busy}
                        onClick={() => toggleBadge(badge.key)}
                      >
                        <BadgeIcon icon={badge.icon} size={12} />
                        {badge.label}
                      </button>
                    );
                  })
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold">App theme</p>
            <p className="mt-1 text-xs text-[var(--tg-hint)]">
              Light and dark are always available. Cutesy unlocks at level 5 and Gold premium at level 10.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {REWARD_THEMES.map((theme) => {
                const unlocked = rewards.unlockedThemes.includes(theme);
                const active = rewards.theme === theme;
                return (
                  <button
                    key={theme}
                    type="button"
                    className={cn("chip", active && "border-[var(--brand)] text-[var(--brand-link)]")}
                    style={{ borderColor: active ? THEME_ACCENTS[theme] : undefined }}
                    disabled={!unlocked || busy}
                    onClick={() => void update({ theme })}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: THEME_ACCENTS[theme] }} />
                    {THEME_LABELS[theme]}
                    {!unlocked ? <span className="text-[10px] opacity-60">Lv {REWARD_THEME_LEVELS[theme]}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">How points work</h2>
        <div className="card space-y-2 text-xs leading-relaxed text-[var(--tg-hint)]">
          <p className="flex gap-2">
            <IconSpark size={14} className="mt-0.5 shrink-0 text-[var(--reward-accent)]" />
            A rating-only review earns 1 point.
          </p>
          <p className="flex gap-2">
            <IconSpark size={14} className="mt-0.5 shrink-0 text-[var(--reward-accent)]" />
            A written review of at least 20 characters earns 10 points.
          </p>
          <p className="flex gap-2">
            <IconSpark size={14} className="mt-0.5 shrink-0 text-[var(--reward-accent)]" />
            A review over 200 characters earns an extra 10 bonus points.
          </p>
          <p className="flex gap-2">
            <IconSpark size={14} className="mt-0.5 shrink-0 text-[var(--reward-accent)]" />
            Each helpful vote received earns 2 bonus points.
          </p>
          <p className="flex gap-2">
            <IconSpark size={14} className="mt-0.5 shrink-0 text-[var(--reward-accent)]" />
            Only published reviews count. Hidden or deleted reviews earn nothing.
          </p>
        </div>
      </section>

      {error ? <p className="mb-4 text-sm text-[var(--tg-danger)]">{error}</p> : null}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold" : "text-[var(--tg-hint)]"}>{label}</span>
      <span className={strong ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
