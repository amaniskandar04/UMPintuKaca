import { useState } from "react";
import { REPORT_REASONS } from "@um-reviews/shared";
import { api } from "../lib/api";
import { Modal } from "./ui";

export function ReportDialog({
  reviewId,
  open,
  onClose
}: {
  reviewId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    setBusy(false);
    setError(null);
    setDone(false);
    setDetails("");
    setReason("harassment");
    onClose();
  };

  const submit = async () => {
    if (!reviewId) return;
    setBusy(true);
    setError(null);
    try {
      await api.reportReview(reviewId, reason, details);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Report review" onClose={close}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-[var(--tg-hint)]">
            Thanks. The moderation team will review this report. The review may be hidden automatically if enough
            students report it.
          </p>
          <button type="button" className="btn-primary w-full" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="report-reason">
              Reason
            </label>
            <select
              id="report-reason"
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            >
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="report-details">
              Details (optional)
            </label>
            <textarea
              id="report-details"
              className="input min-h-24 resize-y"
              maxLength={500}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Add context for the moderators"
            />
          </div>
          {error ? <p className="text-sm text-[var(--tg-danger)]">{error}</p> : null}
          <button type="button" className="btn-primary w-full" onClick={submit} disabled={busy}>
            {busy ? "Submitting" : "Submit report"}
          </button>
        </div>
      )}
    </Modal>
  );
}
