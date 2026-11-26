interface RatingHistogramProps {
  /** Counts for scores 1..5. */
  buckets: number[];
  total: number;
}

/**
 * A 5-star distribution. An average alone hides whether everyone landed on 3 or
 * half the cohort loved it and half hated it.
 */
export function RatingHistogram({ buckets, total }: RatingHistogramProps) {
  return (
    <div className="mt-4 space-y-1">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = buckets[star - 1] ?? 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-[11px] text-[var(--tg-hint)]">
            <span className="w-3 shrink-0 text-right font-semibold">{star}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--brand-soft)]">
              <div
                className="h-full rounded-full bg-[var(--brand)] transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="w-7 shrink-0 tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
