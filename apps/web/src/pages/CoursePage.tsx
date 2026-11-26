import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CourseDetailDto, ReviewDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { cn, facultyLabel, formatAverage, pluralize } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { ReviewCard } from "../components/ReviewCard";
import { LockedReviews } from "../components/LockedReviews";
import { RatingHistogram } from "../components/RatingHistogram";
import { CourseQuestions } from "../components/CourseQuestions";
import { ReportDialog } from "../components/ReportDialog";
import { IconPlus, IconStar } from "../components/icons";
import { EmptyState, ErrorState, PageHeader, RatingBar, Spinner, StarRating } from "../components/ui";

export function CoursePage() {
  const { code = "" } = useParams();
  const { user } = useAuth();
  const [course, setCourse] = useState<CourseDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"newest" | "helpful">("newest");
  const [semester, setSemester] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);
    api
      .course(code, 1, sort, semester)
      .then((result) => {
        if (!cancelled) setCourse(result.course);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load this course.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, sort, semester]);

  const loadMore = async () => {
    if (!course) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await api.course(code, next, sort, semester);
      setCourse({
        ...result.course,
        reviews: [...course.reviews, ...result.course.reviews]
      });
      setPage(next);
    } catch {
      void 0;
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <Spinner label="Loading course" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!course) return <EmptyState title="Course not found" />;

  const overall = course.stats.overall;
  const canReport = (review: ReviewDto) => !review.canEdit;

  return (
    <div>
      <PageHeader title={course.code} subtitle={course.name} back />
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-[var(--tg-hint)]">{course.faculty}</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-black leading-none">{formatAverage(overall.avg)}</span>
              <span className="pb-1 text-xs text-[var(--tg-hint)]">/ 5</span>
            </div>
            <div className="mt-1">
              <StarRating value={overall.avg} readOnly size={16} />
            </div>
            <p className="mt-1 text-xs text-[var(--tg-hint)]">
              {pluralize(overall.count, "review")}
              {course.credits ? ` · ${course.credits} credits` : ""}
            </p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-link)]">
            <IconStar size={24} />
          </span>
        </div>
        {course.stats.dimensions.length > 0 ? (
          <div className="mt-4 space-y-3">
            {course.stats.dimensions.map((dimension) => (
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

        {course.ratingDistribution.total > 0 ? (
          <RatingHistogram buckets={course.ratingDistribution.buckets} total={course.ratingDistribution.total} />
        ) : null}

        {course.wouldTakeAgain || course.facultyPercentile ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {course.wouldTakeAgain ? (
              <span className="chip">
                <strong className="mr-1">{course.wouldTakeAgain.percent}%</strong>
                would take again
                <span className="ml-1 opacity-60">({course.wouldTakeAgain.total})</span>
              </span>
            ) : null}
            {course.facultyPercentile ? (
              <span className="chip">
                Harder than {course.facultyPercentile.percentile}% of{" "}
                {facultyLabel(course.facultyPercentile.faculty)} courses
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link
        to={user?.verified ? `/write/course/${course.code}` : "/verify"}
        className="btn-primary mb-5 w-full"
      >
        <IconPlus size={18} />
        {user?.verified ? "Write a review" : "Verify to write a review"}
      </Link>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">Student reviews</h2>
        {course.reviewAccess.locked ? (
          <span className="text-xs text-[var(--tg-hint)]">Locked</span>
        ) : (
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
            <span className="ml-1 text-xs text-[var(--tg-hint)]">{course.reviews.length} shown</span>
          </div>
        )}
      </div>

      {!course.reviewAccess.locked && course.semesters.length > 1 ? (
        <div className="mb-3">
          <select className="select" value={semester} onChange={(event) => setSemester(event.target.value)}>
            <option value="">All semesters</option>
            {course.semesters.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {course.reviewAccess.locked ? (
        <LockedReviews access={course.reviewAccess} courseCode={course.code} verified={Boolean(user?.verified)} />
      ) : course.reviews.length === 0 ? (
        <EmptyState
          title={semester ? "No reviews for this semester" : "No reviews yet"}
          description={
            semester
              ? "Try another semester, or clear the filter to see everything."
              : "Be the first verified student to review this course."
          }
          action={
            <Link to={user?.verified ? `/write/course/${course.code}` : "/verify"} className="btn-secondary btn-sm">
              {user?.verified ? "Write a review" : "Verify to review"}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {course.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onReport={canReport(review) ? () => setReportId(review.id) : undefined}
            />
          ))}
          {course.hasMore ? (
            <button type="button" className="btn-secondary w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading" : "Load more reviews"}
            </button>
          ) : null}
        </div>
      )}

      <CourseQuestions courseCode={course.code} />

      <ReportDialog reviewId={reportId} open={Boolean(reportId)} onClose={() => setReportId(null)} />
    </div>
  );
}
