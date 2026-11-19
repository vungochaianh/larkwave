'use client';
/**
 * Larkwave-account auth for the desktop. Separate from the Claude-CLI gate:
 * the builder runs on the local Claude CLI, while the account pages (Explore,
 * Friends, Leaderboard, Reports, Profile…) need a logged-in Larkwave account.
 * Mirrors apps/web/src/lib/auth so behaviour matches the website.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRuntime } from '../RuntimeProvider';
import { accountApi, ApiError, getToken, hydrateToken, setToken, type User } from './api';
import { OAuthStatusModal, type OAuthState } from './OAuthStatusModal';
import { ToolswaveImportWatcher } from './ToolswaveImport';

interface AccountAuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, name?: string) => Promise<User>;
  /** Store an already-issued JWT (e.g. handed back from a browser OAuth flow). */
  loginWithToken: (token: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  applyUser: (user: User) => void;
  /** Open the OAuth status modal ("waiting…") just before launching the browser flow. */
  beginOAuth: (provider?: string, url?: string) => void;
  /** Chế độ "dữ liệu chỉ trên máy" (lõi ≥ 0.1.25): dùng không cần tài khoản, không gọi máy chủ Larkwave. */
  localMode: boolean;
  /** Bị cưỡng bức bằng LARKWAVE_LOCAL_ONLY=1 (bản tự dựng) — không cho chuyển sang tài khoản. */
  localForced: boolean;
  /** Lõi hỗ trợ chế độ chỉ trên máy không (để hiện nút ở màn đăng nhập). */
  localSupported: boolean;
  /** Vào chế độ chỉ trên máy (rời tài khoản nếu đang đăng nhập). */
  enterLocalMode: () => Promise<void>;
  /** Rời chế độ chỉ trên máy → về màn đăng nhập tài khoản. */
  leaveLocalMode: () => Promise<void>;
}

/** Người dùng cục bộ của chế độ chỉ trên máy — `id` rỗng: mọi tính năng máy chủ (relay, chia sẻ…) tự tắt. */
// Tên 'Bạn' để lời chào đọc tự nhiên ("Chào buổi tối, Bạn") — Lark × Agents lấy TỪ CUỐI của tên.
export const LOCAL_USER: User = { id: '', email: '', name: 'Bạn', role: 'local', plan: 'local' };

const AccountAuthContext = createContext<AccountAuthState | null>(null);

export function AccountAuthProvider({ children }: { children: ReactNode }) {
  const runtime = useRuntime();
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localMode, setLocalModeState] = useState(false);
  const [localForced, setLocalForced] = useState(false);
  const localRef = useRef(false);
  const localSupported = !!runtime.localMode;

  const refresh = useCallback(async () => {
    // Chế độ chỉ trên máy: không đọc token, không gọi /auth/me — dùng người dùng cục bộ.
    if (runtime.localMode) {
      const lm = await runtime.localMode().catch(() => null);
      localRef.current = !!lm?.on;
      setLocalModeState(!!lm?.on);
      setLocalForced(!!lm?.forced);
      if (lm?.on) {
        setUser(LOCAL_USER);
        setTok(null);
        setLoading(false);
        return;
      }
    }
    // Desktop: pull the token from the main process if this origin's localStorage is empty
    // (the renderer origin can flip between app:// and pages.dev, and localStorage is per-origin).
    await hydrateToken();
    const t = getToken();
    if (!t) {
      setUser(null);
      setTok(null);
      setLoading(false);
      return;
    }
    setTok(t);
    try {
      setUser(await accountApi.me(t));
    } catch (e) {
      // Only a genuine 401 logs out; transient errors keep the session.
      if (e instanceof ApiError && e.statusCode === 401) {
        setToken(null);
        setUser(null);
        setTok(null);
      }
    } finally {
      setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tell the desktop which account is signed in, so local Lark sessions are stored +
  // synced PER-ACCOUNT. Runs on every login/logout/switch BEFORE the Lark UI reads its
  // session list, so switching accounts on one device never mixes conversations.
  useEffect(() => {
    // `||` chứ không `??`: người dùng cục bộ có id rỗng → khoang `_local` (dữ liệu chỉ trên máy).
    void runtime.larkSetAccount?.(user?.id || null);
  }, [runtime, user?.id]);

  // Re-check when returning to the app (e.g. after an OAuth round-trip).
  useEffect(() => {
    const onFocus = () => {
      if (localRef.current || !getToken()) return;
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await accountApi.login({ email, password });
    setToken(res.token);
    setTok(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const res = await accountApi.register({ email, password, name });
    setToken(res.token);
    setTok(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const loginWithToken = useCallback(async (newToken: string) => {
    setToken(newToken);
    try {
      const me = await accountApi.me(newToken);
      setTok(newToken);
      setUser(me);
      return me;
    } catch (e) {
      setToken(null);
      setUser(null);
      setTok(null);
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setTok(null);
  }, []);

  const applyUser = useCallback((next: User) => setUser(next), []);

  const enterLocalMode = useCallback(async () => {
    if (!runtime.setLocalMode) return;
    await runtime.setLocalMode(true);
    setToken(null); // main đã xoá token đã lưu; xoá luôn bản ở renderer
    await refresh();
  }, [runtime, refresh]);

  const leaveLocalMode = useCallback(async () => {
    if (!runtime.setLocalMode) return;
    const st = await runtime.setLocalMode(false);
    if (st.on) return; // bị cưỡng bức (LARKWAVE_LOCAL_ONLY=1)
    localRef.current = false;
    setLocalModeState(false);
    setUser(null);
    setTok(null);
    await refresh();
  }, [runtime, refresh]);

  // ── OAuth status modal (desktop) ───────────────────────────────────────────
  const [oauth, setOauth] = useState<OAuthState>({ phase: 'idle' });
  const oauthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOauthTimer = useCallback(() => {
    if (oauthTimer.current) {
      clearTimeout(oauthTimer.current);
      oauthTimer.current = null;
    }
  }, []);
  const beginOAuth = useCallback(
    (provider?: string, url?: string) => {
      clearOauthTimer();
      setOauth({ phase: 'waiting', provider, url });
      // Don't wait forever if the user abandons the browser tab.
      oauthTimer.current = setTimeout(() => {
        // Keep the url on the error state too: a timeout is exactly when the user needs
        // the copyable link and the manual-token box.
        setOauth((o) => (o.phase === 'waiting' ? { phase: 'error', provider: o.provider, url: o.url, error: 'timeout' } : o));
      }, 180_000);
    },
    [clearOauthTimer],
  );
  const closeOauth = useCallback(() => {
    clearOauthTimer();
    setOauth({ phase: 'idle' });
  }, [clearOauthTimer]);
  useEffect(() => clearOauthTimer, [clearOauthTimer]);
  // Auto-dismiss the success state.
  useEffect(() => {
    if (oauth.phase !== 'success') return;
    const t = setTimeout(() => setOauth({ phase: 'idle' }), 1400);
    return () => clearTimeout(t);
  }, [oauth.phase]);

  // Desktop: a JWT arrives via the loopback callback (or `larkwave://` deep link)
  // after a browser OAuth round-trip. loginWithToken's outcome drives the modal:
  // success → ✓, an invalid token → error.
  useEffect(() => {
    if (!runtime.onAuthDeepLink) return; // web: no-op
    return runtime.onAuthDeepLink((deepToken) => {
      void loginWithToken(deepToken)
        .then(() => {
          clearOauthTimer();
          setOauth((o) => (o.phase === 'waiting' || o.phase === 'success' ? { phase: 'success', provider: o.provider } : o));
        })
        .catch(() => {
          clearOauthTimer();
          setOauth((o) => (o.phase === 'waiting' ? { phase: 'error', provider: o.provider, error: 'token' } : o));
        });
    });
  }, [runtime, loginWithToken, clearOauthTimer]);

  // The loopback also reports a no-token failure (OAuth denied / wrong account).
  useEffect(() => {
    if (!runtime.onAuthStatus) return; // web: no-op
    return runtime.onAuthStatus((status) => {
      if (status.phase !== 'error') return;
      clearOauthTimer();
      setOauth((o) => (o.phase === 'waiting' ? { phase: 'error', provider: o.provider, error: status.error } : o));
    });
  }, [runtime, clearOauthTimer]);

  const value = useMemo<AccountAuthState>(
    () => ({ user, token, loading, login, register, loginWithToken, logout, refresh, applyUser, beginOAuth, localMode, localForced, localSupported, enterLocalMode, leaveLocalMode }),
    [user, token, loading, login, register, loginWithToken, logout, refresh, applyUser, beginOAuth, localMode, localForced, localSupported, enterLocalMode, leaveLocalMode],
  );

  return (
    <AccountAuthContext.Provider value={value}>
      {children}
      <ToolswaveImportWatcher />
      <OAuthStatusModal
        state={oauth}
        onClose={closeOauth}
        email={user?.email}
        onPasteToken={async (t) => {
          await loginWithToken(t);
          clearOauthTimer();
          setOauth({ phase: 'success' });
        }}
      />
    </AccountAuthContext.Provider>
  );
}

export function useAccountAuth(): AccountAuthState {
  const ctx = useContext(AccountAuthContext);
  if (!ctx) throw new Error('useAccountAuth must be used within <AccountAuthProvider>');
  return ctx;
}

/** Đang ở chế độ "dữ liệu chỉ trên máy" không — an toàn cả khi nằm ngoài <AccountAuthProvider> (trả false). */
export function useLocalModeFlag(): boolean {
  return !!useContext(AccountAuthContext)?.localMode;
}
