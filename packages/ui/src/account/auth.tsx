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
}

const AccountAuthContext = createContext<AccountAuthState | null>(null);

export function AccountAuthProvider({ children }: { children: ReactNode }) {
  const runtime = useRuntime();
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tell the desktop which account is signed in, so local Lark sessions are stored +
  // synced PER-ACCOUNT. Runs on every login/logout/switch BEFORE the Lark UI reads its
  // session list, so switching accounts on one device never mixes conversations.
  useEffect(() => {
    void runtime.larkSetAccount?.(user?.id ?? null);
  }, [runtime, user?.id]);

  // Re-check when returning to the app (e.g. after an OAuth round-trip).
  useEffect(() => {
    const onFocus = () => {
      if (!getToken()) return;
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
    () => ({ user, token, loading, login, register, loginWithToken, logout, refresh, applyUser, beginOAuth }),
    [user, token, loading, login, register, loginWithToken, logout, refresh, applyUser, beginOAuth],
  );

  return (
    <AccountAuthContext.Provider value={value}>
      {children}
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
