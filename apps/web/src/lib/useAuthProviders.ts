"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type AuthProviders = { google: boolean; gitlab: boolean; github: boolean };

const CACHE_KEY = "tw_auth_providers";
const EMPTY: AuthProviders = { google: false, gitlab: false, github: false };

function readCache(): AuthProviders {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<AuthProviders>;
    return { google: !!v.google, gitlab: !!v.gitlab, github: !!v.github };
  } catch {
    return EMPTY;
  }
}

/**
 * Which social-login providers to render on /login and /register.
 *
 * Resilient to a brief backend outage — most importantly the ~30–60s the API
 * restarts during a deploy. The last-known-good config is cached in
 * localStorage and shown immediately on the next visit, and a FAILED fetch
 * keeps those cached buttons visible while it retries with backoff, instead of
 * hiding them. So a real customer who has seen the Google/GitLab buttons before
 * never watches them vanish mid-deploy. A first-ever visitor (no cache) simply
 * self-heals the moment the API answers a retry.
 *
 * We hydrate from cache in an effect (not a lazy initializer) so the initial
 * client markup matches SSR (both start EMPTY) — no hydration mismatch.
 */
export function useAuthProviders(): AuthProviders {
  const [providers, setProviders] = useState<AuthProviders>(EMPTY);

  // 1) Paint last-known-good immediately (post-mount, so no SSR mismatch).
  useEffect(() => {
    const cached = readCache();
    if (cached.google || cached.gitlab || cached.github) setProviders(cached);
  }, []);

  // 2) Refresh from the backend; on failure keep what we show and retry.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;

    const load = () => {
      api
        .authConfig()
        .then((cfg) => {
          if (!active) return;
          const next: AuthProviders = {
            google: !!cfg.google,
            gitlab: !!cfg.gitlab,
            github: !!cfg.github,
          };
          setProviders(next);
          try {
            window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
          } catch {
            /* ignore quota / private-mode storage errors */
          }
        })
        .catch(() => {
          if (!active) return;
          // Transient failure (API restarting mid-deploy): DON'T hide the
          // cached buttons — retry with backoff until it comes back.
          if (attempt < delays.length) {
            timer = setTimeout(load, delays[attempt]);
            attempt += 1;
          }
        });
    };
    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return providers;
}
