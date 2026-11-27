import { useCallback, useEffect, useState } from "react";
import type { RewardsLeaderboardDto } from "@pintukaca/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { EmptyState, ErrorState, PageHeader, Spinner } from "../components/ui";

export function AdminRewardsPage() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<RewardsLeaderboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLeaderboard(await api.adminRewardsLeaderboard());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the rewards leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role, load]);

  const rebuild = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminRebuildRewards();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rebuild rewards.");
    } finally {
      setBusy(false);
    }
  };

  const adjust = async () => {
    const value = Number(points);
    if (!userId.trim() || !Number.isInteger(value) || value === 0 || reason.trim().length < 2) {
      setError("Enter a user ID, a non-zero integer point change, and a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.adminAdjustRewards(userId.trim(), value, reason.trim());
      setUserId("");
      setPoints("");
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not adjust points.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Rewards" subtitle="Internal leaderboard and point adjustments." back />

      {user?.role !== "admin" ? (
        <EmptyState title="Admin access required" description="This area is limited to moderators." />
      ) : loading ? (
        <Spinner label="Loading rewards" />
      ) : error && !leaderboard ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <>
          <div className="card mb-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Rebuild rewards</p>
                <p className="text-xs text-[var(--tg-hint)]">Recompute points and badges for every active user.</p>
              </div>
              <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => void rebuild()} disabled={busy}>
                Rebuild
              </button>
            </div>
          </div>

          <section className="mb-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Leaderboard</h2>
            {!leaderboard || leaderboard.entries.length === 0 ? (
              <div className="card text-sm text-[var(--tg-hint)]">No reward data yet.</div>
            ) : (
              <div className="space-y-2">
                {leaderboard.entries.map((entry, index) => (
                  <div key={entry.userId} className="card flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        #{index + 1} · Level {entry.level}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[10px] text-[var(--tg-hint)]">{entry.userId}</p>
                      <p className="mt-1 text-xs text-[var(--tg-hint)]">
                        {entry.publishedReviews} reviews · {entry.helpfulReceived} helpful · {entry.badgeCount} badges
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-black text-[var(--brand)]">{entry.points}</p>
                      <p className="text-[10px] text-[var(--tg-hint)]">points</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mb-4">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Adjust points</h2>
            <div className="card space-y-2">
              <input
                className="w-full rounded-xl border border-[var(--tg-border)] bg-transparent px-3 py-2 text-sm outline-none"
                placeholder="User ID"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              />
              <input
                className="w-full rounded-xl border border-[var(--tg-border)] bg-transparent px-3 py-2 text-sm outline-none"
                placeholder="Points, e.g. 15 or -10"
                inputMode="numeric"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
              <input
                className="w-full rounded-xl border border-[var(--tg-border)] bg-transparent px-3 py-2 text-sm outline-none"
                placeholder="Reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <button type="button" className="btn-primary w-full" onClick={() => void adjust()} disabled={busy}>
                {busy ? "Saving" : "Apply adjustment"}
              </button>
            </div>
          </section>

          {error ? <p className="mb-4 text-sm text-[var(--tg-danger)]">{error}</p> : null}
        </>
      )}
    </div>
  );
}
