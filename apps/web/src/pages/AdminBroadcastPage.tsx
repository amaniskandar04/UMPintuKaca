import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminBroadcastDto, BroadcastDto } from "@pintukaca/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import {
  EmptyState,
  ErrorState,
  InlineNotice,
  Modal,
  PageHeader,
  SectionTitle,
  Spinner
} from "../components/ui";

const MAX_MESSAGE = 3000;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: BroadcastDto["status"]): string {
  if (status === "sent") return "Sent";
  if (status === "sending") return "Sending";
  return "Queued";
}

export function AdminBroadcastPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminBroadcastDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      setData(await api.adminBroadcast());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load broadcasts.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role, load]);

  // While a broadcast is still draining, refresh quietly so the counters move.
  useEffect(() => {
    if (!data?.broadcasts.some((broadcast) => broadcast.status !== "sent")) return;
    const timer = window.setInterval(() => void load(false), 8000);
    return () => window.clearInterval(timer);
  }, [data, load]);

  const trimmed = message.trim();
  const audience = data?.audience ?? 0;
  const canSend = trimmed.length > 0 && audience > 0 && !sending;

  const send = async (test: boolean) => {
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.adminSendBroadcast(trimmed, test);
      setMessage("");
      setConfirmOpen(false);
      setNotice(
        test
          ? "Test sent to your Telegram."
          : `Queued for ${result.recipientCount} ${result.recipientCount === 1 ? "user" : "users"}. The first batch is going out now; delivery continues in the background.`
      );
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the broadcast.");
    } finally {
      setSending(false);
    }
  };

  const retry = async (id: string) => {
    setRetryingId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.adminRetryBroadcast(id);
      setNotice(
        result.retried > 0
          ? `Re-queued ${result.retried} failed ${result.retried === 1 ? "delivery" : "deliveries"}.`
          : "Nothing to retry."
      );
      await load(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not retry the broadcast.");
    } finally {
      setRetryingId(null);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Broadcast" back />
        <EmptyState title="Admin access required" description="This area is limited to moderators." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Broadcast"
        subtitle="Send a Telegram DM from the bot to every active user."
        back
        right={
          <Link to="/admin" className="btn-secondary btn-sm">
            Moderation
          </Link>
        }
      />

      {loading ? (
        <Spinner label="Loading broadcasts" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <div className="space-y-5">
          <section>
            <SectionTitle>New message</SectionTitle>
            <div className="card space-y-3">
              <div>
                <label className="label" htmlFor="broadcast-message">
                  Message
                </label>
                <textarea
                  id="broadcast-message"
                  className="input min-h-[140px] resize-y"
                  value={message}
                  onChange={(event) => setMessage(event.target.value.slice(0, MAX_MESSAGE))}
                  placeholder="Subject registration is open. Open PintuKaca to see updated course reviews before you pick."
                  maxLength={MAX_MESSAGE}
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--tg-hint)]">
                  <span>Plain text only. Links will not be previewed.</span>
                  <span>
                    {message.length}/{MAX_MESSAGE}
                  </span>
                </div>
              </div>

              <InlineNotice>
                Goes to <strong>{audience}</strong> active{" "}
                {audience === 1 ? "account" : "accounts"} with the bot. Admins, deleted accounts, and
                accounts without a Telegram chat are excluded.
              </InlineNotice>

              {error ? <p className="text-sm text-[var(--tg-danger)]">{error}</p> : null}
              {notice ? <p className="text-sm text-[var(--tg-hint)]">{notice}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-sm flex-1"
                  onClick={() => void send(true)}
                  disabled={!trimmed || sending}
                >
                  Send test to me
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm flex-1"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canSend}
                >
                  Review &amp; send
                </button>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle
              action={
                <button type="button" className="btn-ghost btn-sm" onClick={() => void load(false)}>
                  Refresh
                </button>
              }
            >
              Recent broadcasts
            </SectionTitle>
            {!data || data.broadcasts.length === 0 ? (
              <EmptyState title="No broadcasts yet" description="Your sent messages will appear here with delivery counts." />
            ) : (
              <div className="space-y-2">
                {data.broadcasts.map((broadcast) => (
                  <BroadcastCard
                    key={broadcast.id}
                    broadcast={broadcast}
                    retrying={retryingId === broadcast.id}
                    onRetry={() => void retry(broadcast.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Modal open={confirmOpen} title="Send broadcast" onClose={() => setConfirmOpen(false)}>
        <div className="space-y-4">
          <InlineNotice tone="warning" title={`Sending to ${audience} users`}>
            This sends a Telegram DM from the bot. It cannot be recalled once delivery starts.
          </InlineNotice>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] p-3 text-sm leading-relaxed">
            {trimmed}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm flex-1"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary btn-sm flex-1"
              onClick={() => void send(false)}
              disabled={sending}
            >
              {sending ? "Sending" : `Send to ${audience}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BroadcastCard({
  broadcast,
  retrying,
  onRetry
}: {
  broadcast: BroadcastDto;
  retrying: boolean;
  onRetry: () => void;
}) {
  const percent =
    broadcast.recipientCount > 0
      ? Math.min(100, Math.round((broadcast.sentCount / broadcast.recipientCount) * 100))
      : 0;
  return (
    <div className="card space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={
              broadcast.status === "sent"
                ? "badge-success"
                : broadcast.status === "sending"
                  ? "badge-warning"
                  : "badge-neutral"
            }
          >
            {statusLabel(broadcast.status)}
          </span>
          <p className="mt-1 text-[11px] text-[var(--tg-hint)]">{formatWhen(broadcast.createdAt)}</p>
        </div>
        <p className="shrink-0 text-xs text-[var(--tg-hint)]">
          {broadcast.sentCount}/{broadcast.recipientCount} delivered
        </p>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--tg-hint)]">
        {broadcast.message.length > 240 ? `${broadcast.message.slice(0, 239)}…` : broadcast.message}
      </p>

      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--tg-border)]">
        <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${percent}%` }} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--tg-hint)]">
        <span>{broadcast.failedCount} failed</span>
        {broadcast.skippedCount > 0 ? <span>{broadcast.skippedCount} skipped</span> : null}
        {broadcast.finishedAt ? <span>finished {formatWhen(broadcast.finishedAt)}</span> : null}
        {broadcast.failedCount > 0 ? (
          <button
            type="button"
            className="btn-ghost btn-sm ml-auto"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Re-queuing" : "Retry failed"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
