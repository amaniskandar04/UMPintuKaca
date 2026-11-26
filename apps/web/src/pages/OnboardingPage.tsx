import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CourseDto, ReviewAccessDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { facultyLabel } from "../lib/format";
import { ErrorState, PageHeader, Spinner } from "../components/ui";

/**
 * First-run flow: the review gate doubles as onboarding. Instead of presenting
 * a lock on an empty app, ask for the two reviews directly.
 */
export function OnboardingPage() {
  const { user } = useAuth();
  const [access, setAccess] = useState<ReviewAccessDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .reviewAccess()
      .then((result) => {
        if (!cancelled) setAccess(result.access);
      })
      .catch(() => void 0)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSearching(true);
    api
      .courses(submitted, "")
      .then((result) => {
        if (!cancelled) setCourses(result.courses);
      })
      .catch(() => {
        if (!cancelled) setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [submitted]);

  if (loading) return <Spinner label="Loading" />;
  if (!user) return <ErrorState message="Open this app from Telegram to continue." />;

  const required = access?.required ?? 2;
  const submittedCount = access?.submitted ?? 0;
  const windowDays = access?.windowDays ?? 60;
  const unlocked = access ? !access.locked : false;
  const remaining = Math.max(0, required - submittedCount);
  const progress = Math.min(100, Math.round((submittedCount / required) * 100));

  return (
    <div>
      <PageHeader title="Get started" subtitle={unlocked ? "You're in" : "Two reviews unlock everything"} back />

      <div className="card mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tg-hint)]">
              {unlocked ? "Reviews unlocked" : `${submittedCount} of ${required} written`}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {unlocked
                ? "You can read every review. Keep contributing and your points will climb."
                : `Write ${required} short course reviews and you can read what everyone else said. Each one needs a sentence or two, and they count for ${windowDays} days.`}
            </p>
          </div>
          <span className="text-2xl font-black text-[var(--brand-link)]">{unlocked ? "✓" : `${submittedCount}/${required}`}</span>
        </div>
        <div className="bar-track mt-4">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {unlocked ? (
        <Link to="/" className="btn-primary w-full">
          Browse reviews
        </Link>
      ) : !user.verified ? (
        <div className="card text-sm">
          <p className="text-[var(--tg-hint)]">Verify your SiswaMail account first, then come back here.</p>
          <Link to="/verify" className="btn-primary mt-3 w-full">
            Verify my account
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-3">
            <p className="mb-2 text-sm font-semibold">Which courses have you taken?</p>
            <form
              className="flex items-stretch gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(draft.trim());
              }}
            >
              <input
                className="input flex-1"
                placeholder="Course code or name…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              <button type="submit" className="btn-secondary shrink-0">
                Search
              </button>
            </form>
            <p className="mt-2 text-[11px] text-[var(--tg-hint)]">
              {remaining} to go · {windowDays}-day window
            </p>
          </div>

          {searching ? (
            <p className="text-xs text-[var(--tg-hint)]">Searching…</p>
          ) : (
            <div className="space-y-2">
              {courses.slice(0, 12).map((course) => (
                <Link
                  key={course.id}
                  to={`/write/course/${course.code}?from=onboarding`}
                  className="card flex items-center justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-[var(--tg-hint)]">{course.code}</span>
                    <span className="block truncate text-sm font-semibold">{course.name}</span>
                    <span className="block truncate text-[11px] text-[var(--tg-hint)]">{facultyLabel(course.faculty)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--brand-link)]">Rate →</span>
                </Link>
              ))}
              {courses.length === 0 ? (
                <p className="text-xs text-[var(--tg-hint)]">No courses matched. Try a different code or name.</p>
              ) : null}
            </div>
          )}

          <Link to="/" className="mt-4 block text-center text-xs text-[var(--tg-hint)] underline">
            Skip for now
          </Link>
        </>
      )}
    </div>
  );
}
