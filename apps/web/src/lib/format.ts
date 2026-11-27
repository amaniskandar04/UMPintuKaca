import type { TargetType } from "@pintukaca/shared";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}

export function formatAverage(value: number): string {
  if (!value) return "—";
  return value.toFixed(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function targetPath(type: TargetType, code: string): string {
  const segment = type === "course" ? "course" : type === "program" ? "program" : type === "place" ? "campus" : "club";
  return `/${segment}/${encodeURIComponent(code)}`;
}

export function targetTypeLabel(type: TargetType): string {
  if (type === "course") return "Course";
  if (type === "program") return "Programme";
  if (type === "place") return "Place";
  return "Club";
}

export function facultyLabel(value: string): string {
  return value.replace(/^FACULTY OF /i, "").replace(/^ACADEMY OF /i, "");
}
