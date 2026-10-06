"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LoginRequest, RegisterRequest, User } from "@larkwave/shared";
import { api, ApiError, TOKEN_KEY } from "./api";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (body: LoginRequest) => Promise<User>;
  /**
   * Store an already-issued JWT (e.g. from the Google OAuth callback) exactly
   * like a normal login: persist to localStorage + the `tw_token` cookie and
   * fetch the current user. Throws if the token is invalid.
   */
  loginWithToken: (token: string, opts?: { session?: boolean }) => Promise<User>;
  register: (body: RegisterRequest) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  /**
   * Apply an already-fetched current-user object (e.g. the User returned by a
   * profile/avatar mutation) so the sidebar + header update instantly without
   * a second /me round-trip.
   */
  applyUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Persist the JWT. `session=true` (admin impersonation) stores it in
 * sessionStorage — scoped to THIS tab only — so it never collides with the
 * persistent localStorage login or other tabs; the cookie (proxy gate only)
 * then uses a short max-age matching the impersonation token.
 */
function writeToken(token: string, session = false): void {
  try {
    if (session) {
      // sessionStorage is per-tab and getToken() checks it FIRST, so this tab is
      // isolated WITHOUT touching localStorage (the admin's own builder login, if
      // any, in other tabs stays intact).
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* ignore */
  }
  const maxAge = session ? 3600 : COOKIE_MAX_AGE;
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(
    token,
  )}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY) ?? window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// Cached copy of the last-known user, so a reload can render the app INSTANTLY (no Splash)
// while api.me() re-validates in the background — critical during a deploy, when the API is
// briefly unreachable and the site must stay usable instead of stranding on the splash.
const USER_KEY = "tw_user";
function writeUser(u: User): void {
  try { window.localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignore */ }
}
function readUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage.getItem(USER_KEY);
    return s ? (JSON.parse(s) as User) : null;
  } catch {
    return null;
  }
}
function clearUser(): void {
  try { window.localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = readToken();
    if (!t) {
      clearUser();
      setUser(null);
      setToken(null);
      setLoading(false);
      return;
    }
    setToken(t);
    // OPTIMISTIC BOOT: if we have a cached user, show the app IMMEDIATELY (drop the Splash)
    // and re-validate in the background. This keeps the site fully usable during a deploy —
    // a reload no longer strands the user on the splash while the API restarts.
    const cached = readUser();
    if (cached) {
      setUser(cached);
      setLoading(false);
    }
    // Bounded backoff so the app self-heals during the ~30–60s the API restarts
    // mid-deploy: api.me() fails, but instead of leaving `user` null (which would
    // strand the guard on a Splash until a manual refresh) we retry until it
    // answers and `user` populates on its own. Mirrors useAuthProviders' backoff.
    const delays = [1500, 3000, 6000, 10000];
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const me = await api.me(t);
        setUser(me);
        writeUser(me);
        break;
      } catch (e) {
        // ONLY a genuine auth rejection (401 = bad/expired token) should log out.
        // Transient failures — 429 (rapid F5 hitting the rate-limiter), 5xx, network
        // blips, timeouts — must KEEP the session, else refreshing logs the user out.
        const status = e instanceof ApiError ? e.statusCode : 0;
        if (status === 401) {
          clearToken();
          clearUser();
          setUser(null);
          setToken(null);
          break;
        }
        // Transient: keep the token (+ the cached user, if any) and retry with backoff so
        // the UI recovers once the API returns. Bail out after the last delay — a later
        // call / reload will re-validate.
        if (attempt >= delays.length) break;
        await new Promise((r) => setTimeout(r, delays[attempt]));
        attempt += 1;
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (body: LoginRequest) => {
    const res = await api.login(body);
    writeToken(res.token);
    setToken(res.token);
    setUser(res.user);
    writeUser(res.user);
    return res.user;
  }, []);

  const loginWithToken = useCallback(
    async (newToken: string, opts?: { session?: boolean }) => {
      // Persist first so api.me() (and any retry) can read it, then verify by
      // fetching the current user. Roll back on failure. `session` = impersonation
      // (tab-scoped sessionStorage, isolated from the persistent login).
      writeToken(newToken, opts?.session);
      try {
        const me = await api.me(newToken);
        setToken(newToken);
        setUser(me);
        // Impersonation (session) is tab-scoped — don't leak it into the shared user cache.
        if (!opts?.session) writeUser(me);
        return me;
      } catch (e) {
        clearToken();
        setUser(null);
        setToken(null);
        throw e;
      }
    },
    [],
  );

  const register = useCallback(async (body: RegisterRequest) => {
    const res = await api.register(body);
    writeToken(res.token);
    setToken(res.token);
    setUser(res.user);
    writeUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearUser();
    setUser(null);
    setToken(null);
  }, []);

  const applyUser = useCallback((next: User) => {
    setUser(next);
    writeUser(next);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      token,
      loading,
      login,
      loginWithToken,
      register,
      logout,
      refresh,
      applyUser,
    }),
    [user, token, loading, login, loginWithToken, register, logout, refresh, applyUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/**
 * Như useAuth nhưng KHÔNG ném khi thiếu provider — trả về null.
 *
 * Dành cho phần dùng chung ở cả trong lẫn ngoài vùng đăng nhập, mà LandingChrome là ví dụ: nó đã
 * cố ý viết để chạy được kể cả khi không có provider nào (useI18n cũng tự lùi về tiếng Việt).
 * Gọi thẳng useAuth ở đó là đánh đổi một tính năng phụ — hiện tên tài khoản — lấy nguy cơ trắng
 * nguyên trang nếu sau này có ai dựng header ngoài cây Providers.
 *
 * Nơi nào BẮT BUỘC phải có người dùng thì vẫn dùng useAuth, để thiếu provider là lỗi to và ồn.
 */
export function useAuthOptional(): AuthState | null {
  return useContext(AuthContext);
}
