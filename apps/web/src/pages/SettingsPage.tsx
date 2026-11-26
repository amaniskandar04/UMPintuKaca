import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RewardsDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { confirmAction, haptic } from "../lib/telegram";
import { formatMonth } from "../lib/format";
import { IconChevronRight, IconShield, IconStar, IconTrash } from "../components/icons";
import { InlineNotice, PageHeader } from "../components/ui";

export function SettingsPage() {
  const { user, config, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [rewards, setRewards] = useState<RewardsDto | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .rewards()
      .then(setRewards)
      .catch(() => setRewards(null));
  }, [user]);

  const removeAccount = () => {
    confirmAction("Delete your account and all of your reviews permanently?", () => {
      void (async () => {
        setBusy(true);
        setError(null);
        try {
          await deleteAccount();
          setDeleted(true);
          haptic("success");
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Could not delete the account.");
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  if (deleted) {
    return (
      <div>
        <PageHeader title="Account deleted" />
        <InlineNotice tone="success" title="Your account was deleted">
          Your reviews were removed and your verification link was cleared. You can close this app.
        </InlineNotice>
        <button type="button" className="btn-secondary mt-4 w-full" onClick={() => navigate("/")}>
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account, privacy, and app information." />

      <div className="card mb-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--tg-hint)]">Verification</span>
          {user?.verified ? <span className="badge-success">Verified</span> : <span className="badge-warning">Unverified</span>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--tg-hint)]">Role</span>
          <span className="text-sm font-semibold capitalize">{user?.role}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--tg-hint)]">Reviews</span>
          <span className="text-sm font-semibold">{user?.reviewCount ?? 0}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--tg-hint)]">Member since</span>
          <span className="text-sm font-semibold">{user?.createdAt ? formatMonth(user.createdAt) : "—"}</span>
        </div>
        {!user?.verified ? (
          <Link to="/verify" className="btn-primary w-full">
            <IconShield size={16} />
            Verify with SiswaMail
          </Link>
        ) : null}
      </div>

      <div className="card mb-4 divide-y divide-[var(--tg-border)] p-0">
        <Link to="/my-reviews" className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          My reviews
          <IconChevronRight size={16} />
        </Link>
        <Link to="/rewards" className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          <span className="flex items-center gap-2">
            <IconStar size={15} className="text-[var(--brand)]" />
            Rewards & badges
          </span>
          <span className="flex items-center gap-2 text-xs text-[var(--tg-hint)]">
            {rewards ? `Lv ${rewards.level} · ${rewards.points} pts` : "View"}
            <IconChevronRight size={16} />
          </span>
        </Link>
        <Link to="/privacy" className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          Privacy policy
          <IconChevronRight size={16} />
        </Link>
        <Link to="/guidelines" className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          Community guidelines
          <IconChevronRight size={16} />
        </Link>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm">
          <span>
            Environment
            <span className="ml-2 text-xs text-[var(--tg-hint)]">{config?.environment ?? "unknown"}</span>
          </span>
          <span className="text-xs text-[var(--tg-hint)]">v0.1.0</span>
        </div>
      </div>

      <div className="card space-y-3">
        <div>
          <p className="text-sm font-semibold">Delete account</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--tg-hint)]">
            This removes your reviews and clears the link between this Telegram account and your SiswaMail verification.
            This cannot be undone.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--tg-danger)]">{error}</p> : null}
        <button type="button" className="btn-danger w-full" onClick={removeAccount} disabled={busy}>
          <IconTrash size={16} />
          {busy ? "Deleting" : "Delete my account"}
        </button>
      </div>

      <p className="mt-5 px-2 text-center text-[11px] leading-relaxed text-[var(--tg-hint)]">
        UM Reviews is an independent student project. It is not affiliated with Universiti Malaya. Reviews are student
        opinions, not official information.
      </p>
    </div>
  );
}
