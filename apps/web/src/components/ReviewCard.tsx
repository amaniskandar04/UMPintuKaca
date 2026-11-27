import { useState } from "react";
import type { ReviewDto } from "@pintukaca/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { cn, formatMonth } from "../lib/format";
import { IconFlag, IconSpark, IconUser } from "./icons";
import { BadgeChip } from "./BadgeChip";
import { StatusBadge, StarRating } from "./ui";

export function ReviewCard({
  review,
  onReport,
  showStatus = false
}: {
  review: ReviewDto;
  onReport?: () => void;
  showStatus?: boolean;
}) {
  const { user } = useAuth();
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount);
  const [viewerHelpful, setViewerHelpful] = useState(review.viewerHelpful);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overall = review.overall ?? 0;
  const canVote = Boolean(user?.verified && !review.isOwner);

  const toggleHelpful = async () => {
    if (!canVote || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = viewerHelpful ? await api.unhelpful(review.id) : await api.helpful(review.id);
      setHelpfulCount(result.helpfulCount);
      setViewerHelpful(result.viewerHelpful);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your vote.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[var(--tg-hint)]">
            <span className="inline-flex items-center gap-1.5">
              <IconUser size={14} />
              <span className="truncate">{review.alias}</span>
            </span>
            {review.authorLevel > 0 ? <span className="badge-success">Lv {review.authorLevel}</span> : null}
            {review.authorBadges.map((badge) => (
              <BadgeChip key={badge.key} badge={badge} />
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--tg-hint)]">
            <span>{formatMonth(review.createdAt)}</span>
            {review.semesters.length > 0 ? <span>· {review.semesters.join(", ")}</span> : null}
            {review.wouldTakeAgain === true ? <span className="text-[var(--tg-success)]">· ✓ would take again</span> : null}
            {review.wouldTakeAgain === false ? <span>· ✗ would not take again</span> : null}
            {review.updatedAt !== review.createdAt ? <span>· edited</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StarRating value={overall} readOnly size={16} />
          {showStatus ? <StatusBadge status={review.status} /> : null}
        </div>
      </div>

      {review.title ? <h3 className="text-base font-semibold leading-snug">{review.title}</h3> : null}
      {review.body ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--tg-text)]">{review.body}</p> : null}

      {review.scores.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {review.scores.map((score) => (
            <span key={score.key} className="chip">
              {score.label} <strong className="text-[var(--tg-text)]">{score.score}</strong>
            </span>
          ))}
        </div>
      ) : null}

      {review.flags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {review.flags.map((flag) => (
            <span key={flag} className="badge-warning">
              {flag.replaceAll("_", " ").toLowerCase()}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {canVote ? (
          <button
            type="button"
            className={cn(
              "chip transition",
              viewerHelpful && "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-link)]"
            )}
            onClick={() => void toggleHelpful()}
            disabled={busy}
            aria-pressed={viewerHelpful}
          >
            <IconSpark size={14} />
            Helpful {helpfulCount}
          </button>
        ) : (
          <span className="chip">
            <IconSpark size={14} />
            Helpful {helpfulCount}
          </span>
        )}
        {onReport ? (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--tg-hint)] transition hover:text-[var(--tg-danger)]"
            onClick={onReport}
          >
            <IconFlag size={14} />
            Report
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[var(--tg-danger)]">{error}</p> : null}
    </article>
  );
}

