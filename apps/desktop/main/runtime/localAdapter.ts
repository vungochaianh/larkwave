import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, shell, BrowserWindow } from 'electron';
import { buildContractSuggestPrompt, parseContractSuggestion } from '@larkwave/core';
import { setAgentSkillAuthor, setAgentSkillEditor, setAgentSkillFullLister, setAgentSkillLearner, setAgentSkillLister, setAgentSkillReader } from './lark/skillBridge';
import { BUILTIN_SKILLS } from './skills/builtinSkills';
import type { SkillContractFields, LarkPendingPrompts, LarkFileActionInput, LarkFileActionResult } from '@larkwave/core';
import type { AuthState, ClaudeControls, LarkAppRef, LarkAutomation, LarkAutomationInput, LarkAutomationRunResult, LarkBaseRef, LarkGrantPolicy, LarkNoteDoc, LarkShareInfo, LarkTableRef, LarkBaseSnapshot, LarkBotConfig, LarkBotStatus, LarkChatEvent, LarkChatInput, LarkConnection, LarkWebInfo, LarkWebRecording, LarkSessionMeta, LarkSpecDoc, LarkToolRunResult, LarkSkillSet, LarkSkillRunResult, LarkExtractResult, PluginInfo, PluginPanelInfo, RuntimeAdapter, SkillAttachment, SkillInfo, SpecBuildResult, SpecPromoteInput, CmsSyncJob, CmsSyncJobPatch, CmsSyncErrorReport, CmsSyncLarkChat, CmsSyncRefreshResult, CmsKeeperStatus, LarkReloginEntry, LarkBrowserRect, LarkBrowserState, LarkUiTemplate, LarkUiTemplateApplyResult, LarkWebBase, LarkAutomationFolderInfo, SkillLearnSettings, SkillProposal } from '@larkwave/core';
import { claudeAvailable, claudeLogin, claudeLogout, claudeStatus, clearClaudeToken, runClaude, setClaudeToken, validateKey } from './claudeRunner';
import { addKey as addClaudeKey, isApiKey, listKeys as listClaudeKeys, removeKey as removeClaudeKey, setActiveKey as setActiveClaudeKey } from './claudeKeyStore';
import { LarkService } from './lark/larkService';
import { AccountTokenStore } from '../accountTokenStore';
import { SkillHost } from './skills/skillHost';

/**
 * Desktop runtime: Lark × Agents, skills, CMS Bitable sync and plugins, all driven by the
 * user's local CLI runners (Claude/Codex/Gemini/Grok) or direct API keys. Runs in Electron's
 * MAIN process (needs child_process + fs); the renderer talks to it through IpcRuntimeAdapter.
 */
export class LocalRuntimeAdapter implements RuntimeAdapter {
  readonly kind = 'desktop' as const;
  // Local skills store a "/slash" shortcut in registry.json + the SKILL.md frontmatter, so the
  // Skills screen shows the command field and the chat composers offer the "/" menu.
  readonly supportsSkillCommands = true;
  private readonly lark: LarkService;
  private readonly skills: SkillHost;

  constructor(private readonly baseDir: string) {
    this.lark = new LarkService(baseDir);
    this.skills = new SkillHost(baseDir);
    // Bộ kỹ năng dựng sẵn "Larkwave · Tệp & dữ liệu": cài/cập nhật mặc định (idempotent; không đụng kỹ
    // năng của người dùng / nhập từ Toolswave; người dùng xoá thì không cài lại).
    try {
      this.skills.ensureBuiltins(BUILTIN_SKILLS);
    } catch {
      /* đĩa lỗi — kỹ năng dựng sẵn là phụ, không chặn khởi động */
    }
    // Cho agent Lark tự tạo kỹ năng. Đăng ký Ở ĐÂY vì đây là nơi duy nhất giữ `SkillHost` — tầng
    // tool cố ý không import nó (xem skillBridge).
    setAgentSkillAuthor(async (input) => {
      const before = this.skills.list();
      // NHÃN THỪA HƯỞNG: kỹ năng mới nối vào bộ nào thì mang nhãn của bộ đó.
      //
      // Vì sao không chỉ dựa vào `input.tags`: mô hình nhớ khai `needs` cho đúng (vì thiếu là bộ
      // không chạy) nhưng hay quên nhãn (vì thiếu nhãn thì vẫn chạy). Hậu quả là kỹ năng tổng hợp
      // vào bộ mà KHÔNG mang nhãn, giao nhãn của cả bộ thành rỗng, và cả ngăn mất tên — dù bốn kỹ
      // năng kia đều có nhãn đầy đủ.
      //
      // Suy ra từ DỮ LIỆU thay vì nhờ mô hình nhớ: lấy nhãn chung của những kỹ năng sinh ra khoá
      // mà kỹ năng này cần.
      const needed = new Set(input.contract?.needs ?? []);
      const feeders = needed.size
        ? before.filter((x) => (x.contract?.produces ?? []).some((k) => needed.has(k)))
        : [];
      const inherited = feeders.length
        ? feeders
            .map((x) => x.tags ?? [])
            .reduce<string[]>((acc, t, i) => (i === 0 ? [...t] : acc.filter((k) => t.includes(k))), [])
        : [];
      const tags = [...new Set([...(input.tags ?? []), ...inherited])];
      const after = this.skills.create(
        input.name,
        input.instructions,
        input.scope,
        tags,
        input.command,
        input.contract,
      );
      const made = after.find((s) => !before.some((b) => b.id === s.id)) ?? after[after.length - 1];
      // Khoá nào cả kho vẫn chưa ai sinh ra — trả về để agent biết bộ còn thiếu bước nào, thay vì
      // báo "đã tạo xong" rồi để người dùng phát hiện bế tắc lúc bấm Chạy.
      const produced = new Set(after.flatMap((s) => s.contract?.produces ?? []));
      const missingKeys = [...new Set(after.flatMap((s) => s.contract?.needs ?? []))].filter(
        (k) => !produced.has(k),
      );
      return {
        id: made?.id ?? '',
        name: made?.name ?? input.name,
        hasContract: !!made?.contract,
        missingKeys,
      };
    });
    setAgentSkillEditor(async (input) => {
      const cur = this.skills.list().find((x) => x.id === input.id);
      if (!cur) throw new Error(`Không có kỹ năng nào id "${input.id}". Gọi list_skills để lấy id đúng.`);
      // `by: 'ai'` để bản lưu ghi rõ AI sửa — người dùng nhìn danh sách bản lưu là biết lùi về đâu.
      const after = this.skills.update(input.id, {
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.contract ? { contract: input.contract } : {}),
        by: 'ai',
      });
      const me = after.find((x) => x.id === input.id);
      const produced = new Set(after.flatMap((x) => x.contract?.produces ?? []));
      return {
        id: input.id,
        name: me?.name ?? cur.name,
        hasContract: !!me?.contract,
        missingKeys: [...new Set(after.flatMap((x) => x.contract?.needs ?? []))].filter((k) => !produced.has(k)),
      };
    });
    /**
     * TỰ HỌC (`skill_save`): lời dạy trực tiếp / lời sửa → LƯU NGAY (trừ khi người dùng bật "Hỏi trước khi
     * lưu"); rút từ kinh nghiệm / học từ Base → luôn là ĐỀ XUẤT (thẻ "Lưu kỹ năng"). Tắt "Tự học" → không lưu.
     */
    setAgentSkillLearner(async (input) => this.skills.learnOrPropose(input));
    setAgentSkillReader(async (id) => {
      const e = this.skills.list().find((x) => x.id === id);
      if (!e) throw new Error(`Không có kỹ năng nào id "${id}". Gọi skill_list để lấy id đúng.`);
      const r = this.skills.read(id);
      return {
        id,
        name: e.name,
        description: e.description,
        instructions: r.instructions,
        enabled: e.enabled,
        ...(e.command ? { command: e.command } : {}),
        ...(e.triggers?.length ? { triggers: e.triggers } : {}),
        ...(e.builtin ? { builtin: e.builtin } : {}),
        ...(e.learned ? { learned: e.learned } : {}),
      };
    });
    setAgentSkillFullLister(async () =>
      this.skills.list().map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        enabled: s.enabled,
        ...(s.command ? { command: s.command } : {}),
        ...(s.triggers?.length ? { triggers: s.triggers } : {}),
        ...(s.builtin ? { builtin: s.builtin } : {}),
        ...(s.learned ? { learned: { origin: s.learned.origin, at: s.learned.at } } : {}),
        needs: s.contract?.needs ?? [],
        produces: s.contract?.produces ?? [],
      })),
    );
    setAgentSkillLister(async () =>
      this.skills.list().map((s) => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        needs: s.contract?.needs ?? [],
        produces: s.contract?.produces ?? [],
      })),
    );
    // Phase 1b — let hosted (MAIC) general chat call the server on the signed-in account's behalf.
    const accountTokens = new AccountTokenStore(baseDir);
    this.lark.setAccountTokenGetter(() => accountTokens.get());
    void this.lark.initBot(); // resume the bot listener if it was enabled
  }

  // ── Skills (Claude-style SKILL.md folders the local CLI uses in Lark + Trợ lý AI) ──────────
  async listSkills(): Promise<SkillInfo[]> {
    return this.skills.list();
  }
  async importSkill(scope?: string[], tags?: string[]): Promise<SkillInfo[]> {
    const r = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Chọn thư mục skill (chứa SKILL.md)',
    });
    if (r.canceled || !r.filePaths[0]) return this.skills.list();
    return this.skills.import(r.filePaths[0], scope, tags);
  }
  /** Positional params mirror the core contract; local SKILL.md folders carry no attachments and
   *  derive their description from the body, so only `command` is threaded on past `tags`. */
  async createSkill(
    name: string,
    instructions: string,
    scope?: string[],
    tags?: string[],
    _attachments?: SkillAttachment[],
    _description?: string,
    command?: string,
    contract?: SkillContractFields,
  ): Promise<SkillInfo[]> {
    return this.skills.create(name, instructions, scope, tags, command, contract);
  }
  async setSkillEnabled(id: string, enabled: boolean): Promise<SkillInfo[]> {
    return this.skills.setEnabled(id, enabled);
  }
  async setSkillScope(id: string, scope: string[]): Promise<SkillInfo[]> {
    return this.skills.setScope(id, scope);
  }
  async setSkillTags(id: string, tags: string[]): Promise<SkillInfo[]> {
    return this.skills.setTags(id, tags);
  }
  async skillSnapshots(id: string): Promise<{ at: string; by: 'you' | 'ai'; what: string }[]> {
    return this.skills.snapshots(id);
  }
  async skillVersionText(id: string, at: string): Promise<{ before: string; current: string }> {
    return this.skills.versionText(id, at);
  }
  async skillLearnSettings(): Promise<SkillLearnSettings> {
    return this.skills.getLearnSettings();
  }
  async setSkillLearnSettings(patch: Partial<SkillLearnSettings>): Promise<SkillLearnSettings> {
    return this.skills.setLearnSettings(patch);
  }
  async skillSaveProposal(p: SkillProposal): Promise<SkillInfo[]> {
    this.skills.saveLearned({ name: p.name, instructions: p.instructions, triggers: p.triggers, origin: p.origin, reason: p.reason, updateId: p.updateId });
    return this.skills.list();
  }
  async skillUndoLearn(id: string): Promise<SkillInfo[]> {
    this.skills.undoLearn(id);
    return this.skills.list();
  }
  async skillRestoreLearned(id: string): Promise<SkillInfo[]> {
    return this.skills.restoreLearned(id);
  }
  async restoreBuiltinSkills(): Promise<SkillInfo[]> {
    return this.skills.restoreBuiltins(BUILTIN_SKILLS);
  }
  async larkLearnFromBase(appToken: string, name?: string): Promise<SkillProposal[]> {
    return this.lark.learnFromBase(appToken, name);
  }
  larkListFieldNames(appToken: string, tableId: string): Promise<string[]> {
    return this.lark.listFieldNames(appToken, tableId);
  }
  async reorderSkills(ids: string[]): Promise<SkillInfo[]> {
    return this.skills.reorder(ids);
  }
  async restoreSkill(id: string, at: string): Promise<SkillInfo[]> {
    return this.skills.restore(id, at);
  }
  async deleteSkill(id: string): Promise<SkillInfo[]> {
    return this.skills.delete(id);
  }
  async readSkill(id: string): Promise<{
    id: string;
    name: string;
    instructions: string;
    command?: string;
    contract?: SkillContractFields;
  }> {
    return this.skills.read(id);
  }
  async updateSkill(
    id: string,
    patch: {
      name?: string;
      instructions?: string;
      scope?: string[];
      tags?: string[];
      command?: string;
      contract?: SkillContractFields;
    },
  ): Promise<SkillInfo[]> {
    return this.skills.update(id, patch);
  }

  /**
   * ĐỀ XUẤT hợp đồng từ lời mô tả — người dùng duyệt, sửa, hoặc bỏ. Không tự ghi vào đâu.
   *
   * Dùng `runClaude` ở chế độ `plan` (chỉ đọc) chứ KHÔNG dùng lượt agent của Lark: đề xuất hợp đồng
   * không cần công cụ Lark nào, và bắt phải kết nối Lark xong mới đề xuất được là chặn người dùng
   * ở đúng bước họ chưa làm gì cả.
   *
   * Khoá các kỹ năng khác đã khai được nhặt sẵn ở đây khi người gọi không truyền vào — đó là thứ
   * quyết định đề xuất dùng được ngay hay phải sửa lại hết, nên không để nó phụ thuộc vào việc
   * tầng giao diện có nhớ truyền hay không.
   */
  async suggestSkillContract(
    name: string,
    instructions: string,
    existingKeys?: string[],
  ): Promise<SkillContractFields & { note?: string }> {
    if (!String(instructions || '').trim()) throw new Error('Hãy viết nội dung kỹ năng trước, rồi mới đề xuất được.');
    if (!(await claudeAvailable())) throw new Error('Chưa tìm thấy Claude CLI để đề xuất hợp đồng.');
    const keys =
      existingKeys ??
      this.skills
        .list()
        .flatMap((s) => [...(s.contract?.needs ?? []), ...(s.contract?.produces ?? [])]);
    const dir = join(this.baseDir, 'tmp', 'contract');
    await mkdir(dir, { recursive: true });
    const parts: string[] = [];
    for await (const ev of runClaude({
      prompt: buildContractSuggestPrompt(name, instructions, keys),
      mode: 'plan', // chỉ đọc — lượt này không được đụng vào tệp nào
      cwd: dir,
    })) {
      if (ev.type === 'log' && ev.level === 'info') parts.push(ev.message);
    }
    return parseContractSuggestion(parts.join('\n'));
  }

  /** Local Claude CLI controls (status / login / logout / paste-token / managed keys). */
  readonly claude: ClaudeControls = {
    status: claudeStatus,
    login: claudeLogin,
    logout: claudeLogout,
    setToken: setClaudeToken,
    clearToken: clearClaudeToken,
    listKeys: async () => listClaudeKeys(),
    // Validate against the Anthropic API first (so a bad key isn't silently stored as
    // "connected"), then persist with the result. A non-API-key input throws a friendly
    // error before any network call. The managed key becomes active if it's the first.
    addKey: async ({ label, key }) => {
      if (!isApiKey(key)) return addClaudeKey({ label, key }); // throws the API-key-only error
      const v = await validateKey(key);
      return addClaudeKey({ label, key, valid: v.ok });
    },
    removeKey: async (id) => removeClaudeKey(id),
    setActiveKey: async (id) => setActiveClaudeKey(id),
    validateKey: (key) => validateKey(key),
  };

  // ── Lark × Agents (desktop) ──────────────────────────────────────────────
  larkStatus(): Promise<LarkConnection> {
    return this.lark.status();
  }
  larkConnect(creds: { appId: string; appSecret: string; name?: string }): Promise<LarkConnection> {
    return this.lark.connect(creds);
  }
  larkDisconnect(): Promise<void> {
    return this.lark.disconnect();
  }
  larkHostedPush(): Promise<{ ok: boolean; error?: string }> {
    return this.lark.hostedRunnerEnable();
  }
  larkListSkillSets(): Promise<LarkSkillSet[]> {
    return this.lark.listSkillSets();
  }
  async larkPendingPrompts(convId: string): Promise<LarkPendingPrompts> {
    return this.lark.pendingPrompts(convId);
  }

  /**
   * Chọn tệp rồi trích → ghi bảng. Hộp chọn tệp mở ở TIẾN TRÌNH CHÍNH vì renderer chỉ nhận được
   * nội dung tệp chứ không nhận được đường dẫn thật, mà bộ trích cần đường dẫn để đọc bản gốc
   * (ảnh/PDF được `Read` mở trực tiếp từ đĩa).
   */
  async larkExtractToTable(
    skillId: string,
    dryRun: boolean,
    onEvent?: (e: unknown) => void,
  ): Promise<LarkExtractResult | null> {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
    const opts = {
      title: 'Chọn tệp để trích xuất',
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: [
        { name: 'Tệp đọc được', extensions: ['xlsx', 'docx', 'pptx', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'csv', 'txt'] },
        { name: 'Tất cả', extensions: ['*'] },
      ],
    };
    const picked = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
    // Huỷ hộp chọn là một lựa chọn bình thường, không phải lỗi — trả null để giao diện im lặng.
    if (picked.canceled || !picked.filePaths.length) return null;
    return this.lark.extractFilesToTable(skillId, picked.filePaths, { dryRun, onEvent });
  }
  async larkRunSkillSet(
    skillId: string,
    seedFacts?: Record<string, string | number | boolean | null>,
    mode?: 'ask' | 'build',
    onEvent?: (e: unknown) => void,
  ): Promise<LarkSkillRunResult> {
    const r = await this.lark.runSkillSetById(skillId, {
      seedFacts,
      mode,
      onEvent: (e) => onEvent?.(e),
    });
    // Làm phẳng cho renderer: `CheckResult` ôm cả đối tượng `check`, mà renderer chỉ cần đọc.
    return {
      facts: r.facts,
      checks: r.checks.map((c) => ({ raw: c.check.raw, owner: c.check.owner, verdict: c.verdict, reason: c.reason })),
      ran: r.ran,
      blocked: r.blocked,
    };
  }
  // Saved-app history (connection switcher) + active token health check.
  async larkListApps(): Promise<LarkAppRef[]> {
    return this.lark.listApps();
  }
  larkConnectSaved(appId: string): Promise<LarkConnection> {
    return this.lark.connectSaved(appId);
  }
  async larkRenameApp(appId: string, name: string): Promise<LarkAppRef[]> {
    return this.lark.renameApp(appId, name);
  }
  larkForgetApp(appId: string): Promise<LarkAppRef[]> {
    return this.lark.forgetApp(appId);
  }
  larkCheckConnection(): Promise<LarkConnection> {
    return this.lark.checkConnection();
  }
  /** Begin personal-account OAuth — background opens the window with these. */
  larkUserAuthStart(): { appId: string; state: string } | { error: string } {
    return this.lark.userAuthStart();
  }
  /** Finish personal-account OAuth from the intercepted code (state = CSRF check). */
  larkUserAuthComplete(code: string, state?: string): Promise<LarkConnection> {
    return this.lark.userAuthComplete(code, state);
  }
  /** Abandon an in-flight OAuth login (window cancelled/errored). */
  larkUserAuthCancel(): void {
    this.lark.userAuthCancel();
  }
  larkUserLogout(): Promise<LarkConnection> {
    return this.lark.userLogout();
  }
  larkWebConnect(url?: string): Promise<LarkWebInfo> {
    return this.lark.webConnect(url);
  }
  async larkWebStatus(): Promise<LarkWebInfo> {
    return this.lark.webStatus();
  }
  async larkWebDisconnect(): Promise<void> {
    this.lark.webDisconnect();
  }
  async larkWebReveal(): Promise<void> {
    this.lark.webReveal();
  }
  async larkWebSetWorkflowUrl(url: string): Promise<LarkWebInfo> {
    return this.lark.webSetWorkflowUrl(url);
  }
  larkWebStartRecorder(url?: string): Promise<{ ok: boolean; error?: string }> {
    return this.lark.webStartRecorder(url);
  }
  larkWebGetRecording(): Promise<LarkWebRecording | null> {
    return this.lark.webGetRecording();
  }
  larkWebReplayWorkflow(opts?: { enable?: boolean }): Promise<{ workflowID: string; baseId: string; title: string }> {
    return this.lark.webReplayWorkflow(opts);
  }
  /** `win` = the window the request came from (background passes BrowserWindow.fromWebContents). */
  async larkBrowserAttach(rect: LarkBrowserRect, win?: BrowserWindow): Promise<LarkBrowserState> {
    if (!win) return this.lark.browserState();
    return this.lark.browserAttach(win, rect);
  }
  async larkBrowserDetach(): Promise<void> {
    this.lark.browserDetach();
  }
  async larkBrowserState(): Promise<LarkBrowserState> {
    return this.lark.browserState();
  }
  larkBrowserNavigate(input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' | 'loginQr' | 'loginForm' }): Promise<LarkBrowserState> {
    return this.lark.browserNavigate(input);
  }
  async larkBrowserStopAi(): Promise<LarkBrowserState> {
    return this.lark.browserStopAi();
  }
  async larkBrowserResumeAi(): Promise<LarkBrowserState> {
    return this.lark.browserResumeAi();
  }
  async larkUiTemplateList(): Promise<LarkUiTemplate[]> {
    return this.lark.uiTemplateList();
  }
  larkUiTemplateSave(input: { name: string; description?: string }): Promise<LarkUiTemplate> {
    return this.lark.uiTemplateSave(input);
  }
  async larkUiTemplateDelete(id: string): Promise<LarkUiTemplate[]> {
    return this.lark.uiTemplateDelete(id);
  }
  larkUiTemplateApply(input: { id: string; baseId?: string; vars?: Record<string, string>; title?: string }): Promise<LarkUiTemplateApplyResult> {
    return this.lark.uiTemplateApply(input);
  }
  async larkListBases(): Promise<LarkBaseRef[]> {
    return this.lark.listBases();
  }
  larkDiscoverBases(): Promise<LarkBaseRef[]> {
    return this.lark.discoverBases();
  }
  larkBaseSnapshot(appToken: string): Promise<LarkBaseSnapshot> {
    return this.lark.baseSnapshot(appToken);
  }
  larkAddBase(input: { appToken?: string; url?: string; name?: string; description?: string }): Promise<LarkBaseRef[]> {
    return this.lark.addBase(input);
  }
  async larkRemoveBase(appToken: string): Promise<LarkBaseRef[]> {
    return this.lark.removeBase(appToken);
  }
  // Tự động hoá (Larkwave rule engine).
  async larkListAutomations(): Promise<LarkAutomation[]> {
    return this.lark.listAutomations();
  }
  async larkSaveAutomation(rule: LarkAutomationInput): Promise<LarkAutomation[]> {
    return this.lark.saveAutomation(rule);
  }
  async larkDeleteAutomation(id: string): Promise<LarkAutomation[]> {
    return this.lark.deleteAutomation(id);
  }
  async larkSetAutomationEnabled(id: string, on: boolean): Promise<LarkAutomation[]> {
    return this.lark.setAutomationEnabled(id, on);
  }
  larkRunAutomation(id: string): Promise<LarkAutomationRunResult> {
    return this.lark.runAutomation(id);
  }
  async larkAutomationFolder(id: string): Promise<LarkAutomationFolderInfo> {
    return this.lark.automationFolderInfo(id);
  }
  async larkAutomationAddInput(id: string, file: { name: string; dataBase64: string }): Promise<LarkAutomationFolderInfo> {
    return this.lark.automationAddInput(id, file);
  }
  async larkAutomationRemoveInput(id: string, name: string): Promise<LarkAutomationFolderInfo> {
    return this.lark.automationRemoveInput(id, name);
  }
  async larkAutomationResetProcessed(id: string): Promise<LarkAutomationFolderInfo> {
    return this.lark.automationResetProcessed(id);
  }
  async larkAutomationRevealFolder(id: string): Promise<void> {
    await shell.openPath(await this.lark.automationFolderPath(id));
  }
  larkListTables(appToken: string): Promise<LarkTableRef[]> {
    return this.lark.listTables(appToken);
  }
  larkChat(input: LarkChatInput): AsyncIterable<LarkChatEvent> {
    return this.lark.chat(input);
  }
  async larkConfirmTool(callId: string, decision: 'allow' | 'deny'): Promise<void> {
    this.lark.confirmTool(callId, decision);
  }
  async larkAnswerAsk(callId: string, answer: string): Promise<void> {
    this.lark.answerAsk(callId, answer);
  }
  larkSetAutoApprove(on: boolean): Promise<LarkConnection> {
    return this.lark.setAutoApprove(on);
  }
  async larkGetWorkflowAuto(): Promise<{ workflowAuto: boolean }> {
    return { workflowAuto: this.lark.workflowAutoOn() };
  }
  async larkSetWorkflowAuto(on: boolean): Promise<{ workflowAuto: boolean }> {
    return this.lark.setWorkflowAuto(on);
  }
  larkSetAgentPrefs(prefs: { runner?: string; model?: string; apiMode?: boolean }): Promise<LarkConnection> {
    return this.lark.setAgentPrefs(prefs);
  }
  larkBackupSync(token?: string): Promise<{ at: string } | null> {
    return this.lark.larkBackupSync(token ?? '');
  }
  async larkResetChat(): Promise<void> {
    this.lark.resetChat();
  }
  larkShareSession(sessionId: string, token?: string): Promise<LarkShareInfo> {
    return this.lark.shareSession(sessionId, token ?? '');
  }
  larkUnshareSession(sessionId: string, token?: string): Promise<void> {
    return this.lark.unshareSession(sessionId, token ?? '');
  }
  larkShareStatus(sessionId: string, token?: string): Promise<{ url: string | null }> {
    return this.lark.shareStatus(sessionId, token ?? '');
  }
  larkSessions(): Promise<LarkSessionMeta[]> {
    return this.lark.larkSessions();
  }
  larkNewSession(bases?: LarkBaseRef[], opts?: { kind?: 'workflow' }): Promise<{ id: string }> {
    return this.lark.larkNewSession(bases, opts);
  }
  larkWebListBases(input?: { query?: string }): Promise<LarkWebBase[]> {
    return this.lark.larkWebListBases(input);
  }
  larkSwitchSession(id: string): Promise<{ items: unknown[]; bases?: LarkBaseRef[]; runner?: string; model?: string }> {
    return this.lark.larkSwitchSession(id);
  }
  larkSaveSession(id: string, items: unknown[], bases?: LarkBaseRef[]): Promise<void> {
    return this.lark.larkSaveSession(id, items, bases);
  }
  larkNotes(id: string) {
    return this.lark.larkNotes(id);
  }
  larkSaveNotes(id: string, doc: LarkNoteDoc): Promise<void> {
    return this.lark.larkSaveNotes(id, doc);
  }
  larkSpec(token?: string): Promise<LarkSpecDoc | null> {
    return this.lark.larkSpec(token ?? '');
  }
  larkSaveSpec(doc: LarkSpecDoc, token?: string): Promise<void> {
    return this.lark.larkSaveSpec(doc, token ?? '');
  }
  larkBuildSpec(token?: string): Promise<SpecBuildResult> {
    return this.lark.larkBuildSpec(token ?? '');
  }
  larkPromoteToSpec(input: SpecPromoteInput, token?: string): Promise<LarkSpecDoc> {
    return this.lark.larkPromoteToSpec(input, token ?? '');
  }
  cmsSyncConfig(): Promise<{ baseUrl: string; webReady: boolean }> {
    return (async () => ({ ...this.lark.cmsSyncConfig(), webReady: await this.lark.cmsSyncWebReady() }))();
  }
  async cmsSyncSetBaseUrl(url: string): Promise<void> {
    this.lark.cmsSyncSetBaseUrl(url);
  }
  cmsSyncListJobs(): Promise<CmsSyncJob[]> {
    return this.lark.cmsSyncListJobs();
  }
  cmsSyncCreateJob(input: { name: string; appToken: string; tableIds: string[]; enabled?: boolean; intervalSeconds?: number }): Promise<CmsSyncJob> {
    return this.lark.cmsSyncCreateJob(input);
  }
  cmsSyncSetJobTables(jobId: string, tableIds: string[]): Promise<CmsSyncJob> {
    return this.lark.cmsSyncSetJobTables(jobId, tableIds);
  }
  cmsSyncUpdateJob(jobId: string, patch: CmsSyncJobPatch): Promise<CmsSyncJob> {
    return this.lark.cmsSyncUpdateJob(jobId, patch);
  }
  cmsSyncGetErrorReport(): Promise<CmsSyncErrorReport> {
    return this.lark.cmsSyncGetErrorReport();
  }
  cmsSyncSetErrorReport(cfg: CmsSyncErrorReport): Promise<CmsSyncErrorReport> {
    return this.lark.cmsSyncSetErrorReport(cfg);
  }
  cmsSyncKeeperStatus(): Promise<CmsKeeperStatus> {
    return this.lark.cmsSyncKeeperStatus() as Promise<CmsKeeperStatus>;
  }
  cmsSyncListLarkChats(): Promise<CmsSyncLarkChat[]> {
    return this.lark.cmsSyncListLarkChats();
  }
  cmsSyncCreateLarkChat(name: string): Promise<{ chatId: string; name: string; addedMembers: number; joinLink?: string; memberError?: string }> {
    return this.lark.cmsSyncCreateLarkChat(name);
  }
  cmsSyncTestErrorReport(target: { larkWebhookUrl?: string; chatId?: string }): Promise<{
    ok: boolean;
    results: { target: string; ok: boolean; error?: string }[];
  }> {
    return this.lark.cmsSyncTestErrorReport(target);
  }
  /** Wire the renderer push for "Lark web session died" (called by background once mainWin exists). */
  setLarkWebSessionDeadEmitter(cb: () => void): void {
    this.lark.setSessionDeadEmitter(cb);
  }
  cmsSyncRefreshAll(): Promise<CmsSyncRefreshResult> {
    return this.lark.cmsSyncRefreshAll();
  }
  cmsSyncLoginHistory(): Promise<LarkReloginEntry[]> {
    return this.lark.cmsSyncLoginHistory();
  }
  cmsSyncRefreshJob(jobId: string): Promise<CmsSyncJob> {
    return this.lark.cmsSyncRefreshJob(jobId);
  }
  cmsSyncExecute(jobId: string): Promise<{ ok: boolean; synced?: number; total?: number; failed?: string[]; viaLocal?: boolean; error?: string }> {
    return this.lark.cmsSyncExecute(jobId);
  }
  cmsSyncToggle(jobId: string): Promise<CmsSyncJob> {
    return this.lark.cmsSyncToggle(jobId);
  }
  cmsSyncDeleteJob(jobId: string): Promise<void> {
    return this.lark.cmsSyncDeleteJob(jobId);
  }
  larkSummaries(id: string): Promise<Record<string, string>> {
    return this.lark.larkSummaries(id);
  }
  larkSummarize(id: string, itemId: string, text: string): Promise<string> {
    return this.lark.larkSummarize(id, itemId, text);
  }
  larkSetAccount(userId: string | null): Promise<void> {
    return this.lark.setAccount(userId);
  }
  /** Sau khi nhập kỹ năng từ Toolswave: đọc lại thư viện + đặt bản sao vào thư mục các CLI. */
  resyncSkills(): void {
    this.skills.resync();
  }
  /** Thẻ tệp → Lark Drive / Sheets / Docs (main đã chốt đường dẫn trong lark/work). */
  larkFileAction(input: LarkFileActionInput): Promise<LarkFileActionResult> {
    return this.lark.fileAction(input);
  }
  /** Sau khi nhập/nối phiên Claude: bỏ id phiên đã nạp trong bộ nhớ (xem LarkService.forgetTurnStates). */
  larkForgetTurnStates(): void {
    this.lark.forgetTurnStates();
  }
  larkGrantPolicies(): Promise<Record<string, LarkGrantPolicy>> {
    return this.lark.getGrantPolicies();
  }
  larkSetGrantPolicy(grantId: string, policy: LarkGrantPolicy | null): Promise<void> {
    return this.lark.setGrantPolicy(grantId, policy);
  }
  larkRunGrantTurn(grantId: string, prompt: string) {
    return this.lark.runGrantTurn(grantId, prompt);
  }
  larkRunAgentGrantTurn(grantId: string, prompt: string) {
    return this.lark.runAgentGrantTurn(grantId, prompt);
  }
  larkRenameSession(id: string, title: string): Promise<void> {
    return this.lark.larkRenameSession(id, title);
  }
  larkListFiles() {
    return this.lark.larkListFiles();
  }
  larkReadFile(convId: string, name: string) {
    return this.lark.larkReadFile(convId, name);
  }
  larkDeleteFile(convId: string, name: string) {
    return this.lark.larkDeleteFile(convId, name);
  }
  larkDeleteSession(id: string): Promise<void> {
    return this.lark.larkDeleteSession(id);
  }
  larkCompactSession(convId?: string): Promise<{ ok: boolean; summary: string }> {
    return this.lark.larkCompactSession(convId);
  }

  larkHandoffSession(): Promise<{ summary: string; id: string; bases: LarkBaseRef[] }> {
    return this.lark.larkHandoffSession();
  }
  larkBotStatus(): Promise<LarkBotStatus> {
    return this.lark.botStatus();
  }
  larkBotConfigure(cfg: LarkBotConfig): Promise<LarkBotStatus> {
    return this.lark.configureBot(cfg);
  }
  larkBotCreateChat(name: string): Promise<{ chatId: string; name: string; joinLink?: string }> {
    return this.lark.larkBotCreateChat(name);
  }

  // ── Curated plugins ────────────────────────────────────────────────────────
  async listPlugins(): Promise<PluginInfo[]> {
    return this.lark.listPlugins();
  }
  async installPlugin(source: string): Promise<PluginInfo[]> {
    return this.lark.installPlugin(source);
  }
  async setPluginEnabled(id: string, enabled: boolean): Promise<PluginInfo[]> {
    return this.lark.setPluginEnabled(id, enabled);
  }
  async uninstallPlugin(id: string): Promise<PluginInfo[]> {
    return this.lark.uninstallPlugin(id);
  }
  async larkPluginPanels(): Promise<PluginPanelInfo[]> {
    return this.lark.pluginPanels();
  }
  larkRunTool(name: string, input: Record<string, unknown>): Promise<LarkToolRunResult> {
    return this.lark.runTool(name, input);
  }

  async auth(): Promise<AuthState> {
    const ok = await claudeAvailable();
    return { signedIn: ok, claudeAvailable: ok };
  }

}
