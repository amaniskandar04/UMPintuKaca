import type {
  AdminQueueDto,
  AuthResponse,
  CategoriesDto,
  ConfigDto,
  CourseDetailDto,
  CourseDto,
  CourseQuestionDto,
  DimensionsResponse,
  EntityDetailDto,
  EntityDto,
  FacultiesDto,
  MyReviewDto,
  ProgramDetailDto,
  ProgramDto,
  RewardTheme,
  ReviewAccessDto,
  ReviewDto,
  RewardsDto,
  RewardsLeaderboardDto,
  TargetType,
  UserDto
} from "@um-reviews/shared";

const configuredBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
const API_BASE = configuredBase.replace(/\/$/, "");
const TOKEN_KEY = "umr_token";

let currentToken: string | null = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function setToken(token: string | null): void {
  currentToken = token;
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return currentToken;
}

/**
 * Registered by AuthContext. Called when a request comes back 401 so an
 * expired 2h session can be re-established transparently instead of stranding
 * a student who left the Mini App open.
 */
type AuthRefreshHandler = () => Promise<string | null>;
let refreshHandler: AuthRefreshHandler | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAuthRefreshHandler(handler: AuthRefreshHandler | null): void {
  refreshHandler = handler;
}

function refreshOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve(refreshHandler ? refreshHandler() : null)
      .then((token) => token ?? null)
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight as Promise<string | null>;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Set on auth endpoints so a rejected credential cannot trigger a refresh loop. */
  skipAuthRefresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, attempt = 0): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (currentToken) headers.set("authorization", `Bearer ${currentToken}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  // Expired session: refresh once, then replay the request with the new token.
  if (response.status === 401 && attempt === 0 && !options.skipAuthRefresh && refreshHandler) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      return request<T>(path, options, attempt + 1);
    }
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const record = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(record.error || response.statusText || "Request failed", response.status, record.code);
  }

  return data as T;
}

export interface ReviewInput {
  targetType: TargetType;
  targetCode: string;
  title?: string | null;
  body?: string | null;
  wouldTakeAgain?: boolean | null;
  overall: number;
  semesters?: string[];
  scores?: Record<string, number>;
}

export interface ReviewUpdateInput {
  title?: string | null;
  body?: string | null;
  wouldTakeAgain?: boolean | null;
  overall?: number;
  semesters?: string[];
  scores?: Record<string, number>;
}

export const api = {
  config(): Promise<ConfigDto> {
    return request<ConfigDto>("/api/config");
  },
  init(initData: string): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/init", { method: "POST", body: { initData }, skipAuthRefresh: true });
  },
  devInit(): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/dev-init", { method: "POST", skipAuthRefresh: true });
  },
  devVerify(): Promise<{ user: UserDto }> {
    return request<{ user: UserDto }>("/api/auth/dev-verify", { method: "POST" });
  },
  devUnverify(): Promise<{ user: UserDto }> {
    return request<{ user: UserDto }>("/api/auth/dev-unverify", { method: "POST" });
  },
  me(): Promise<{ user: UserDto }> {
    return request<{ user: UserDto }>("/api/auth/me");
  },
  deleteAccount(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/auth/me", { method: "DELETE" });
  },
  googleStart(): Promise<{ authUrl: string }> {
    return request<{ authUrl: string }>("/api/auth/google/start", { method: "POST" });
  },
  dimensions(): Promise<DimensionsResponse> {
    return request<DimensionsResponse>("/api/dimensions");
  },
  faculties(): Promise<FacultiesDto> {
    // The `v` param busts a cached faculty list. It was bumped once when the
    // list was canonicalised: clients that had cached the old duplicated list
    // kept showing empty filter chips until the URL changed.
    return request<FacultiesDto>("/api/faculties?v=2");
  },
  categories(type: TargetType): Promise<CategoriesDto> {
    const params = new URLSearchParams({ type });
    return request<CategoriesDto>(`/api/categories?${params.toString()}`);
  },
  courses(query = "", faculty = ""): Promise<{ courses: CourseDto[] }> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (faculty) params.set("faculty", faculty);
    return request<{ courses: CourseDto[] }>(`/api/courses?${params.toString()}`);
  },
  course(
    code: string,
    page = 1,
    sort: "newest" | "helpful" = "newest",
    semester = ""
  ): Promise<{ course: CourseDetailDto }> {
    const params = new URLSearchParams({ page: String(page), sort });
    if (semester) params.set("semester", semester);
    return request<{ course: CourseDetailDto }>(
      `/api/courses/${encodeURIComponent(code)}?${params.toString()}`
    );
  },
  reviewAccess(): Promise<{ access: ReviewAccessDto }> {
    return request<{ access: ReviewAccessDto }>("/api/reviews/access");
  },
  questions(code: string): Promise<{ questions: CourseQuestionDto[] }> {    return request<{ questions: CourseQuestionDto[] }>(
      `/api/courses/${encodeURIComponent(code)}/questions`
    );
  },
  askQuestion(code: string, body: string): Promise<{ question: CourseQuestionDto }> {
    return request<{ question: CourseQuestionDto }>(`/api/courses/${encodeURIComponent(code)}/questions`, {
      method: "POST",
      body: { body }
    });
  },
  answerQuestion(id: string, body: string): Promise<{ answer: unknown }> {
    return request<{ answer: unknown }>(`/api/questions/${encodeURIComponent(id)}/answers`, {
      method: "POST",
      body: { body }
    });
  },
  programs(query = "", faculty = "", level = ""): Promise<{ programs: ProgramDto[] }> {    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (faculty) params.set("faculty", faculty);
    if (level) params.set("level", level);
    return request<{ programs: ProgramDto[] }>(`/api/programs?${params.toString()}`);
  },
  program(code: string, page = 1, sort: "newest" | "helpful" = "newest"): Promise<{ program: ProgramDetailDto }> {
    return request<{ program: ProgramDetailDto }>(
      `/api/programs/${encodeURIComponent(code)}?page=${page}&sort=${sort}`
    );
  },
  entities(type: TargetType, query = "", faculty = "", category = ""): Promise<{ entities: EntityDto[] }> {
    const params = new URLSearchParams({ type });
    if (query) params.set("q", query);
    if (faculty) params.set("faculty", faculty);
    if (category) params.set("category", category);
    return request<{ entities: EntityDto[] }>(`/api/entities?${params.toString()}`);
  },
  entity(
    type: TargetType,
    code: string,
    page = 1,
    sort: "newest" | "helpful" = "newest"
  ): Promise<{ entity: EntityDetailDto }> {
    return request<{ entity: EntityDetailDto }>(
      `/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(code)}?page=${page}&sort=${sort}`
    );
  },
  createReview(input: ReviewInput): Promise<{ review: ReviewDto }> {
    return request<{ review: ReviewDto }>("/api/reviews", { method: "POST", body: input });
  },
  helpful(reviewId: string): Promise<{ helpfulCount: number; viewerHelpful: boolean }> {
    return request<{ helpfulCount: number; viewerHelpful: boolean }>(
      `/api/reviews/${encodeURIComponent(reviewId)}/helpful`,
      { method: "POST" }
    );
  },
  unhelpful(reviewId: string): Promise<{ helpfulCount: number; viewerHelpful: boolean }> {
    return request<{ helpfulCount: number; viewerHelpful: boolean }>(
      `/api/reviews/${encodeURIComponent(reviewId)}/helpful`,
      { method: "DELETE" }
    );
  },
  rewards(): Promise<RewardsDto> {
    return request<RewardsDto>("/api/rewards/me");
  },
  updateRewards(input: { showAchievements?: boolean; theme?: RewardTheme; displayBadges?: string[] }): Promise<RewardsDto> {
    return request<RewardsDto>("/api/rewards/me", { method: "PATCH", body: input });
  },
  updateReview(id: string, input: ReviewUpdateInput): Promise<{ review: ReviewDto }> {
    return request<{ review: ReviewDto }>(`/api/reviews/${encodeURIComponent(id)}`, { method: "PATCH", body: input });
  },
  deleteReview(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  myReviews(): Promise<{ reviews: MyReviewDto[] }> {
    return request<{ reviews: MyReviewDto[] }>("/api/reviews/mine");
  },
  reportReview(id: string, reason: string, details?: string): Promise<{ ok: boolean; hidden: boolean }> {
    return request<{ ok: boolean; hidden: boolean }>(`/api/reviews/${encodeURIComponent(id)}/report`, {
      method: "POST",
      body: { reason, details: details || null }
    });
  },
  adminQueue(): Promise<AdminQueueDto> {
    return request<AdminQueueDto>("/api/admin/queue");
  },
  adminReviewAction(id: string, action: "approve" | "hide" | "delete", note?: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/admin/reviews/${encodeURIComponent(id)}/action`, {
      method: "POST",
      body: { action, note }
    });
  },
  adminResolveReport(id: string, action: "dismiss" | "action_taken", note?: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: { action, note }
    });
  },
  adminBan(userId: string, reason: string, until?: string | null): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
      method: "POST",
      body: { reason, until: until ?? null }
    });
  },
  adminUnban(userId: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/ban`, { method: "DELETE" });
  },
  adminRewardsLeaderboard(): Promise<RewardsLeaderboardDto> {
    return request<RewardsLeaderboardDto>("/api/admin/rewards/leaderboard");
  },
  adminRebuildRewards(): Promise<{ ok: boolean; users: number }> {
    return request<{ ok: boolean; users: number }>("/api/admin/rewards/rebuild", { method: "POST" });
  },
  adminAdjustRewards(userId: string, points: number, reason: string): Promise<{ ok: boolean; points: number; level: number }> {
    return request<{ ok: boolean; points: number; level: number }>(
      `/api/admin/rewards/${encodeURIComponent(userId)}/adjust`,
      { method: "POST", body: { points, reason } }
    );
  }
};
