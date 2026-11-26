import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getStartParam } from "../lib/telegram";
import { formatMonth } from "../lib/format";
import { IconCheck, IconShield } from "../components/icons";
import { InlineNotice, PageHeader } from "../components/ui";

export function VerifyPage() {
  const { user, config, verify, devVerify, devUnverify, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const startParam = getStartParam();
    const url = new URL(window.location.href);
    if (startParam === "verified" || url.searchParams.get("verified") === "1") {
      setRefreshing(true);
      void refresh()
        .catch(() => void 0)
        .finally(() => setRefreshing(false));
    }
  }, [refresh]);

  const startVerification = async () => {
    setBusy(true);
    setError(null);
    try {
      await verify();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start verification.");
    } finally {
      setBusy(false);
    }
  };

  const startDevVerification = async () => {
    setBusy(true);
    setError(null);
    try {
      await devVerify();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify the dev account.");
    } finally {
      setBusy(false);
    }
  };

  const resetDevVerification = async () => {
    setBusy(true);
    setError(null);
    try {
      await devUnverify();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset the dev verification.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Verification" subtitle="One-time SiswaMail check. Your identity stays private." />

      {user?.verified ? (
        <div className="card mb-4 space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(74,222,128,0.14)] text-[var(--tg-success)]">
            <IconCheck size={30} />
          </div>
          <div>
            <p className="text-lg font-bold">Verified UM student</p>
            <p className="mt-1 text-sm text-[var(--tg-hint)]">
              {user.verifiedAt ? `Verified ${formatMonth(user.verifiedAt)}` : "Verification complete"}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--tg-hint)]">
            Your SiswaMail address is never shown to other students. Reviews appear under a random alias.
          </p>
          {config?.devBypass ? (
            <button type="button" className="btn-ghost w-full" onClick={resetDevVerification} disabled={busy}>
              Dev: reset verification to test Google sign-in
            </button>
          ) : null}
          {error ? <p className="text-sm text-[var(--tg-danger)]">{error}</p> : null}
        </div>
      ) : (
        <div className="card mb-4 space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-link)]">
              <IconShield size={22} />
            </span>
            <div>
              <p className="font-semibold">Verify with SiswaMail</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--tg-hint)]">
                Sign in with Google using your <strong className="text-[var(--tg-text)]">@siswa.um.edu.my</strong> account.
                We check that the account belongs to UM. We never see or store your password.
              </p>
            </div>
          </div>

          {config?.googleEnabled ? (
            <button type="button" className="btn-primary w-full" onClick={startVerification} disabled={busy}>
              {busy ? "Opening Google" : "Continue with SiswaMail"}
            </button>
          ) : (
            <InlineNotice tone="warning" title="Google sign-in not configured">
              The operator still needs to add Google OAuth credentials. In development you can use the local verification
              button below.
            </InlineNotice>
          )}

          {config?.devBypass ? (
            <button type="button" className="btn-secondary w-full" onClick={startDevVerification} disabled={busy}>
              Dev: mark this account as verified
            </button>
          ) : null}

          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => {
              setRefreshing(true);
              void refresh()
                .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh."))
                .finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing" : "I already verified — refresh status"}
          </button>

          {error ? <p className="text-sm text-[var(--tg-danger)]">{error}</p> : null}
        </div>
      )}

      <div className="card space-y-3">
        <p className="text-sm font-semibold">How anonymity works</p>
        <ul className="space-y-2 text-xs leading-relaxed text-[var(--tg-hint)]">
          <li>Your Telegram numeric ID is stored so the bot can recognise your account.</li>
          <li>Google returns an opaque account identifier. Your email address is not stored or published.</li>
          <li>Reviews appear under a random animal alias, not your name or Telegram handle.</li>
          <li>The app operator can technically link a review to an account, so anonymity is not absolute.</li>
          <li>You can delete your account and reviews at any time from Settings.</li>
        </ul>
      </div>
    </div>
  );
}
