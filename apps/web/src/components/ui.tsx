import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ReviewStatus } from "@um-reviews/shared";
import { cn } from "../lib/format";
import { IconAlert, IconChevronLeft, IconStar } from "./icons";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-[var(--tg-hint)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--tg-border)] border-t-[var(--tg-button)]" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}

export function LoadingScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
  back = false
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <header className="safe-top flex items-start gap-3 px-4 pb-3 pt-4">
      {back ? (
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-link)]"
          aria-label="Back"
        >
          <IconChevronLeft size={18} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-xs leading-relaxed text-[var(--tg-hint)]">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 22
}: {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((score) => {
        const filled = score <= Math.round(value);
        if (readOnly) {
          return (
            <span key={score} className={filled ? "text-[var(--brand)]" : "text-[var(--tg-hint)]"}>
              <IconStar size={size} className={filled ? "fill-current" : ""} />
            </span>
          );
        }
        return (
          <button
            key={score}
            type="button"
            onClick={() => onChange?.(score)}
            className={cn(
              "rounded-lg p-0.5 transition active:scale-95",
              filled ? "text-[var(--brand)]" : "text-[var(--tg-hint)]"
            )}
            aria-label={`Rate ${score} out of 5`}
          >
            <IconStar size={size} className={filled ? "fill-current" : ""} />
          </button>
        );
      })}
    </div>
  );
}

export function RatingBar({
  label,
  value,
  count,
  lowLabel,
  highLabel
}: {
  label: string;
  value: number;
  count: number;
  lowLabel?: string | null;
  highLabel?: string | null;
}) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="rating-row">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-[var(--tg-hint)]">{label}</span>
        <span className="font-semibold">
          {count > 0 ? value.toFixed(1) : "—"}
          <span className="ml-1 font-normal text-[var(--tg-hint)]">({count})</span>
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${count > 0 ? percent : 0}%` }} />
      </div>
      {lowLabel || highLabel ? (
        <div className="mt-1 flex justify-between text-[10px] leading-tight text-[var(--tg-hint)]">
          <span>{lowLabel ?? ""}</span>
          <span className="text-right">{highLabel ?? ""}</span>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {description ? <p className="max-w-xs text-sm leading-relaxed text-[var(--tg-hint)]">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 py-6 text-center">
      <span className="text-[var(--tg-danger)]">
        <IconAlert size={28} />
      </span>
      <p className="text-sm leading-relaxed">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function InlineNotice({
  tone = "neutral",
  title,
  children
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  title?: string;
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.1)]"
      : tone === "warning"
        ? "border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.1)]"
        : tone === "danger"
          ? "border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.1)]"
          : "border-[var(--tg-border)] bg-[rgba(148,163,184,0.08)]";
  return (
    <div className={cn("rounded-xl border p-3 text-sm", toneClass)}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="leading-relaxed text-[var(--tg-hint)]">{children}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "published") return <span className="badge-success">Published</span>;
  if (status === "pending") return <span className="badge-warning">Pending review</span>;
  if (status === "hidden") return <span className="badge-danger">Hidden</span>;
  return <span className="badge-neutral">Deleted</span>;
}

export function Modal({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="safe-bottom max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--tg-border)] bg-[var(--tg-bg-2)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-3 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--tg-hint)]">{children}</h2>
      {action}
    </div>
  );
}
