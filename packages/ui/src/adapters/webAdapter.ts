import type { AuthState, RuntimeAdapter, SkillAttachment, SkillInfo } from '@larkwave/core';

/**
 * Web runtime: the SAME interface, backed by api.toolswave.net (hosted AI, metered).
 * Wire it in apps/web:
 *
 *   <RuntimeProvider runtime={new WebRuntimeAdapter('https://api.toolswave.net/v1', getToken)}>
 *
 * The shared screens (Skills, Uploads, …) then run unchanged on web + desktop.
 */
export class WebRuntimeAdapter implements RuntimeAdapter {
  readonly kind = 'web' as const;
  // Server-side skills can bundle reference files → the create/edit flow shows an attach section.
  readonly supportsSkillAttachments = true;
  // Server-side skills store a `/command` shortcut → the Skills screen shows the command field and
  // the chat composers offer the "/" menu.
  readonly supportsSkillCommands = true;
  constructor(
    private readonly apiBase: string,
    private readonly getToken: () => string | null = () => null,
  ) {}

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h['content-type'] = 'application/json';
    const t = this.getToken();
    if (t) h['authorization'] = `Bearer ${t}`;
    return h;
  }

  async auth(): Promise<AuthState> {
    const t = this.getToken();
    if (!t) return { signedIn: false };
    const r = await fetch(`${this.apiBase}/auth/me`, { headers: this.headers() });
    if (!r.ok) return { signedIn: false };
    const u = await r.json();
    return { signedIn: true, email: u?.email };
  }

  // ── Skills (server-side, for the hosted "Trợ lý AI") ───────────────────────
  // Every enabled skill is injected into the hosted assistant's system prompt server-side; a
  // `/command` typed in the composer is expanded server-side too (it applies the skill for that
  // turn even when the skill is disabled).
  // `importSkill` (a native folder picker) stays desktop-only, so it is intentionally NOT
  // implemented here — SkillsScreen hides the "import folder" action when it is absent.
  async listSkills(): Promise<SkillInfo[]> {
    const r = await fetch(`${this.apiBase}/skills`, { headers: this.headers() });
    if (!r.ok) throw new Error(`Không tải được skills (${r.status})`);
    return (await r.json().catch(() => [])) as SkillInfo[];
  }

  /** The user's `/command` shortcuts (only skills that have one) — powers the "/" menu in the
   *  chat composers. Disabled skills are included: an explicit command is explicit intent. */
  async listSkillCommands(): Promise<
    { id: string; name: string; description: string; command: string; enabled: boolean }[]
  > {
    const r = await fetch(`${this.apiBase}/skills/commands`, { headers: this.headers() });
    if (!r.ok) throw new Error(`Không tải được lệnh skill (${r.status})`);
    return (await r.json().catch(() => [])) as {
      id: string;
      name: string;
      description: string;
      command: string;
      enabled: boolean;
    }[];
  }

  async readSkill(id: string): Promise<{
    id: string;
    name: string;
    description?: string;
    instructions: string;
    attachments?: SkillAttachment[];
    command?: string;
  }> {
    const r = await fetch(`${this.apiBase}/skills/${encodeURIComponent(id)}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`Không đọc được skill (${r.status})`);
    return await r.json();
  }

  async createSkill(
    name: string,
    instructions: string,
    scope?: string[],
    tags?: string[],
    attachments?: SkillAttachment[],
    description?: string,
    command?: string,
  ): Promise<SkillInfo[]> {
    const r = await fetch(`${this.apiBase}/skills`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name, instructions, scope, tags, attachments, description, command }),
    });
    if (!r.ok) throw new Error(`Tạo skill thất bại (${r.status})`);
    return (await r.json()) as SkillInfo[];
  }

  async draftSkill(prompt: string): Promise<{ name: string; description: string; instructions: string }> {
    const r = await fetch(`${this.apiBase}/skills/draft`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ prompt }),
    });
    if (!r.ok) throw new Error(`Soạn skill bằng AI thất bại (${r.status})`);
    return await r.json();
  }

  private async patchSkill(id: string, body: Record<string, unknown>): Promise<SkillInfo[]> {
    const r = await fetch(`${this.apiBase}/skills/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Cập nhật skill thất bại (${r.status})`);
    return (await r.json()) as SkillInfo[];
  }

  updateSkill(
    id: string,
    patch: {
      name?: string;
      description?: string;
      instructions?: string;
      scope?: string[];
      tags?: string[];
      attachments?: SkillAttachment[];
      /** '' clears the shortcut; the server sanitizes + de-duplicates it. */
      command?: string;
    },
  ): Promise<SkillInfo[]> {
    return this.patchSkill(id, patch);
  }

  setSkillEnabled(id: string, enabled: boolean): Promise<SkillInfo[]> {
    return this.patchSkill(id, { enabled });
  }

  setSkillScope(id: string, scope: string[]): Promise<SkillInfo[]> {
    return this.patchSkill(id, { scope });
  }

  setSkillTags(id: string, tags: string[]): Promise<SkillInfo[]> {
    return this.patchSkill(id, { tags });
  }

  async deleteSkill(id: string): Promise<SkillInfo[]> {
    const r = await fetch(`${this.apiBase}/skills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!r.ok) throw new Error(`Xoá skill thất bại (${r.status})`);
    return (await r.json()) as SkillInfo[];
  }
}
