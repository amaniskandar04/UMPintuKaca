import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PROGRAM_LEVELS, type CategoryDto, type CourseDto, type EntityDto, type ProgramDto } from "@um-reviews/shared";
import { api } from "../lib/api";
import { cn, facultyLabel, formatAverage, targetPath } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { IconCheck, IconChevronRight, IconSearch, IconStar } from "../components/icons";
import { EmptyState, ErrorState, InlineNotice, SkeletonCard, StarRating } from "../components/ui";

type Tab = "courses" | "programs" | "clubs" | "places";

export function HomePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("courses");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [faculty, setFaculty] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [faculties, setFaculties] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [programs, setPrograms] = useState<ProgramDto[]>([]);
  const [entities, setEntities] = useState<EntityDto[]>([]);
  const [places, setPlaces] = useState<EntityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api
      .faculties()
      .then((result) => setFaculties(result.faculties))
      .catch(() => setFaculties([]));
  }, []);

  useEffect(() => {
    setCategory("");
    if (tab === "places") setFaculty("");
    if (tab !== "programs") setLevel("");
    if (tab !== "clubs" && tab !== "places") {
      setCategories([]);
      return;
    }
    api
      .categories(tab === "clubs" ? "club" : "place")
      .then((result) => setCategories(result.categories))
      .catch(() => setCategories([]));
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request =
      tab === "courses"
        ? api.courses(submittedQuery, faculty).then((result) => {
            if (!cancelled) setCourses(result.courses);
          })
        : tab === "programs"
          ? api.programs(submittedQuery, faculty, level).then((result) => {
              if (!cancelled) setPrograms(result.programs);
            })
          : tab === "clubs"
            ? api.entities("club", submittedQuery, faculty, category).then((result) => {
                if (!cancelled) setEntities(result.entities);
              })
            : api.entities("place", submittedQuery, "", category).then((result) => {
                if (!cancelled) setPlaces(result.entities);
              });
    request
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load results.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, submittedQuery, faculty, category, level, reloadKey]);

  const items = useMemo(
    () =>
      tab === "courses"
        ? courses
        : tab === "programs"
          ? programs
          : tab === "clubs"
            ? entities
            : places,
    [tab, courses, programs, entities, places]
  );
  const hasFilters = Boolean(submittedQuery || faculty || category || level);
  const clearFilters = () => {
    setQuery("");
    setSubmittedQuery("");
    setFaculty("");
    setLevel("");
    setCategory("");
  };

  const submitSearch = () => {
    setSubmittedQuery(query.trim());
  };

  const showFacultyFilter = faculties.length > 0 && tab !== "places";
  const showLevelFilter = tab === "programs";
  const showCategoryFilter = (tab === "clubs" || tab === "places") && categories.length > 0;
  const filterCount = Number(showFacultyFilter) + Number(showLevelFilter) + Number(showCategoryFilter);

  return (
    <div>
      <header className="hero safe-top -mx-4 mb-4 px-4 pb-5 pt-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="brand-mark">
              <IconStar size={18} className="fill-current" />
            </span>
            <div className="leading-tight">
              <p className="hero-title text-lg font-extrabold tracking-tight">UM Reviews</p>
              <p className="text-[11px] font-medium text-white/75">Glassdoor for UM students</p>
            </div>
          </div>
          {user?.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white">
              <IconCheck size={13} /> Verified
            </span>
          ) : (
            <Link
              to="/verify"
              className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--brand-strong)]"
            >
              Verify
            </Link>
          )}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-white/85">
          Anonymous reviews for UM courses, programmes, clubs, and campus places.
        </p>
        <form
          className="mt-4 flex items-stretch gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch size={18} />
            </span>
            <input
              className="w-full rounded-xl border border-transparent bg-white py-3 pl-10 pr-4 text-sm text-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-white/70"
              placeholder={
                tab === "courses"
                  ? "Search course code, name, department…"
                  : tab === "programs"
                    ? "Search programme, faculty, or level…"
                    : tab === "clubs"
                      ? "Search club, acronym, category…"
                      : "Search facility, service, or category…"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-xl bg-white px-4 text-sm font-bold text-[var(--brand-strong)] shadow-lg transition active:scale-[0.98]"
          >
            Search
          </button>
        </form>
        <details className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/85">
          <summary className="cursor-pointer font-semibold text-white">Advanced search</summary>
          <p className="mt-2 leading-relaxed">
            Quote phrases, filter with <span className="font-mono">code:PEKOM</span>,{" "}
            <span className="font-mono">faculty:engineering</span>, <span className="font-mono">category:sports</span>,
            and exclude with <span className="font-mono">-word</span>. Typos are matched automatically.
          </p>
        </details>
      </header>

      {!user?.verified ? (
        <div className="mb-4">
          <InlineNotice tone="warning" title="Verify to review">
            Link your SiswaMail account once. It is never shown to other students.{" "}
            <Link to="/verify" className="font-semibold underline">
              Verify now
            </Link>
          </InlineNotice>
        </div>
      ) : null}

      <div className="segmented mb-3">
        {(["courses", "programs", "clubs", "places"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg px-2 py-2 text-sm font-semibold capitalize transition",
              tab === value ? "bg-[var(--brand)] text-white shadow-sm" : "text-[var(--tg-hint)]"
            )}
          >
            {value === "places" ? "Campus" : value}
          </button>
        ))}
      </div>

      {filterCount > 0 ? (
        <div className={cn("mb-4 grid gap-2", filterCount > 1 && "sm:grid-cols-2")}>
          {showFacultyFilter ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--tg-hint)]">
                Faculty
              </span>
              <select className="select" value={faculty} onChange={(event) => setFaculty(event.target.value)}>
                <option value="">All faculties</option>
                {faculties.map((value) => (
                  <option key={value} value={value}>
                    {facultyLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showLevelFilter ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--tg-hint)]">
                Level
              </span>
              <select className="select" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="">All levels</option>
                {PROGRAM_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showCategoryFilter ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--tg-hint)]">
                Category
              </span>
              <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.value} ({item.count})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && hasFilters ? (
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-[var(--tg-hint)]">
          <span>
            Showing {items.length} result{items.length === 1 ? "" : "s"}
            {submittedQuery ? ` for “${submittedQuery}”` : ""}
          </span>
          <button type="button" className="font-semibold text-[var(--brand-link)]" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setReloadKey((value) => value + 1)} />
      ) : items.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No results" : "Nothing here yet"}
          description={
            hasFilters
              ? `No matches for ${query ? `“${query}”` : "these filters"}. Try a shorter query, a different spelling, or clear the filters.`
              : "No entries are available yet. The catalogue may still be loading."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {tab === "courses"
            ? courses.map((course) => (
                <Link key={course.id} to={`/course/${course.code}`} className="card block active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold tracking-wide">{course.code}</p>
                      <p className="mt-0.5 truncate text-sm">{course.name}</p>
                      <p className="mt-1 truncate text-xs text-[var(--tg-hint)]">{course.faculty}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="rating-pill">
                        <IconStar size={13} className="fill-current" />
                        {formatAverage(course.stats.overall.avg)}
                      </span>
                      <p className="mt-1 text-[11px] text-[var(--tg-hint)]">{course.stats.overall.count} reviews</p>
                    </div>
                  </div>
                </Link>
              ))
            : tab === "programs"
              ? programs.map((program) => (
                  <Link key={program.id} to={`/program/${program.code}`} className="card block active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold tracking-wide">{program.code}</p>
                        <p className="mt-0.5 truncate text-sm">{program.name}</p>
                        <p className="mt-1 truncate text-xs text-[var(--tg-hint)]">
                          <span className="capitalize">{program.level}</span> · {program.faculty}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <StarRating value={program.stats.overall.avg} readOnly size={14} />
                        <p className="mt-0.5 text-[11px] text-[var(--tg-hint)]">
                          {formatAverage(program.stats.overall.avg)} · {program.stats.overall.count}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              : (tab === "clubs" ? entities : places).map((entity) => (
                  <Link
                    key={entity.id}
                    to={targetPath(tab === "clubs" ? "club" : "place", entity.code)}
                    className="card block active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold tracking-wide">{entity.code}</p>
                        <p className="mt-0.5 truncate text-sm">{entity.name}</p>
                        <p className="mt-1 truncate text-xs text-[var(--tg-hint)]">
                          {tab === "places"
                            ? entity.category ?? "Campus place"
                            : `${entity.category ? `${entity.category} · ` : ""}${entity.faculty ?? "University-wide"}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="rating-pill">
                          <IconStar size={13} className="fill-current" />
                          {formatAverage(entity.stats.overall.avg)}
                        </span>
                        <p className="mt-1 text-[11px] text-[var(--tg-hint)]">
                          {entity.stats.overall.count} reviews
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center gap-1 text-xs text-[var(--tg-hint)]">
        <span>Browse</span>
        <IconChevronRight size={12} />
        <Link to="/guidelines" className="underline">
          Community guidelines
        </Link>
      </div>
    </div>
  );
}
