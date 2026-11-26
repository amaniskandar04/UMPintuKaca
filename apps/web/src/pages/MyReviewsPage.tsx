import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { MyReviewDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { targetPath, targetTypeLabel } from "../lib/format";
import { confirmAction } from "../lib/telegram";
import { ReviewCard } from "../components/ReviewCard";
import { IconEdit, IconPlus, IconTrash } from "../components/icons";
import { EmptyState, ErrorState, PageHeader, SkeletonCard } from "../components/ui";

export function MyReviewsPage() {
  const [reviews, setReviews] = useState<MyReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.myReviews();
      setReviews(result.reviews);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = (review: MyReviewDto) => {
    confirmAction("Delete this review permanently?", () => {
      void (async () => {
        try {
          await api.deleteReview(review.id);
          setReviews((current) => current.filter((item) => item.id !== review.id));
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Could not delete the review.");
        }
      })();
    });
  };

  return (
    <div>
      <PageHeader
        title="My reviews"
        subtitle="Anonymous to everyone else. You can edit within 30 days."
        right={
          <Link to="/" className="btn-secondary btn-sm">
            <IconPlus size={14} />
            New
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : reviews.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="Your reviews will appear here. Open a course, programme, or club to write your first one."
          action={
            <Link to="/" className="btn-primary btn-sm">
              Browse
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Link
                  to={targetPath(review.targetType, review.targetCode)}
                  className="text-sm font-semibold"
                >
                  {review.targetCode} · {review.targetName}
                </Link>
                <span className="text-xs text-[var(--tg-hint)]">{targetTypeLabel(review.targetType)}</span>
              </div>
              <ReviewCard review={review} showStatus />
              <div className="flex gap-2">
                {review.canEdit ? (
                  <Link
                    to={`/write/${review.targetType}/${review.targetCode}`}
                    className="btn-secondary btn-sm flex-1"
                  >
                    <IconEdit size={14} />
                    Edit
                  </Link>
                ) : (
                  <span className="chip flex-1 justify-center">Edit window closed</span>
                )}
                <button type="button" className="btn-danger btn-sm flex-1" onClick={() => remove(review)}>
                  <IconTrash size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
