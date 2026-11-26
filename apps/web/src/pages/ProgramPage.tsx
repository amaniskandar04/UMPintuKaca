import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProgramDetailDto, ReviewDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { cn, formatAverage, pluralize } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { ReviewCard } from "../components/ReviewCard";
import { ReportDialog } from "../components/ReportDialog";
import { IconPlus, IconSpark } from "../components/icons";
import { EmptyState, ErrorState, PageHeader, RatingBar, Spinner, StarRating } from "../components/ui";

export function ProgramPage() {
  const { code = "" } = useParams();
  const { user } = useAuth();
  const [program, setProgram] = useState<ProgramDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"newest" | "helpful">("newest");
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    api
      .program(code, 1, sort)
      .then((result) => {
        if (!cancelled) setProgram(result.program);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load this programme.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, sort]);

  const loadMore = async () => {
    if (!program) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await api.program(code, next, sort);
      setProgram({
        ...result.program,
        reviews: [...program.reviews, ...result.program.reviews]
      });
      setPage(next);
    } catch {
      void 0;
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <Spinner label="Loading programme" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!program) return <EmptyState title="Programme not found" />;

  const overall = program.stats.overall;
  const canReport = (review: ReviewDto) => !review.canEdit;

  return (
    <div>
      <PageHeader title={program.code} subtitle={program.name} back />
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--tg-hint)]">{program.faculty}</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-black leading-none">{formatAverage(overall.avg)}</span>
              <span className="pb-1 text-xs text-[var(--tg-hint)]">/ 5</span>
            </div>
            <div className="mt-1">
              <StarRating value={overall.avg} readOnly size={16} />
            </div>
            <p className="mt-1 text-xs text-[var(--tg-hint)]">
              {pluralize(overall.count, "review")} · {program.level}
            </p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-link)]">
            <IconSpark size={24} />
          </span>
        </div>
        {program.stats.dimensions.length > 0 ? (
          <div className="mt-4 space-y-3">
            {program.stats.dimensions.map((dimension) => (
              <RatingBar
                key={dimension.key}
                label={dimension.label}
                value={dimension.avg}
                count={dimension.count}
                lowLabel={dimension.lowLabel}
                highLabel={dimension.highLabel}
              />
            ))}
          </div>
        ) : null}
      </div>

      <Link
        to={user?.verified ? `/write/program/${program.code}` : "/verify"}
        className="btn-primary mb-5 w-full"
      >
        <IconPlus size={18} />
        {user?.verified ? "Review this programme" : "Verify to write a review"}
      </Link>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Student reviews</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={cn("chip", sort === "newest" && "border-[var(--brand)] text-[var(--brand-link)]")}
            onClick={() => setSort("newest")}
          >
            Newest
          </button>
          <button
            type="button"
            className={cn("chip", sort === "helpful" && "border-[var(--brand)] text-[var(--brand-link)]")}
            onClick={() => setSort("helpful")}
          >
            Helpful
          </button>
          <span className="ml-1 text-xs text-[var(--tg-hint)]">{program.reviews.length} shown</span>
        </div>
      </div>

      {program.reviews.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="Be the first verified student to review this programme."
          action={
            <Link to={user?.verified ? `/write/program/${program.code}` : "/verify"} className="btn-secondary btn-sm">
              {user?.verified ? "Write a review" : "Verify to review"}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {program.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onReport={canReport(review) ? () => setReportId(review.id) : undefined}
            />
          ))}
          {program.hasMore ? (
            <button type="button" className="btn-secondary w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading" : "Load more reviews"}
            </button>
          ) : null}
        </div>
      )}

      <ReportDialog reviewId={reportId} open={Boolean(reportId)} onClose={() => setReportId(null)} />
    </div>
  );
}
