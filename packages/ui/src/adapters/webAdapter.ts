import type {
  AppSummary,
  AuthState,
  BuildEvent,
  CreateBuildInput,
  DeployResult,
  PreviewHandle,
  PreviewTarget,
  PromptTemplate,
  RuntimeAdapter,
  SkillAttachment,
  SkillInfo,
} from '@larkwave/core';

/**
 * Web runtime: the SAME interface, backed by api.toolswave.net (server codegen,
 * metered). Drop-in for the existing web app — wire it in apps/web/_app:
 *
 *   <RuntimeProvider runtime={new WebRuntimeAdapter('https://api.toolswave.net/v1', getToken)}>
 *
 * Then replace the bespoke composer with <Composer/> from @larkwave/ui and the
 * web + desktop share one UI.
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

  async listApps(): Promise<AppSummary[]> {
    const r = await fetch(`${this.apiBase}/apps`, { headers: this.headers() });
    const data = await r.json().catch(() => []);
    const arr = Array.isArray(data) ? data : (data?.items ?? []);
    return arr.map((a: any) => ({ id: a.id, name: a.name, status: a.status, url: a.currentUrl }));
  }

  async templates(): Promise<PromptTemplate[]> {
    try {
      const r = await fetch(`${this.apiBase}/templates`);
      if (!r.ok) return [];
      const data = await r.json().catch(() => []);
      const arr = Array.isArray(data) ? data : (data?.items ?? []);
      return arr.filter((t: any) => t?.prompt);
    } catch {
      return [];
    }
  }

  async uploadAttachment(file: File): Promise<{ id: string; name: string }> {
    const fd = new FormData();
    fd.append('file', file);
    // purpose=build: nếu không gắn nhãn, hạn lưu 30 ngày KHÔNG BAO GIỜ chạm tới những tệp này —
    // mà chúng lại là những tệp nặng nhất người dùng gửi lên. Nhãn 'build' cũng phân biệt được
    // với tệp trò chuyện, để sau này muốn đặt hạn khác cho từng loại thì có sẵn chỗ.
    const r = await fetch(`${this.apiBase}/uploads?purpose=build`, {
      method: 'POST',
      headers: this.headers(false),
      body: fd,
    });
    if (!r.ok) throw new Error(`Tải file thất bại (${r.status})`);
    const u = await r.json();
    return { id: u.id, name: u.name ?? file.name };
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

  async *createBuild(input: CreateBuildInput): AsyncIterable<BuildEvent> {
    // Map the shared input onto the existing CreateBuildRequest (theme + languages
    // ride inside `features`, the same shape the web composer sends).
    const features =
      input.features || input.theme || input.languages
        ? {
            ...(input.theme ? { theme: input.theme } : {}),
            ...(input.languages ? { languages: input.languages } : {}),
            ...(input.features || {}),
          }
        : undefined;
    const body = {
      prompt: input.prompt,
      ...(input.track && input.track !== 'auto' ? { track: input.track } : {}),
      // Workflow preset ("Làm ngay" / "Cân bằng" / "Kỹ") — sent structurally; the server picks
      // which pipeline stages it skips. Omitted when absent ⇒ the server keeps its own default.
      ...(input.preset ? { preset: input.preset } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.primaryColor ? { primaryColor: input.primaryColor } : {}),
      ...(input.style && input.style !== 'auto' ? { style: input.style } : {}),
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(features ? { features } : {}),
      ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
      ...(input.appId ? { appId: input.appId } : {}),
      // "Bộ site": danh sách mặt được chọn. Thân request ở đây là danh sách TRẮNG chứ không
      // phải spread cả input — quên thêm trường mới vào đây thì nó bị bỏ im lặng, người dùng
      // chọn xong vẫn chỉ ra một site và không có gì báo là lựa chọn đã rơi mất.
      ...(input.surfaces && input.surfaces.length >= 2 ? { surfaces: input.surfaces } : {}),
      // Tên dự án người dùng gõ. Ô này là BẮT BUỘC ở Composer, vậy mà cái tên đó rơi ngay tại
      // đây suốt từ đầu — máy chủ không nhận được nên tự đặt "Bản sao <host>". Bắt người ta gõ
      // một thứ rồi vứt đi là kiểu hỏng tệ nhất: không có lỗi nào hiện ra để mà lần.
      ...(input.projectName ? { projectName: input.projectName } : {}),
    };
    const res = await fetch(`${this.apiBase}/builds`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `Tạo build thất bại (${res.status})`;
      try {
        const e = await res.json();
        if (e?.error) msg = e.error;
        if (res.status === 402) msg = '402:' + msg; // quota — caller routes to /pricing
      } catch {
        /* keep default */
      }
      yield { type: 'error', message: msg };
      return;
    }
    // The server build is async; emit the ids so the web can navigate into the
    // project page (which streams progress). Desktop streams inline instead.
    const { buildId, appId } = await res.json();
    yield { type: 'status', status: 'running' };
    yield { type: 'result', appId, buildId };
  }

  async preview(appId: string, target: PreviewTarget): Promise<PreviewHandle> {
    const r = await fetch(`${this.apiBase}/apps/${appId}`, { headers: this.headers() });
    const a = await r.json().catch(() => ({}));
    return { url: a?.currentUrl ?? '', target, stop: async () => {} };
  }

  async deploy(appId: string): Promise<DeployResult> {
    const r = await fetch(`${this.apiBase}/apps/${appId}`, { headers: this.headers() });
    const a = await r.json().catch(() => ({}));
    return { url: a?.currentUrl ?? '' };
  }
}
