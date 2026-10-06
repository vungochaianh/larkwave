import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export type OAuthProvider = 'gitlab' | 'github';

/** Profile resolved from a provider after the OAuth token exchange. */
export interface OAuthProfile {
  username: string;
  email: string | null;
}

/** An OAuth token set (only used transiently to read the profile — never stored). */
export interface OAuthToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

const GH = 'https://api.github.com';

/**
 * GitLab/GitHub as LOGIN providers only: consent URL, code -> token exchange, and the
 * profile (username + email) used to find-or-create the account. Larkwave has no repo
 * features, so the provider token is used once to read the profile and then dropped.
 */
@Injectable()
export class OAuthProvidersService {
  constructor(private readonly config: AppConfigService) {}

  // -- feature flags ----------------------------------------------------------

  isEnabled(provider: OAuthProvider): boolean {
    const e = this.config.env;
    return provider === 'gitlab'
      ? Boolean(e.GITLAB_OAUTH_CLIENT_ID && e.GITLAB_OAUTH_CLIENT_SECRET)
      : Boolean(e.GITHUB_OAUTH_CLIENT_ID && e.GITHUB_OAUTH_CLIENT_SECRET);
  }

  /** { gitlab, github } booleans for GET /auth/config. */
  get flags(): { gitlab: boolean; github: boolean } {
    return { gitlab: this.isEnabled('gitlab'), github: this.isEnabled('github') };
  }

  // -- OAuth: consent URL -----------------------------------------------------

  /** Build the provider consent URL (caller has already checked isEnabled). */
  buildConsentUrl(provider: OAuthProvider, state: string): string {
    const e = this.config.env;
    if (provider === 'gitlab') {
      const params = new URLSearchParams({
        client_id: e.GITLAB_OAUTH_CLIENT_ID,
        redirect_uri: e.GITLAB_OAUTH_REDIRECT,
        response_type: 'code',
        // Kept as 'api' (not 'read_user') because the shared GitLab OAuth app was only
        // granted 'api'; requesting 'read_user' fails with "scope invalid" there. Larkwave
        // only reads the profile — switch to 'read_user' once its own OAuth app exists.
        scope: 'api',
        state,
      });
      return `https://gitlab.com/oauth/authorize?${params.toString()}`;
    }
    const params = new URLSearchParams({
      client_id: e.GITHUB_OAUTH_CLIENT_ID,
      redirect_uri: e.GITHUB_OAUTH_REDIRECT,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // -- OAuth: code -> access token --------------------------------------------

  /** Exchange the OAuth `code` for the user's access token. Throws on failure. */
  async exchangeCode(provider: OAuthProvider, code: string): Promise<OAuthToken> {
    const e = this.config.env;
    if (provider === 'gitlab') {
      const res = await fetch('https://gitlab.com/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: e.GITLAB_OAUTH_CLIENT_ID,
          client_secret: e.GITLAB_OAUTH_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: e.GITLAB_OAUTH_REDIRECT,
        }),
      });
      if (!res.ok) throw new Error(`GitLab token exchange failed: ${res.status}`);
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) throw new Error('GitLab token response missing access_token');
      return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      };
    }
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_id: e.GITHUB_OAUTH_CLIENT_ID,
        client_secret: e.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: e.GITHUB_OAUTH_REDIRECT,
      }),
    });
    if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status}`);
    const json = (await res.json()) as { access_token?: string; error?: string };
    if (!json.access_token) {
      throw new Error(`GitHub token response missing access_token${json.error ? `: ${json.error}` : ''}`);
    }
    // GitHub OAuth-App tokens don't expire → no refresh needed.
    return { accessToken: json.access_token, refreshToken: null, expiresAt: null };
  }

  // -- OAuth: token -> profile ------------------------------------------------

  /** Fetch the authenticated user's username + primary email using their token. */
  async fetchProfile(provider: OAuthProvider, token: string): Promise<OAuthProfile> {
    if (provider === 'gitlab') {
      const res = await fetch('https://gitlab.com/api/v4/user', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`GitLab /user failed: ${res.status}`);
      const u = (await res.json()) as { username?: string; email?: string };
      return { username: u.username ?? '', email: u.email?.toLowerCase().trim() || null };
    }
    const res = await fetch(`${GH}/user`, { headers: this.ghHeaders(token) });
    if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`);
    const u = (await res.json()) as { login?: string; email?: string | null };
    let email = u.email?.toLowerCase().trim() || null;
    if (!email) {
      // public email may be null -> fetch from /user/emails (primary, verified).
      try {
        const er = await fetch(`${GH}/user/emails`, { headers: this.ghHeaders(token) });
        if (er.ok) {
          const emails = (await er.json()) as { email: string; primary: boolean; verified: boolean }[];
          const primary = emails.find((x) => x.primary && x.verified) ?? emails.find((x) => x.verified);
          email = primary?.email?.toLowerCase().trim() || null;
        }
      } catch {
        /* best-effort */
      }
    }
    return { username: u.login ?? '', email };
  }

  private ghHeaders(token: string): Record<string, string> {
    return {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'Larkwave',
      'x-github-api-version': '2022-11-28',
    };
  }
}
