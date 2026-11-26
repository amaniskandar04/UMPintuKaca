import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminQueueDto, AdminReviewDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { targetPath } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { confirmAction } from "../lib/telegram";
import { IconAlert, IconCheck, IconFlag, IconTrash } from "../components/icons";
import {
  EmptyState,
  ErrorState,
  InlineNotice,
  Modal,
  PageHeader,
  SectionTitle,
  Spinner
} from "../components/ui";

export function AdminPage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<AdminQueueDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ id: string; label: string } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setQueue(await api.adminQueue());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the moderation queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === "admin") void load();
  }, [user?.role, load]);

  const act = async (review: AdminReviewDto, action: "approve" | "hide" | "delete") => {
    const run = async () => {
      setBusyId(review.id);
      try {
        await api.adminReviewAction(review.id, action);
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Action failed.");
      } finally {
        setBusyId(null);
      }
    };
    if (action === "delete") confirmAction("Permanently remove this review?", () => void run());
    else void run();
  };

  const resolveReport = async (id: string, action: "dismiss" | "action_taken") => {
    setBusyId(id);
    try {
      await api.adminResolveReport(id, action);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resolve the report.");
    } finally {
      setBusyId(null);
    }
  };

  const submitBan = async () => {
    if (!banTarget) return;
    setBanBusy(true);
    setBanError(null);
    try {
      await api.adminBan(banTarget.id, banReason.trim() || "Moderation policy violation");
      setBanTarget(null);
      setBanReason("");
      await load();
    } catch (caught) {
      setBanError(caught instanceof Error ? caught.message : "Could not ban this user.");
    } finally {
      setBanBusy(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Admin" />
        <EmptyState title="Admin access required" description="This area is limited to moderators." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Moderation" subtitle="Pending reviews, reports, and account restrictions." back right={<Link to="/admin/rewards" className="btn-secondary btn-sm">Rewards</Link>} />

      {loading ? (
        <Spinner label="Loading queue" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !queue ? (
        <EmptyState title="No data" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <div className="card">
              <p className="text-2xl font-black">{queue.stats.pendingReviews}</p>
              <p className="text-xs text-[var(--tg-hint)]">Pending reviews</p>
            </div>
            <div className="card">
              <p className="text-2xl font-black">{queue.stats.openReports}</p>
              <p className="text-xs text-[var(--tg-hint)]">Open reports</p>
            </div>
            <div className="card">
              <p className="text-2xl font-black">{queue.stats.publishedReviews}</p>
              <p className="text-xs text-[var(--tg-hint)]">Published reviews</p>
            </div>
            <div className="card">
              <p className="text-2xl font-black">{queue.stats.users}</p>
              <p className="text-xs text-[var(--tg-hint)]">Accounts</p>
            </div>
          </div>

          <section>
            <SectionTitle>Moderation queue</SectionTitle>
            {queue.reviews.length === 0 ? (
              <EmptyState title="Queue is clear" />
            ) : (
              <div className="space-y-3">
                {queue.reviews.map((review) => {
                  return (
                    <div key={review.id} className="card space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to={targetPath(review.targetType, review.targetCode)}
                            className="text-sm font-semibold"
                          >
                            {review.targetCode} · {review.targetName}
                          </Link>
                          <p className="mt-0.5 text-xs text-[var(--tg-hint)]">
                            {review.alias} · {review.status} · {review.reportCount} reports
                          </p>
                        </div>
                        <span className={review.status === "pending" ? "badge-warning" : "badge-danger"}>
                          {review.status}
                        </span>
                      </div>

                      {review.title ? <p className="text-sm font-semibold">{review.title}</p> : null}
                      {review.body ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--tg-hint)]">{review.body}</p>
                      ) : null}

                      {review.flags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {review.flags.map((flag) => (
                            <span key={flag} className="badge-warning">
                              <IconFlag size={12} />
                              {flag.replaceAll("_", " ").toLowerCase()}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => act(review, "approve")}
                          disabled={busyId === review.id}
                        >
                          <IconCheck size={14} />
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => act(review, "hide")}
                          disabled={busyId === review.id}
                        >
                          <IconAlert size={14} />
                          Hide
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => act(review, "delete")}
                          disabled={busyId === review.id}
                        >
                          <IconTrash size={14} />
                          Remove
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setBanTarget({ id: review.userId, label: review.alias });
                            setBanReason("");
                            setBanError(null);
                          }}
                        >
                          Ban author
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <SectionTitle>Open reports</SectionTitle>
            {queue.reports.length === 0 ? (
              <EmptyState title="No open reports" />
            ) : (
              <div className="space-y-2">
                {queue.reports.map((report) => (
                  <div key={report.id} className="card space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{report.reason.replaceAll("_", " ")}</p>
                        <p className="text-xs text-[var(--tg-hint)]">
                          {report.targetCode} · {report.alias}
                        </p>
                      </div>
                      <span className="chip">{report.status}</span>
                    </div>
                    {report.details ? <p className="text-sm text-[var(--tg-hint)]">{report.details}</p> : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary btn-sm flex-1"
                        onClick={() => resolveReport(report.id, "dismiss")}
                        disabled={busyId === report.id}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className="btn-primary btn-sm flex-1"
                        onClick={() => resolveReport(report.id, "action_taken")}
                        disabled={busyId === report.id}
                      >
                        Action taken
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <Modal open={Boolean(banTarget)} title="Restrict account" onClose={() => setBanTarget(null)}>
        <div className="space-y-4">
          <InlineNotice tone="danger" title="Ban this account">
            {banTarget?.label} will be unable to post reviews or reports. Existing reviews remain until you remove them.
          </InlineNotice>
          <div>
            <label className="label" htmlFor="ban-reason">
              Reason
            </label>
            <input
              id="ban-reason"
              className="input"
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              placeholder="Moderation policy violation"
              maxLength={200}
            />
          </div>
          {banError ? <p className="text-sm text-[var(--tg-danger)]">{banError}</p> : null}
          <button type="button" className="btn-danger w-full" onClick={submitBan} disabled={banBusy}>
            {banBusy ? "Restricting" : "Ban account"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
