import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  MAX_REVIEW_BODY,
  MAX_REVIEW_TITLE,
  SEMESTERS,
  type CourseDetailDto,
  type EntityDetailDto,
  type MyReviewDto,
  type ProgramDetailDto,
  type TargetType
} from "@um-reviews/shared";
import { api } from "../lib/api";
import { cn } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { confirmAction, haptic } from "../lib/telegram";
import {
  EmptyState,
  ErrorState,
  InlineNotice,
  PageHeader,
  Spinner,
  StarRating,
  StatusBadge
} from "../components/ui";

export function WriteReviewPage() {
  const { targetType = "", code = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromOnboarding = new URLSearchParams(location.search).get("from") === "onboarding";
  const { user } = useAuth();
  const type =
    targetType === "program"
      ? "program"
      : targetType === "course"
        ? "course"
        : targetType === "club"
          ? "club"
          : targetType === "place"
            ? "place"
            : null;
  const [target, setTarget] = useState<CourseDetailDto | ProgramDetailDto | EntityDetailDto | null>(null);
  const [existing, setExisting] = useState<MyReviewDto | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [overall, setOverall] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [semesters, setSemesters] = useState<string[]>([]);
  const [wouldTakeAgain, setWouldTakeAgain] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!type) {
      setLoadError("Unknown review target.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const targetRequest =
      type === "course"
        ? api.course(code, 1).then((result) => result.course)
        : type === "program"
          ? api.program(code, 1).then((result) => result.program)
          : api.entity(type, code, 1).then((result) => result.entity);

    Promise.all([targetRequest, api.myReviews()])
      .then(([loadedTarget, mine]) => {
        if (cancelled) return;
        setTarget(loadedTarget);
        const found =
          mine.reviews.find(
            (review) => review.targetType === type && review.targetCode.toUpperCase() === code.toUpperCase()
          ) ?? null;
        setExisting(found);

        const initialScores: Record<string, number> = {};
        const validKeys = new Set(loadedTarget.stats.dimensions.map((dimension) => dimension.key));
        for (const dimension of loadedTarget.stats.dimensions) initialScores[dimension.key] = 0;
        for (const score of found?.scores ?? []) {
          if (validKeys.has(score.key)) initialScores[score.key] = score.score;
        }
        setScores(initialScores);
        setOverall(found?.overall ?? 0);
        setTitle(found?.title ?? "");
        setBody(found?.body ?? "");
        setSemesters(found?.semesters ?? []);
        setWouldTakeAgain(found?.wouldTakeAgain ?? null);
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "Could not load this page.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [type, code]);

  const dimensions = target?.stats.dimensions ?? [];
  const editable = !existing || existing.canEdit;

  const backToTarget = () => {
    if (fromOnboarding) {
      navigate("/onboarding");
      return;
    }
    if (type === "course") navigate(`/course/${code}`);
    else navigate(`/program/${code}`);
  };

  const submit = async () => {
    if (!type) return;
    setError(null);
    const filteredScores: Record<string, number> = {};
    for (const [key, value] of Object.entries(scores)) if (value > 0) filteredScores[key] = value;
    if (!overall) {
      setError("Choose an overall rating before submitting.");
      return;
    }
    if (!agreed) {
      setError("Please confirm that your review follows the community guidelines.");
      return;
    }

    setBusy(true);
    try {
      if (existing) {
        await api.updateReview(existing.id, {
          title: title || null,
          body: body || null,
          semesters,
          wouldTakeAgain,
          overall,
          scores: filteredScores
        });
      } else {
        await api.createReview({
          targetType: type,
          targetCode: code,
          title: title || null,
          body: body || null,
          semesters,
          wouldTakeAgain,
          overall,
          scores: filteredScores
        });
      }
      haptic("success");
      backToTarget();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the review.");
      haptic("error");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    confirmAction("Delete this review permanently?", () => {
      void (async () => {
        setBusy(true);
        try {
          await api.deleteReview(existing.id);
          haptic("success");
          backToTarget();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Could not delete the review.");
        } finally {
          setBusy(false);
        }
      })();
    });
  };

  if (loading) return <Spinner label="Preparing review" />;
  if (loadError) return <ErrorState message={loadError} onRetry={() => window.location.reload()} />;
  if (!target) return <EmptyState title="Not found" />;

  if (!user?.verified) {
    return (
      <div>
        <PageHeader title="Verify first" back />
        <EmptyState
          title="SiswaMail verification required"
          description="Only verified UM students can post reviews. Verification is one-time and your email is never shown."
          action={
            <Link to="/verify" className="btn-primary btn-sm">
              Verify with SiswaMail
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={existing ? "Edit review" : "Write a review"}
        subtitle={`${type === "course" ? "Course" : type === "program" ? "Programme" : "Club"} ${code} · ${target.name}`}
        back
      />

      {existing ? (
        <div className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-[var(--tg-hint)]">Your review status</span>
            <StatusBadge status={existing.status} />
          </div>
          {!editable ? (
            <InlineNotice tone="warning" title="Edit window closed">
              Reviews can be edited for 30 days. You can still delete your review below.
            </InlineNotice>
          ) : null}
          {existing.status === "hidden" ? (
            <InlineNotice tone="danger" title="Hidden after moderation">
              This review is hidden from other students. Editing it will not publish it automatically. A moderator must
              approve it again.
            </InlineNotice>
          ) : existing.status === "pending" || existing.flags.length > 0 ? (
            <InlineNotice tone="warning" title="Held for moderation">
              This review was flagged for a manual check. It remains visible only to you until approved.
            </InlineNotice>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="card space-y-3">
          <div>
            <p className="mb-1 text-sm font-semibold">Overall rating</p>
            <p className="text-xs text-[var(--tg-hint)]">This is the score other students see.</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <StarRating value={overall} onChange={setOverall} size={34} />
            <span className="text-xs text-[var(--tg-hint)]">{overall ? `${overall} / 5` : "Tap to rate"}</span>
          </div>
        </div>

        {dimensions.length > 0 ? (
          <div className="card space-y-4">
            <div>
              <p className="mb-1 text-sm font-semibold">Details (optional)</p>
              <p className="text-xs text-[var(--tg-hint)]">
                Rate the parts you can judge. These show on your review but don&apos;t change the overall score.
              </p>
            </div>
            {dimensions.map((dimension) => (
              <div key={dimension.key} className="flex items-start justify-between gap-3">
                <span className="pt-1 text-sm">{dimension.label}</span>
                <div className="flex flex-col items-end gap-1">
                  <StarRating
                    value={scores[dimension.key] ?? 0}
                    onChange={(value) => setScores((current) => ({ ...current, [dimension.key]: value }))}
                    size={24}
                  />
                  {dimension.lowLabel || dimension.highLabel ? (
                    <div className="flex w-[156px] justify-between text-[10px] leading-tight text-[var(--tg-hint)]">
                      <span>{dimension.lowLabel ?? ""}</span>
                      <span className="text-right">{dimension.highLabel ?? ""}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="card space-y-3">
          <div>
            <label className="label" htmlFor="review-title">
              Title (optional)
            </label>
            <input
              id="review-title"
              className="input"
              maxLength={MAX_REVIEW_TITLE}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="A short headline"
              disabled={!editable}
            />
          </div>
          <div>
            <label className="label" htmlFor="review-body">
              Your review (optional)
            </label>
            <textarea
              id="review-body"
              className="input min-h-36 resize-y"
              maxLength={MAX_REVIEW_BODY}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What should other students know? Do not name lecturers or students."
              disabled={!editable}
            />
            <p className="mt-1 text-right text-[11px] text-[var(--tg-hint)]">
              {body.length}/{MAX_REVIEW_BODY}
            </p>
          </div>
          {type === "course" ? (
            <div>
              <label className="label" htmlFor="review-semester">
                Semester taken
              </label>
              <select
                id="review-semester"
                className="input"
                value={semesters[0] ?? ""}
                onChange={(event) => setSemesters(event.target.value ? [event.target.value] : [])}
                disabled={!editable}
              >
                <option value="">Not specified</option>
                {SEMESTERS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ) : type === "club" ? (
            <div>
              <span className="label">Semesters involved</span>
              <div className="flex flex-wrap gap-1.5">
                {SEMESTERS.map((value) => {
                  const active = semesters.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={cn(
                        "chip",
                        active && "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-link)]"
                      )}
                      disabled={!editable}
                      onClick={() =>
                        setSemesters((current) =>
                          current.includes(value)
                            ? current.filter((item) => item !== value)
                            : [...current, value].slice(0, 8)
                        )
                      }
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-[var(--tg-hint)]">Pick every semester you were a member.</p>
            </div>
          ) : null}
          {type === "course" ? (
            <div>
              <span className="label">Would you take this course again?</span>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  className={cn(
                    "chip",
                    wouldTakeAgain === true && "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-link)]"
                  )}
                  onClick={() => setWouldTakeAgain(wouldTakeAgain === true ? null : true)}
                  disabled={!editable}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={cn(
                    "chip",
                    wouldTakeAgain === false && "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-link)]"
                  )}
                  onClick={() => setWouldTakeAgain(wouldTakeAgain === false ? null : false)}
                  disabled={!editable}
                >
                  No
                </button>
                {wouldTakeAgain !== null ? (
                  <button type="button" className="text-xs text-[var(--tg-hint)] underline" onClick={() => setWouldTakeAgain(null)} disabled={!editable}>
                    Skip
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <label className="flex items-start gap-3 text-xs leading-relaxed text-[var(--tg-hint)]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--tg-button)]"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              disabled={!editable}
            />
            <span>
              My review follows the{" "}
              <Link to="/guidelines" className="underline">
                community guidelines
              </Link>
              . I am not naming individuals or posting private information.
            </span>
          </label>
        </div>

        {error ? <InlineNotice tone="danger" title="Could not save">{error}</InlineNotice> : null}

        <button type="button" className="btn-primary w-full" onClick={submit} disabled={busy || !editable}>
          {busy ? "Saving" : existing ? "Update review" : "Submit review"}
        </button>

        {existing ? (
          <button type="button" className="btn-danger w-full" onClick={remove} disabled={busy}>
            Delete review
          </button>
        ) : null}

        <p className="px-2 text-center text-[11px] leading-relaxed text-[var(--tg-hint)]">
          Your review is shown under an anonymous alias. Do not include your name, email, or student ID.
        </p>
      </div>
    </div>
  );
}
