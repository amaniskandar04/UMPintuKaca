import { useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { IconShield } from "./icons";
import { ErrorState, LoadingScreen } from "./ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, error, config, devLogin } = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (status === "loading") return <LoadingScreen label="Starting UM Reviews" />;

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <ErrorState message={error || "The app could not start."} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (status === "unauthenticated" && !config?.devBypass) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
        <div className="card space-y-4 text-center">
          <h1 className="text-xl font-bold">Session ended</h1>
          <p className="text-sm leading-relaxed text-[var(--tg-hint)]">
            Reopen the app from the Telegram bot to start a new session.
          </p>
          <button type="button" className="btn-primary w-full" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    const startDev = async () => {
      setBusy(true);
      setLocalError(null);
      try {
        await devLogin();
      } catch (caught) {
        setLocalError(caught instanceof Error ? caught.message : "Could not start a dev session.");
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5">
        <div className="card space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-link)]">
            <IconShield size={26} />
          </div>
          <div>
            <h1 className="text-xl font-bold">UM Reviews</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tg-hint)]">
              This is a development session outside Telegram. Use a local admin account to test the app.
            </p>
          </div>
          {localError ? <p className="text-sm text-[var(--tg-danger)]">{localError}</p> : null}
          <button type="button" className="btn-primary w-full" onClick={startDev} disabled={busy}>
            {busy ? "Starting" : "Continue as dev admin"}
          </button>
          {config?.environment === "production" ? (
            <p className="text-xs text-[var(--tg-danger)]">Dev access is disabled in production.</p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
