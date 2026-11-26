import { Link } from "react-router-dom";
import type { ReviewAccessDto } from "@um-reviews/shared";
import { IconLock, IconPlus } from "./icons";

interface LockedReviewsProps {
  access: ReviewAccessDto;
  courseCode: string;
  verified: boolean;
}

export function LockedReviews({ access, courseCode, verified }: LockedReviewsProps) {
  const remaining = Math.max(0, access.required - access.submitted);
  const progress = Math.min(100, Math.round((access.submitted / access.required) * 100));

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-link)]">
          <IconLock size={20} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold">Reviews are locked</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--tg-hint)]">
            Post {access.required} course reviews with a short written note in the last {access.windowDays} days to read
            what students say. Averages stay visible — only the written reviews are earned.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold">
            {access.submitted} of {access.required} posted
          </span>
          <span className="text-[var(--tg-hint)]">
            {remaining === 0 ? "Unlocked" : `${remaining} to go`}
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--brand-soft)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={access.required}
          aria-valuenow={access.submitted}
        >
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--tg-hint)]">
          Only course reviews with a written note count, and they expire on a rolling {access.windowDays}-day basis.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <Link
          to={verified ? `/write/course/${courseCode}` : "/verify"}
          className="btn-primary w-full"
        >
          <IconPlus size={18} />
          {verified ? "Rate this course" : "Verify to start reviewing"}
        </Link>
        <Link to="/" className="btn-secondary w-full">
          Find another course you&apos;ve taken
        </Link>
      </div>
    </div>
  );
}
