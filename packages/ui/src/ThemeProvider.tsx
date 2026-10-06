'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEME_CSS, type ThemeMode } from './theme';

const STORAGE_KEY = 'tw-theme';

interface ThemeCtx {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({ mode: 'light', toggle: () => {}, setMode: () => {} });

/** Read the persisted choice; fall back to the OS preference on first run. */
function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light'; // default to LIGHT (ignore OS dark) — an explicit toggle to dark still wins
}

/** Inject the `--tw-*` variable stylesheet exactly once (id-guarded, survives HMR). */
function ensureThemeStyle() {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('tw-theme-vars');
  if (!el) {
    el = document.createElement('style');
    el.id = 'tw-theme-vars';
    document.head.appendChild(el);
  }
  if (el.textContent !== THEME_CSS) el.textContent = THEME_CSS;
}

/** Mirror the choice onto <html>: data-theme (drives the --tw-* vars) + a direct background
 *  so there is no white flash even before the var stylesheet is injected. Keep the two layer
 *  colors in sync with PALETTES.layer (theme.ts) and the _document inline script. */
function applyThemeToDom(m: ThemeMode) {
  if (typeof document === 'undefined') return;
  ensureThemeStyle();
  document.documentElement.dataset.theme = m;
  document.documentElement.style.backgroundColor = m === 'dark' ? '#13151C' : '#F4F5FB';
}

/**
 * Owns the light/dark choice: persists it, mirrors it onto `<html data-theme>` (which
 * drives the CSS `--tw-*` vars every inline style reads through `V`), and injects the
 * variable stylesheet. AppShell consumes `mode` to pick the matching antd ThemeConfig.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('light');

  // Hydrate from the pre-paint inline script's decision (data-theme already on <html> from
  // _document), else storage/OS. Set the html background directly so there is NO white flash
  // even before the --tw-* var stylesheet is injected. No `[mode]` effect that could briefly
  // re-set data-theme back to the stale initial 'light' between commits.
  useEffect(() => {
    ensureThemeStyle();
    const dom = document.documentElement.getAttribute('data-theme');
    const m: ThemeMode = dom === 'light' || dom === 'dark' ? dom : initialMode();
    setModeState(m);
    applyThemeToDom(m);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    applyThemeToDom(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => setMode(mode === 'dark' ? 'light' : 'dark'), [mode, setMode]);

  return <Ctx.Provider value={{ mode, toggle, setMode }}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => useContext(Ctx);
