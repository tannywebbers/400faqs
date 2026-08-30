const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ApiResult<T> = {
  success: boolean;
  data: T;
  error?: { message: string; details?: unknown };
  [key: string]: unknown;
};

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.body && !options.formData) headers["Content-Type"] = "application/json";

  const res = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
    signal: options.signal,
    cache: "no-store",
  });

  let payload: ApiResult<T> | null = null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    /* non-json response */
  }

  if (!res.ok) {
    // A stale or revoked admin token must never leave the user stuck on a
    // broken admin screen — clear the local session and send them to log in
    // again. Public /app pages never return 401.
    if (res.status === 401 && typeof window !== "undefined" && getToken()) {
      clearToken();
      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.assign("/admin/login");
      }
    }
    const message = payload?.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, payload?.error?.details);
  }

  return payload?.data as T;
}

// ---- Server-side helpers (for RSC / SSR) ----

export async function serverFetch<T>(path: string, revalidate = 60): Promise<T> {
  const res = await fetch(apiUrl(path), { next: { revalidate } });
  if (!res.ok) throw new ApiError(`Failed to load`, res.status);
  const payload = (await res.json()) as ApiResult<T>;
  return payload.data;
}

// ---- Client-side data helpers ----

export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("400faqs_admin_token");
};

export const setToken = (token: string): void => {
  window.localStorage.setItem("400faqs_admin_token", token);
};

export const clearToken = (): void => {
  window.localStorage.removeItem("400faqs_admin_token");
};

export const getAdminUser = (): { id: string; name: string; email: string; role: string } | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("400faqs_admin_user");
  return raw ? (JSON.parse(raw) as { id: string; name: string; email: string; role: string }) : null;
};

export const setAdminUser = (user: { id: string; name: string; email: string; role: string }): void => {
  window.localStorage.setItem("400faqs_admin_user", JSON.stringify(user));
};
