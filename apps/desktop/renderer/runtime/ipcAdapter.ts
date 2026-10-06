import type {
  AgentClientStatus,
  AgentControls,
  TokenTestResult,
  TelegramLinkResponse,
  UpdateTokenNotifyInput,
  ApiKeyList,
  AppFile,
  AppDbOverview,
  AppDbResult,
  AppSummary,
  AuthState,
  BuildEvent,
  ClaudeControls,
  ClaudeLoginEvent,
  ClaudeStatus,
  KeyValidation,
  RunnerControls,
  RunnerStatusInfo,
  ConvMessage,
  AppCheckpoint,
  AppSessionArchive,
  AppEnvSpec,
  AppView,
  CreateBuildInput,
  RunnerPromptPreview,
  DeployResult,
  DesktopUpdateInfo,
  GitImportInput,
  GitImportResult,
  AttachmentRef,
  LarkAppRef,
  LarkAutomation,
  LarkAutomationInput,
  LarkAutomationRunResult,
  LarkBaseRef,
  AgentBusyOwner,
  LarkGrantPolicy,
  LarkNoteDoc,
  LarkShareInfo,
  LarkTableRef,
  LarkBaseSnapshot,
  LarkBotConfig,
  LarkBotStatus,
  LarkChatEvent,
  LarkChatInput,
  LarkChatMode,
  LarkConnection,
  LarkWebInfo,
  LarkWebRecording,
  LarkSessionMeta,
  LarkSpecDoc,
  LarkToolRunResult,
  LarkSkillSet,
  LarkSkillRunResult,
  LarkExtractResult,
  PluginInfo,
  PluginPanelInfo,
  PreviewHandle,
  PreviewTarget,
  RunningPreview,
  AppScreenshot,
  AppShotResult,
  AppServiceInfo,
  ApiRoute,
  ApiResponse,
  ApiRequestInput,
  PromptTemplate,
  RuntimeAdapter,
  ServerDeployStartResult,
  ServerDeployStatus,
  SkillAttachment,
  SkillContractFields,
  LarkPendingPrompts,
  SkillInfo,
  SpecBuildResult,
  SpecPromoteInput,
  CmsSyncJob,
  CmsSyncJobPatch,
  CmsSyncErrorReport,
  CmsSyncLarkChat,
  CmsSyncRefreshResult,
  CmsKeeperStatus,
  LarkReloginEntry,
} from '@larkwave/core';

/** Shape of the bridge exposed by preload.ts via contextBridge. */
interface Bridge {
  auth(): Promise<AuthState>;
  listApps(): Promise<AppSummary[]>;
  templates(): Promise<PromptTemplate[]>;
  appConversation(appId: string): Promise<ConvMessage[]>;
  appSessions(appId: string): Promise<AppSessionArchive[]>;
  appCheckpoints(appId: string): Promise<AppCheckpoint[]>;
  appHandoffSession(appId: string): Promise<{ summary: string }>;
  renameApp(appId: string, name: string): Promise<void>;
  listSkills(): Promise<SkillInfo[]>;
  importSkill(scope?: string[], tags?: string[]): Promise<SkillInfo[]>;
  createSkill(name: string, instructions: string, scope?: string[], tags?: string[], command?: string, contract?: SkillContractFields): Promise<SkillInfo[]>;
  setSkillEnabled(id: string, enabled: boolean): Promise<SkillInfo[]>;
  setSkillScope(id: string, scope: string[]): Promise<SkillInfo[]>;
  setSkillTags(id: string, tags: string[]): Promise<SkillInfo[]>;
  /** Plain marker (not a method): present only on a main that understands a skill's `command`. */
  skillCommandsSupported?: boolean;
  skillContractsSupported?: boolean;
  suggestSkillContract?(name: string, instructions: string, existingKeys?: string[]): Promise<SkillContractFields & { note?: string }>;
  // Optional on the bridge: an OLD installed main lacks these preload methods even after the
  // renderer code-pushes — the constructor drops the adapter methods when the bridge lacks them.
  readSkill?(id: string): Promise<{ id: string; name: string; instructions: string; command?: string; contract?: SkillContractFields }>;
  updateSkill?(id: string, patch: { name?: string; instructions?: string; scope?: string[]; tags?: string[]; command?: string; contract?: SkillContractFields }): Promise<SkillInfo[]>;
  deleteSkill(id: string): Promise<SkillInfo[]>;
  appFiles(appId: string): Promise<AppFile[]>;
  writeAppFile(appId: string, path: string, content: string): Promise<void>;
  readAppEnvSpec(appId: string): Promise<AppEnvSpec>;
  appViews(appId: string): Promise<AppView[]>;
  appLastPrompt?(appId: string): Promise<string>;
  appDb(appId: string): Promise<AppDbOverview>;
  appDbRows(appId: string, table: string, limit: number, offset: number): Promise<AppDbResult>;
  appDbExec(appId: string, sql: string, params?: unknown[]): Promise<AppDbResult>;
  appDbCreate(appId: string): Promise<AppDbOverview>;
  gitImportLocal(input: GitImportInput): Promise<GitImportResult>;
  importLocalFolder(): Promise<GitImportResult | null>;
  // Optional: an OLD installed main won't have these preload methods even after a renderer push.
  importLocalFolderPath?(path: string): Promise<GitImportResult | null>;
  getPathForFile?(file: File): string | null;
  uploadAttachment(payload: { name: string; type?: string; bytes: Uint8Array }): Promise<AttachmentRef>;
  quitApp(): Promise<void>;
  deleteApp(appId: string): Promise<void>;
  openAppFolder(appId: string): Promise<void>;
  appLocation(appId?: string): Promise<{ dir: string; defaultDir: string; isOverride: boolean }>;
  chooseAppLocation(): Promise<string | null>;
  setDefaultAppsDir(dir: string | null): Promise<void>;
  listMigratableApps(): Promise<{ id: string; name: string }[]>;
  migrateApp(appId: string, newName?: string): Promise<{ ok: boolean; skipped?: boolean; newName?: string; backup?: string; error?: string }>;
  downloadAppZip(appId: string): Promise<string | null>;
  preview(appId: string, target: string): Promise<{ url: string; target: PreviewTarget; services?: { name: string; url: string }[]; kind?: 'web' | 'expo'; expoUrl?: string }>;
  stopPreview(appId: string, service?: string): Promise<void>;
  restartPreview?(appId: string, service?: string): Promise<void>;
  listRunningPreviews?(): Promise<RunningPreview[]>;
  captureAppScreenshot?(appId: string, opts?: { force?: boolean }): Promise<AppShotResult>;
  appScreenshot?(appId: string): Promise<AppScreenshot | null>;
  appServices?(appId: string): Promise<AppServiceInfo[]>;
  apiRoutes?(appId: string): Promise<ApiRoute[]>;
  apiRequest?(appId: string, req: ApiRequestInput): Promise<ApiResponse>;
  deploy(appId: string, token: string): Promise<DeployResult>;
  deployServer(appId: string, token: string): Promise<ServerDeployStartResult>;
  deployServerStatus(deployId: string, token: string): Promise<ServerDeployStatus>;
  createBuild(streamId: string, input: CreateBuildInput): Promise<{ started: boolean }>;
  composeRunnerPrompt(input: CreateBuildInput): Promise<RunnerPromptPreview>;
  onBuildEvent(cb: (streamId: string, ev: BuildEvent | { type: '__end__' }) => void): () => void;
  claudeStatus(): Promise<ClaudeStatus>;
  claudeLogout(): Promise<void>;
  claudeSetToken(token: string): Promise<ClaudeStatus>;
  claudeClearToken(): Promise<ClaudeStatus>;
  claudeListKeys(): Promise<ApiKeyList>;
  claudeAddKey(input: { label: string; key: string }): Promise<ApiKeyList>;
  claudeRemoveKey(id: string): Promise<ApiKeyList>;
  claudeSetActiveKey(id: string): Promise<ApiKeyList>;
  claudeValidateKey(key: string): Promise<KeyValidation>;
  runners(): Promise<RunnerStatusInfo[]>;
  runnerSetToken(id: string, token: string): Promise<RunnerStatusInfo[]>;
  runnerClearToken(id: string): Promise<RunnerStatusInfo[]>;
  agentStatus(token?: string): Promise<AgentClientStatus>;
  agentSetEnabled(on: boolean, token?: string): Promise<AgentClientStatus>;
  agentRegenToken(token: string): Promise<AgentClientStatus>;
  agentCreateToken(name: string, token?: string): Promise<AgentClientStatus>;
  agentListTokens(token?: string): Promise<AgentClientStatus>;
  agentDeleteToken(id: string, token?: string): Promise<AgentClientStatus>;
  agentTestToken(id: string, token?: string): Promise<TokenTestResult>;
  agentUpdateTokenNotify(id: string, input: UpdateTokenNotifyInput, token?: string): Promise<AgentClientStatus>;
  agentTelegramLink(token?: string): Promise<TelegramLinkResponse>;
  agentTelegramBindings(token?: string): Promise<AgentClientStatus>;
  agentDeleteTelegramBinding(id: string, token?: string): Promise<AgentClientStatus>;
  agentSyncApps(token?: string): Promise<{ ok: boolean; count: number; reason?: 'auth' | 'timeout' | 'error' }>;
  onAgentEvent(cb: (s: AgentClientStatus) => void): () => void;
  cancelBuild(appId: string): Promise<void>;
  agentBusyNow(): Promise<AgentBusyOwner | null>;
  agentUnlock(): Promise<void>;
  onAgentBusy(cb: (owner: AgentBusyOwner | null) => void): () => void;
  claudeLogin(streamId: string): Promise<{ started: boolean }>;
  onClaudeLoginEvent(cb: (streamId: string, ev: ClaudeLoginEvent | { type: '__end__' }) => void): () => void;
  openExternal(url: string): void;
  openLocalFile(path: string): Promise<{ ok: boolean; error?: string }>;
  onInstallerProgress(cb: (p: { received: number; total: number }) => void): () => void;
  checkUpdate(): Promise<DesktopUpdateInfo>;
  applyUpdate(): Promise<DesktopUpdateInfo>;
  downloadInstaller(): Promise<{ ok: boolean; path?: string; error?: string }>;
  onAuthDeepLink(cb: (token: string) => void): () => void;
  onLarkWebSessionDead(cb: () => void): () => void;
  onAuthStatus(cb: (status: { phase: 'success' | 'error'; error?: string }) => void): () => void;
  startAuthLoopback(): Promise<{ redirect: string }>;
  openAuthWindow(url: string): Promise<{ ok: boolean; kind?: 'login' | 'connect'; provider?: string; error?: string }>;
  larkStatus(): Promise<LarkConnection>;
  larkConnect(creds: { appId: string; appSecret: string; name?: string }): Promise<LarkConnection>;
  larkDisconnect(): Promise<void>;
  larkHostedPush(): Promise<{ ok: boolean; error?: string }>;
  larkListSkillSets(): Promise<LarkSkillSet[]>;
  larkPendingPrompts?(convId: string): Promise<LarkPendingPrompts>;
  skillSnapshots?(id: string): Promise<{ at: string; by: 'you' | 'ai'; what: string }[]>;
  restoreSkill?(id: string, at: string): Promise<SkillInfo[]>;
  reorderSkills?(ids: string[]): Promise<SkillInfo[]>;
  larkListFieldNames?(appToken: string, tableId: string): Promise<string[]>;
  larkRunSkillSet(skillId: string, seedFacts?: Record<string, unknown>, mode?: 'ask' | 'build'): Promise<LarkSkillRunResult>;
  onLarkSkillSetEvent(cb: (e: unknown) => void): () => void;
  larkExtractToTable(skillId: string, dryRun: boolean): Promise<LarkExtractResult | null>;
  larkListApps(): Promise<LarkAppRef[]>;
  larkConnectSaved(appId: string): Promise<LarkConnection>;
  larkRenameApp(appId: string, name: string): Promise<LarkAppRef[]>;
  larkForgetApp(appId: string): Promise<LarkAppRef[]>;
  larkCheckConnection(): Promise<LarkConnection>;
  larkUserLogin(): Promise<LarkConnection>;
  larkUserLogout(): Promise<LarkConnection>;
  // Optional on the bridge: an OLD (already-installed) main process won't have these preload
  // methods even after the renderer code-pushes — the class impls below guard for that.
  larkWebConnect?(url?: string): Promise<LarkWebInfo>;
  larkWebStatus?(): Promise<LarkWebInfo>;
  larkWebDisconnect?(): Promise<void>;
  larkWebReveal?(): Promise<void>;
  larkWebSetWorkflowUrl?(url: string): Promise<LarkWebInfo>;
  larkWebStartRecorder?(url?: string): Promise<{ ok: boolean; error?: string }>;
  larkWebGetRecording?(): Promise<LarkWebRecording | null>;
  larkWebReplayWorkflow?(opts?: { enable?: boolean }): Promise<{ workflowID: string; baseId: string; title: string }>;
  larkListBases(): Promise<LarkBaseRef[]>;
  larkDiscoverBases(): Promise<LarkBaseRef[]>;
  larkBaseSnapshot(appToken: string): Promise<LarkBaseSnapshot>;
  larkAddBase(input: { appToken?: string; url?: string; name?: string; description?: string }): Promise<LarkBaseRef[]>;
  larkRemoveBase(appToken: string): Promise<LarkBaseRef[]>;
  larkListAutomations(): Promise<LarkAutomation[]>;
  larkSaveAutomation(rule: LarkAutomationInput): Promise<LarkAutomation[]>;
  larkDeleteAutomation(id: string): Promise<LarkAutomation[]>;
  larkSetAutomationEnabled(id: string, on: boolean): Promise<LarkAutomation[]>;
  larkRunAutomation(id: string): Promise<LarkAutomationRunResult>;
  larkListTables(appToken: string): Promise<LarkTableRef[]>;
  larkConfirmTool(callId: string, decision: 'allow' | 'deny'): Promise<void>;
  larkAnswerAsk(callId: string, answer: string): Promise<void>;
  larkSetAutoApprove(on: boolean): Promise<LarkConnection>;
  larkSetAgentPrefs(prefs: { runner?: string; model?: string; apiMode?: boolean }): Promise<LarkConnection>;
  larkBackupSync(token: string): Promise<{ at: string } | null>;
  larkResetChat(): Promise<void>;
  larkShareSession(id: string, token: string): Promise<LarkShareInfo>;
  larkUnshareSession(id: string, token: string): Promise<void>;
  larkShareStatus(id: string, token: string): Promise<{ url: string | null }>;
  larkSessions(): Promise<LarkSessionMeta[]>;
  larkNewSession(bases?: LarkBaseRef[]): Promise<{ id: string }>;
  larkSwitchSession(id: string): Promise<{ items: unknown[]; bases?: LarkBaseRef[] }>;
  larkSaveSession(id: string, items: unknown[], bases?: LarkBaseRef[]): Promise<void>;
  larkDeleteSession(id: string): Promise<void>;
  larkNotes(id: string): Promise<LarkNoteDoc | null>;
  larkSaveNotes(id: string, doc: LarkNoteDoc): Promise<void>;
  larkSpec(token: string): Promise<LarkSpecDoc | null>;
  larkSaveSpec(doc: LarkSpecDoc, token: string): Promise<void>;
  larkBuildSpec(token: string): Promise<SpecBuildResult>;
  larkPromoteToSpec(input: SpecPromoteInput, token: string): Promise<LarkSpecDoc>;
  cmsSyncConfig(): Promise<{ baseUrl: string; webReady: boolean }>;
  cmsSyncSetBaseUrl(url: string): Promise<void>;
  cmsSyncListJobs(): Promise<CmsSyncJob[]>;
  cmsSyncCreateJob(input: { name: string; appToken: string; tableIds: string[]; enabled?: boolean; intervalSeconds?: number }): Promise<CmsSyncJob>;
  cmsSyncSetJobTables(jobId: string, tableIds: string[]): Promise<CmsSyncJob>;
  cmsSyncUpdateJob(jobId: string, patch: CmsSyncJobPatch): Promise<CmsSyncJob>;
  cmsSyncGetErrorReport(): Promise<CmsSyncErrorReport>;
  cmsSyncSetErrorReport(cfg: CmsSyncErrorReport): Promise<CmsSyncErrorReport>;
  cmsSyncKeeperStatus(): Promise<CmsKeeperStatus>;
  cmsSyncListLarkChats(): Promise<CmsSyncLarkChat[]>;
  cmsSyncCreateLarkChat(name: string): Promise<{ chatId: string; name: string; addedMembers: number; joinLink?: string; memberError?: string }>;
  cmsSyncTestErrorReport(target: { larkWebhookUrl?: string; chatId?: string }): Promise<{ ok: boolean; results: { target: string; ok: boolean; error?: string }[] }>;
  cmsSyncRefreshAll(): Promise<CmsSyncRefreshResult>;
  cmsSyncLoginHistory(): Promise<LarkReloginEntry[]>;
  cmsSyncRefreshJob(jobId: string): Promise<CmsSyncJob>;
  cmsSyncExecute(jobId: string): Promise<{ ok: boolean; synced?: number; total?: number; failed?: string[]; details?: string[]; viaLocal?: boolean; error?: string }>;
  cmsSyncToggle(jobId: string): Promise<CmsSyncJob>;
  cmsSyncDeleteJob(jobId: string): Promise<void>;
  larkSummaries(id: string): Promise<Record<string, string>>;
  larkSummarize(id: string, itemId: string, text: string): Promise<string>;
  larkSetAccount(userId: string | null): Promise<void>;
  larkGrantPolicies(): Promise<Record<string, LarkGrantPolicy>>;
  larkSetGrantPolicy(grantId: string, policy: LarkGrantPolicy | null): Promise<void>;
  larkRunGrantTurn(grantId: string, prompt: string): Promise<{ ok: boolean; text?: string; error?: string }>;
  larkRunAgentGrantTurn(grantId: string, prompt: string): Promise<{ ok: boolean; text?: string; error?: string }>;
  larkHandoffSession(): Promise<{ summary: string; id: string; bases: LarkBaseRef[] }>;
  larkCompactSession(convId?: string): Promise<{ ok: boolean; summary: string }>;
  larkBotStatus(): Promise<LarkBotStatus>;
  larkBotConfigure(cfg: LarkBotConfig): Promise<LarkBotStatus>;
  larkBotCreateChat(name: string): Promise<{ chatId: string; name: string; joinLink?: string }>;
  larkChat(streamId: string, input: LarkChatInput): Promise<{ started: boolean }>;
  onLarkChatEvent(cb: (streamId: string, ev: LarkChatEvent | { type: '__end__' }) => void): () => void;
  pluginList(): Promise<PluginInfo[]>;
  pluginInstall(source: string): Promise<PluginInfo[]>;
  pluginSetEnabled(id: string, enabled: boolean): Promise<PluginInfo[]>;
  pluginUninstall(id: string): Promise<PluginInfo[]>;
  pluginPanels(): Promise<PluginPanelInfo[]>;
  larkRunTool(name: string, input: Record<string, unknown>): Promise<LarkToolRunResult>;
}

declare global {
  interface Window {
    toolswave: Bridge;
  }
}

/**
 * Renderer-side RuntimeAdapter: same interface the web uses, but every call is
 * forwarded over IPC to LocalRuntimeAdapter in the main process. The shared UI
 * can't tell the difference.
 */
export class IpcRuntimeAdapter implements RuntimeAdapter {
  readonly kind = 'desktop' as const;
  // Local skills store a "/slash" shortcut (SkillHost). `command` rides the EXISTING createSkill /
  // updateSkill payloads, so there is no new bridge METHOD to detect — an older installed main
  // would just drop the extra argument. The preload therefore ships a plain marker, and the
  // constructor turns this flag off when it is missing, so the Skills screen hides the command
  // field instead of silently discarding what the user typed after a renderer-only code-push.
  supportsSkillCommands = true;
  /** Cùng cơ chế với `supportsSkillCommands`: main cũ nuốt mất hợp đồng mà không báo. */
  supportsSkillContracts = true;
  private get bridge() {
    return window.toolswave;
  }

  constructor() {
    // The renderer code-pushes AHEAD of the installed main: an OLD main's preload bridge lacks
    // newer methods even though this adapter class defines them (on the prototype). For methods
    // the UI FEATURE-DETECTS via `!!runtime.X` (e.g. skill body edit → canEditBody), drop the
    // adapter method too when the bridge lacks it, so detection stays honest and we never call a
    // missing bridge method (which would throw synchronously and hang the caller's loading state).
    const b = typeof window !== 'undefined' ? window.toolswave : undefined;
    if (b) {
      if (!b.readSkill) (this as Record<string, unknown>).readSkill = undefined;
      if (!b.updateSkill) (this as Record<string, unknown>).updateSkill = undefined;
      if (!b.skillCommandsSupported) this.supportsSkillCommands = false;
      if (!b.skillContractsSupported) this.supportsSkillContracts = false;
      if (!b.suggestSkillContract) (this as Record<string, unknown>).suggestSkillContract = undefined;
    }
  }

  auth(): Promise<AuthState> {
    return this.bridge.auth();
  }
  listApps(): Promise<AppSummary[]> {
    return this.bridge.listApps();
  }
  templates(): Promise<PromptTemplate[]> {
    return this.bridge.templates();
  }
  appConversation(appId: string): Promise<ConvMessage[]> {
    return this.bridge.appConversation(appId);
  }
  appSessions(appId: string): Promise<AppSessionArchive[]> {
    return this.bridge.appSessions(appId);
  }
  appCheckpoints(appId: string): Promise<AppCheckpoint[]> {
    return this.bridge.appCheckpoints(appId);
  }
  appHandoffSession(appId: string): Promise<{ summary: string }> {
    return this.bridge.appHandoffSession(appId);
  }
  renameApp(appId: string, name: string): Promise<void> {
    return this.bridge.renameApp(appId, name);
  }
  listSkills(): Promise<SkillInfo[]> {
    return this.bridge.listSkills();
  }
  importSkill(scope?: string[], tags?: string[]): Promise<SkillInfo[]> {
    return this.bridge.importSkill(scope, tags);
  }
  /** Positional params mirror the core contract; local SKILL.md folders carry no attachments and
   *  derive their description from the body, so only `command` is threaded on past `tags`. */
  createSkill(
    name: string,
    instructions: string,
    scope?: string[],
    tags?: string[],
    _attachments?: SkillAttachment[],
    _description?: string,
    command?: string,
    contract?: SkillContractFields,
  ): Promise<SkillInfo[]> {
    return this.bridge.createSkill(name, instructions, scope, tags, command, contract);
  }
  setSkillEnabled(id: string, enabled: boolean): Promise<SkillInfo[]> {
    return this.bridge.setSkillEnabled(id, enabled);
  }
  setSkillScope(id: string, scope: string[]): Promise<SkillInfo[]> {
    return this.bridge.setSkillScope(id, scope);
  }
  setSkillTags(id: string, tags: string[]): Promise<SkillInfo[]> {
    return this.bridge.setSkillTags(id, tags);
  }
  readSkill(id: string): Promise<{
    id: string;
    name: string;
    instructions: string;
    command?: string;
    contract?: SkillContractFields;
  }> {
    return this.bridge.readSkill
      ? this.bridge.readSkill(id)
      : Promise.reject(new Error('Bản app cũ chưa hỗ trợ đọc nội dung skill — hãy cập nhật app.'));
  }
  updateSkill(
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
    return this.bridge.updateSkill
      ? this.bridge.updateSkill(id, patch)
      : Promise.reject(new Error('Bản app cũ chưa hỗ trợ sửa skill — hãy cập nhật app.'));
  }
  suggestSkillContract(
    name: string,
    instructions: string,
    existingKeys?: string[],
  ): Promise<SkillContractFields & { note?: string }> {
    return this.bridge.suggestSkillContract
      ? this.bridge.suggestSkillContract(name, instructions, existingKeys)
      : Promise.reject(new Error('Bản app cũ chưa hỗ trợ đề xuất hợp đồng — hãy cập nhật app.'));
  }
  deleteSkill(id: string): Promise<SkillInfo[]> {
    return this.bridge.deleteSkill(id);
  }
  appFiles(appId: string): Promise<AppFile[]> {
    return this.bridge.appFiles(appId);
  }
  writeAppFile(appId: string, path: string, content: string): Promise<void> {
    return this.bridge.writeAppFile(appId, path, content);
  }
  readAppEnvSpec(appId: string): Promise<AppEnvSpec> {
    return this.bridge.readAppEnvSpec(appId);
  }
  appViews(appId: string): Promise<AppView[]> {
    return this.bridge.appViews(appId);
  }
  appLastPrompt(appId: string): Promise<string> {
    return this.bridge.appLastPrompt ? this.bridge.appLastPrompt(appId) : Promise.resolve('');
  }
  appDb(appId: string): Promise<AppDbOverview> {
    return this.bridge.appDb(appId);
  }
  appDbRows(appId: string, table: string, limit: number, offset: number): Promise<AppDbResult> {
    return this.bridge.appDbRows(appId, table, limit, offset);
  }
  appDbExec(appId: string, sql: string, params?: unknown[]): Promise<AppDbResult> {
    return this.bridge.appDbExec(appId, sql, params);
  }
  appDbCreate(appId: string): Promise<AppDbOverview> {
    return this.bridge.appDbCreate(appId);
  }
  gitImportLocal(input: GitImportInput): Promise<GitImportResult> {
    return this.bridge.gitImportLocal(input);
  }
  importLocalFolder(): Promise<GitImportResult | null> {
    return this.bridge.importLocalFolder();
  }
  importLocalFolderPath(path: string): Promise<GitImportResult | null> {
    return this.bridge.importLocalFolderPath ? this.bridge.importLocalFolderPath(path) : Promise.resolve(null);
  }
  pathForFile(file: File): string | null {
    return this.bridge.getPathForFile ? this.bridge.getPathForFile(file) : null;
  }
  async uploadAttachment(file: File): Promise<AttachmentRef> {
    // A File can't cross IPC — send its bytes + name; main writes them to the attachments store.
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.bridge.uploadAttachment({ name: file.name, type: file.type, bytes });
  }
  quitApp(): Promise<void> {
    return this.bridge.quitApp();
  }
  deleteApp(appId: string): Promise<void> {
    return this.bridge.deleteApp(appId);
  }
  openAppFolder(appId: string): Promise<void> {
    return this.bridge.openAppFolder(appId);
  }
  // These three are newer bridge methods. If the installed NATIVE (preload) predates them —
  // e.g. a code-pushed renderer running on an older/stale bundled preload — window.toolswave
  // won't have them, and calling `this.bridge.appLocation(...)` would throw synchronously and
  // crash the whole renderer ("Application error: a client-side exception"). Guard so a missing
  // method degrades gracefully (the feature is just unavailable) instead of bricking the app.
  appLocation(appId?: string): Promise<{ dir: string; defaultDir: string; isOverride: boolean }> {
    if (!this.bridge?.appLocation) return Promise.resolve({ dir: '', defaultDir: '', isOverride: false });
    return this.bridge.appLocation(appId);
  }
  chooseAppLocation(): Promise<string | null> {
    if (!this.bridge?.chooseAppLocation) return Promise.resolve(null);
    return this.bridge.chooseAppLocation();
  }
  setDefaultAppsDir(dir: string | null): Promise<void> {
    if (!this.bridge?.setDefaultAppsDir) return Promise.resolve();
    return this.bridge.setDefaultAppsDir(dir);
  }
  listMigratableApps(): Promise<{ id: string; name: string }[]> {
    if (!this.bridge?.listMigratableApps) return Promise.resolve([]);
    return this.bridge.listMigratableApps();
  }
  migrateApp(appId: string, newName?: string): Promise<{ ok: boolean; skipped?: boolean; newName?: string; backup?: string; error?: string }> {
    if (!this.bridge?.migrateApp)
      return Promise.resolve({ ok: false, error: 'Bản lõi này chưa hỗ trợ cập nhật cấu trúc — hãy cài PHẦN LÕI mới nhất.' });
    return this.bridge.migrateApp(appId, newName);
  }
  downloadAppZip(appId: string): Promise<string | null> {
    return this.bridge.downloadAppZip(appId);
  }
  async preview(appId: string, target: PreviewTarget): Promise<PreviewHandle> {
    const r = await this.bridge.preview(appId, target);
    return { url: r.url, target: r.target, services: r.services, kind: r.kind, expoUrl: r.expoUrl, stop: () => this.bridge.stopPreview(appId).catch(() => {}) };
  }
  stopPreview(appId: string, service?: string): Promise<void> {
    return this.bridge.stopPreview(appId, service);
  }
  // Ports panel + app-card covers ship in the BUNDLED preload, so a code-pushed renderer can run
  // on a main process that predates them. Degrade (no cover / a clear message) instead of throwing.
  restartPreview(appId: string, service?: string): Promise<void> {
    if (!this.bridge.restartPreview) return Promise.reject(new Error('Cần bản cài mới (.dmg).'));
    return this.bridge.restartPreview(appId, service);
  }
  listRunningPreviews(): Promise<RunningPreview[]> {
    return this.bridge.listRunningPreviews ? this.bridge.listRunningPreviews() : Promise.resolve([]);
  }
  captureAppScreenshot(appId: string, opts?: { force?: boolean }): Promise<AppShotResult> {
    if (!this.bridge.captureAppScreenshot) return Promise.resolve({ ok: false, shots: [], at: new Date().toISOString() });
    return this.bridge.captureAppScreenshot(appId, opts);
  }
  appScreenshot(appId: string): Promise<AppScreenshot | null> {
    if (!this.bridge.appScreenshot) return Promise.resolve(null);
    return this.bridge.appScreenshot(appId);
  }
  appServices(appId: string): Promise<AppServiceInfo[]> {
    return this.bridge.appServices ? this.bridge.appServices(appId) : Promise.resolve([]);
  }
  apiRoutes(appId: string): Promise<ApiRoute[]> {
    return this.bridge.apiRoutes ? this.bridge.apiRoutes(appId) : Promise.resolve([]);
  }
  apiRequest(appId: string, req: ApiRequestInput): Promise<ApiResponse> {
    if (!this.bridge.apiRequest) return Promise.resolve({ ok: false, status: 0, statusText: '', headers: {}, body: '', timeMs: 0, error: 'Cần bản cài mới (.dmg).' });
    return this.bridge.apiRequest(appId, req);
  }
  deploy(appId: string): Promise<DeployResult> {
    // The Larkwave JWT lives in the renderer's localStorage (account/api `tw_token`).
    const token = (typeof localStorage !== 'undefined' && localStorage.getItem('tw_token')) || '';
    return this.bridge.deploy(appId, token);
  }
  private tw(): string {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('tw_token')) || '';
  }
  deployServer(appId: string): Promise<ServerDeployStartResult> {
    return this.bridge.deployServer(appId, this.tw());
  }
  deployServerStatus(deployId: string): Promise<ServerDeployStatus> {
    return this.bridge.deployServerStatus(deployId, this.tw());
  }

  composeRunnerPrompt(input: CreateBuildInput): Promise<RunnerPromptPreview> {
    return this.bridge.composeRunnerPrompt(input);
  }

  async *createBuild(input: CreateBuildInput): AsyncIterable<BuildEvent> {
    const streamId = `s_${Date.now().toString(36)}_${Math.floor(performance.now())}`;
    const queue: BuildEvent[] = [];
    let done = false;
    let wake: (() => void) | null = null;

    const off = this.bridge.onBuildEvent((sid, ev) => {
      if (sid !== streamId) return;
      if ((ev as { type: string }).type === '__end__') done = true;
      else queue.push(ev as BuildEvent);
      wake?.();
      wake = null;
    });

    try {
      await this.bridge.createBuild(streamId, input);
      while (!done || queue.length) {
        if (!queue.length) {
          await new Promise<void>((r) => (wake = r));
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      off();
    }
  }

  cancelBuild(appId: string): Promise<void> {
    return this.bridge.cancelBuild(appId);
  }
  agentUnlock(): Promise<void> {
    return this.bridge.agentUnlock();
  }
  agentBusyNow(): Promise<AgentBusyOwner | null> {
    return this.bridge.agentBusyNow();
  }
  onAgentBusy(cb: (owner: AgentBusyOwner | null) => void): () => void {
    return this.bridge.onAgentBusy(cb);
  }

  openLocalFile(p: string): Promise<{ ok: boolean; error?: string }> {
    return this.bridge.openLocalFile(p);
  }

  onInstallerProgress(cb: (p: { received: number; total: number }) => void): () => void {
    return this.bridge.onInstallerProgress(cb);
  }

  openExternal(url: string): void {
    this.bridge.openExternal(url);
  }
  checkUpdate(): Promise<DesktopUpdateInfo> {
    return this.bridge.checkUpdate();
  }
  downloadInstaller(): Promise<{ ok: boolean; path?: string; error?: string }> {
    return this.bridge.downloadInstaller();
  }
  applyUpdate(): Promise<DesktopUpdateInfo> {
    return this.bridge.applyUpdate();
  }
  onAuthDeepLink(cb: (token: string) => void): () => void {
    return this.bridge.onAuthDeepLink(cb);
  }
  onLarkWebSessionDead(cb: () => void): () => void {
    return this.bridge.onLarkWebSessionDead(cb);
  }
  onAuthStatus(cb: (status: { phase: 'success' | 'error'; error?: string }) => void): () => void {
    return this.bridge.onAuthStatus(cb);
  }
  startAuthLoopback(): Promise<{ redirect: string }> {
    return this.bridge.startAuthLoopback();
  }
  openAuthWindow(
    url: string,
  ): Promise<{ ok: boolean; kind?: 'login' | 'connect'; provider?: string; error?: string }> {
    return this.bridge.openAuthWindow(url);
  }

  // ── Lark × Claude ──────────────────────────────────────────────────────────
  larkStatus(): Promise<LarkConnection> {
    return this.bridge.larkStatus();
  }
  larkConnect(creds: { appId: string; appSecret: string; name?: string }): Promise<LarkConnection> {
    return this.bridge.larkConnect(creds);
  }
  larkDisconnect(): Promise<void> {
    return this.bridge.larkDisconnect();
  }
  larkHostedPush(): Promise<{ ok: boolean; error?: string }> {
    // Renderer có thể đi TRƯỚC main một quãng (code-push đẩy renderer riêng), nên kênh này có
    // thể chưa tồn tại ở bản main đang chạy. Không chắn thì người dùng bấm nút và nhận TypeError
    // trống trơn; chắn rồi thì họ đọc được phải làm gì.
    if (typeof this.bridge.larkHostedPush !== 'function') {
      return Promise.resolve({
        ok: false,
        error: 'Bản cài trên máy này chưa có tính năng đó — hãy cập nhật app rồi thử lại.',
      });
    }
    return this.bridge.larkHostedPush();
  }
  skillSnapshots(id: string): Promise<{ at: string; by: 'you' | 'ai'; what: string }[]> {
    return this.bridge.skillSnapshots ? this.bridge.skillSnapshots(id) : Promise.resolve([]);
  }
  larkListFieldNames(appToken: string, tableId: string): Promise<string[]> {
    return this.bridge.larkListFieldNames ? this.bridge.larkListFieldNames(appToken, tableId) : Promise.resolve([]);
  }
  reorderSkills(ids: string[]): Promise<SkillInfo[]> {
    return this.bridge.reorderSkills
      ? this.bridge.reorderSkills(ids)
      : Promise.reject(new Error('Bản app cũ chưa hỗ trợ đổi thứ tự — hãy cập nhật app.'));
  }
  restoreSkill(id: string, at: string): Promise<SkillInfo[]> {
    return this.bridge.restoreSkill
      ? this.bridge.restoreSkill(id, at)
      : Promise.reject(new Error('Bản app cũ chưa hỗ trợ khôi phục — hãy cập nhật app.'));
  }
  larkPendingPrompts(convId: string): Promise<LarkPendingPrompts> {
    // Bản main cũ chưa có đường này ⇒ trả rỗng, giao diện chạy như trước chứ không nổ.
    if (typeof this.bridge.larkPendingPrompts !== 'function') return Promise.resolve({ confirms: [], asks: [] });
    return this.bridge.larkPendingPrompts(convId);
  }
  larkListSkillSets(): Promise<LarkSkillSet[]> {
    // Cùng lý do chắn như larkHostedPush: renderer có thể chạy trên một main cũ hơn. Trả rỗng
    // là đúng ở đây — giao diện chỉ đơn giản không hiện mục "bộ kỹ năng".
    if (typeof this.bridge.larkListSkillSets !== 'function') return Promise.resolve([]);
    return this.bridge.larkListSkillSets();
  }
  larkRunSkillSet(skillId: string, seedFacts?: Record<string, unknown>, mode?: 'ask' | 'build'): Promise<LarkSkillRunResult> {
    if (typeof this.bridge.larkRunSkillSet !== 'function') {
      return Promise.reject(new Error('Bản cài trên máy này chưa có tính năng đó — hãy cập nhật app.'));
    }
    return this.bridge.larkRunSkillSet(skillId, seedFacts, mode);
  }
  onLarkSkillSetEvent(cb: (e: unknown) => void): () => void {
    if (typeof this.bridge.onLarkSkillSetEvent !== 'function') return () => {};
    return this.bridge.onLarkSkillSetEvent(cb);
  }
  larkExtractToTable(skillId: string, dryRun: boolean): Promise<LarkExtractResult | null> {
    if (typeof this.bridge.larkExtractToTable !== 'function') {
      return Promise.reject(new Error('Bản cài trên máy này chưa có tính năng đó — hãy cập nhật app.'));
    }
    return this.bridge.larkExtractToTable(skillId, dryRun);
  }
  larkListApps(): Promise<LarkAppRef[]> {
    return this.bridge.larkListApps();
  }
  larkConnectSaved(appId: string): Promise<LarkConnection> {
    return this.bridge.larkConnectSaved(appId);
  }
  larkRenameApp(appId: string, name: string): Promise<LarkAppRef[]> {
    return this.bridge.larkRenameApp(appId, name);
  }
  larkForgetApp(appId: string): Promise<LarkAppRef[]> {
    return this.bridge.larkForgetApp(appId);
  }
  larkCheckConnection(): Promise<LarkConnection> {
    return this.bridge.larkCheckConnection();
  }
  larkUserLogin(): Promise<LarkConnection> {
    return this.bridge.larkUserLogin();
  }
  larkUserLogout(): Promise<LarkConnection> {
    return this.bridge.larkUserLogout();
  }
  larkWebConnect(url?: string): Promise<LarkWebInfo> {
    if (!this.bridge.larkWebConnect) return Promise.reject(new Error('Tính năng "Kết nối Lark web" cần bản cài mới (1.0.48+). Hãy tải + cài lại.'));
    return this.bridge.larkWebConnect(url);
  }
  larkWebStatus(): Promise<LarkWebInfo> {
    // `error:'unavailable'` = the installed main predates this feature → UI hides the panel.
    if (!this.bridge.larkWebStatus) return Promise.resolve({ connected: false, error: 'unavailable' });
    return this.bridge.larkWebStatus();
  }
  larkWebDisconnect(): Promise<void> {
    return this.bridge.larkWebDisconnect ? this.bridge.larkWebDisconnect() : Promise.resolve();
  }
  larkWebReveal(): Promise<void> {
    return this.bridge.larkWebReveal ? this.bridge.larkWebReveal() : Promise.resolve();
  }
  larkWebSetWorkflowUrl(url: string): Promise<LarkWebInfo> {
    if (!this.bridge.larkWebSetWorkflowUrl) return Promise.reject(new Error('Cần bản cài mới.'));
    return this.bridge.larkWebSetWorkflowUrl(url);
  }
  larkWebStartRecorder(url?: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.bridge.larkWebStartRecorder) return Promise.reject(new Error('Tính năng "Điều khiển Lark tạo workflow" cần bản cài mới (.dmg). Hãy tải + cài lại.'));
    return this.bridge.larkWebStartRecorder(url);
  }
  larkWebGetRecording(): Promise<LarkWebRecording | null> {
    return this.bridge.larkWebGetRecording ? this.bridge.larkWebGetRecording() : Promise.resolve(null);
  }
  larkWebReplayWorkflow(opts?: { enable?: boolean }): Promise<{ workflowID: string; baseId: string; title: string }> {
    if (!this.bridge.larkWebReplayWorkflow) return Promise.reject(new Error('Cần bản cài mới (.dmg) để "Tạo lại" workflow.'));
    return this.bridge.larkWebReplayWorkflow(opts);
  }
  larkListBases(): Promise<LarkBaseRef[]> {
    return this.bridge.larkListBases();
  }
  larkDiscoverBases(): Promise<LarkBaseRef[]> {
    return this.bridge.larkDiscoverBases();
  }
  larkBaseSnapshot(appToken: string): Promise<LarkBaseSnapshot> {
    return this.bridge.larkBaseSnapshot(appToken);
  }
  larkAddBase(input: { appToken?: string; url?: string; name?: string; description?: string }): Promise<LarkBaseRef[]> {
    return this.bridge.larkAddBase(input);
  }
  larkListAutomations(): Promise<LarkAutomation[]> {
    return this.bridge.larkListAutomations();
  }
  larkSaveAutomation(rule: LarkAutomationInput): Promise<LarkAutomation[]> {
    return this.bridge.larkSaveAutomation(rule);
  }
  larkDeleteAutomation(id: string): Promise<LarkAutomation[]> {
    return this.bridge.larkDeleteAutomation(id);
  }
  larkSetAutomationEnabled(id: string, on: boolean): Promise<LarkAutomation[]> {
    return this.bridge.larkSetAutomationEnabled(id, on);
  }
  larkRunAutomation(id: string): Promise<LarkAutomationRunResult> {
    return this.bridge.larkRunAutomation(id);
  }
  larkListTables(appToken: string): Promise<LarkTableRef[]> {
    return this.bridge.larkListTables(appToken);
  }
  larkRemoveBase(appToken: string): Promise<LarkBaseRef[]> {
    return this.bridge.larkRemoveBase(appToken);
  }
  larkAnswerAsk(callId: string, answer: string): Promise<void> {
    return this.bridge.larkAnswerAsk(callId, answer);
  }
  larkConfirmTool(callId: string, decision: 'allow' | 'deny'): Promise<void> {
    return this.bridge.larkConfirmTool(callId, decision);
  }
  larkSetAutoApprove(on: boolean): Promise<LarkConnection> {
    return this.bridge.larkSetAutoApprove(on);
  }
  larkSetAgentPrefs(prefs: { runner?: string; model?: string; apiMode?: boolean }): Promise<LarkConnection> {
    return this.bridge.larkSetAgentPrefs(prefs);
  }
  larkBackupSync(): Promise<{ at: string } | null> {
    return this.bridge.larkBackupSync(this.tw());
  }
  larkResetChat(): Promise<void> {
    return this.bridge.larkResetChat();
  }
  larkShareSession(id: string): Promise<LarkShareInfo> {
    return this.bridge.larkShareSession(id, this.tw());
  }
  larkUnshareSession(id: string): Promise<void> {
    return this.bridge.larkUnshareSession(id, this.tw());
  }
  larkShareStatus(id: string): Promise<{ url: string | null }> {
    return this.bridge.larkShareStatus(id, this.tw());
  }
  larkSessions(): Promise<LarkSessionMeta[]> {
    return this.bridge.larkSessions();
  }
  larkNewSession(bases?: LarkBaseRef[]): Promise<{ id: string }> {
    return this.bridge.larkNewSession(bases);
  }
  larkSwitchSession(id: string): Promise<{ items: unknown[]; bases?: LarkBaseRef[]; runner?: string; model?: string }> {
    return this.bridge.larkSwitchSession(id);
  }
  larkSaveSession(id: string, items: unknown[], bases?: LarkBaseRef[]): Promise<void> {
    return this.bridge.larkSaveSession(id, items, bases);
  }
  larkNotes(id: string): Promise<LarkNoteDoc | null> {
    return this.bridge.larkNotes(id);
  }
  larkSaveNotes(id: string, doc: LarkNoteDoc): Promise<void> {
    return this.bridge.larkSaveNotes(id, doc);
  }
  larkSpec(): Promise<LarkSpecDoc | null> {
    return this.bridge.larkSpec(this.tw());
  }
  larkSaveSpec(doc: LarkSpecDoc): Promise<void> {
    return this.bridge.larkSaveSpec(doc, this.tw());
  }
  larkBuildSpec(): Promise<SpecBuildResult> {
    return this.bridge.larkBuildSpec(this.tw());
  }
  larkPromoteToSpec(input: SpecPromoteInput): Promise<LarkSpecDoc> {
    return this.bridge.larkPromoteToSpec(input, this.tw());
  }
  cmsSyncConfig(): Promise<{ baseUrl: string; webReady: boolean }> {
    return this.bridge.cmsSyncConfig();
  }
  cmsSyncSetBaseUrl(url: string): Promise<void> {
    return this.bridge.cmsSyncSetBaseUrl(url);
  }
  cmsSyncListJobs(): Promise<CmsSyncJob[]> {
    return this.bridge.cmsSyncListJobs();
  }
  cmsSyncCreateJob(input: { name: string; appToken: string; tableIds: string[]; enabled?: boolean; intervalSeconds?: number }): Promise<CmsSyncJob> {
    return this.bridge.cmsSyncCreateJob(input);
  }
  cmsSyncSetJobTables(jobId: string, tableIds: string[]): Promise<CmsSyncJob> {
    return this.bridge.cmsSyncSetJobTables(jobId, tableIds);
  }
  cmsSyncUpdateJob(jobId: string, patch: CmsSyncJobPatch): Promise<CmsSyncJob> {
    return this.bridge.cmsSyncUpdateJob(jobId, patch);
  }
  cmsSyncGetErrorReport(): Promise<CmsSyncErrorReport> {
    return this.bridge.cmsSyncGetErrorReport();
  }
  cmsSyncSetErrorReport(cfg: CmsSyncErrorReport): Promise<CmsSyncErrorReport> {
    return this.bridge.cmsSyncSetErrorReport(cfg);
  }
  cmsSyncKeeperStatus(): Promise<CmsKeeperStatus> {
    return this.bridge.cmsSyncKeeperStatus
      ? this.bridge.cmsSyncKeeperStatus()
      : Promise.resolve({ present: false, online: false });
  }
  cmsSyncListLarkChats(): Promise<CmsSyncLarkChat[]> {
    return this.bridge.cmsSyncListLarkChats();
  }
  cmsSyncCreateLarkChat(name: string): Promise<{ chatId: string; name: string; addedMembers: number; joinLink?: string; memberError?: string }> {
    return this.bridge.cmsSyncCreateLarkChat(name);
  }
  cmsSyncTestErrorReport(target: { larkWebhookUrl?: string; chatId?: string }): Promise<{ ok: boolean; results: { target: string; ok: boolean; error?: string }[] }> {
    return this.bridge.cmsSyncTestErrorReport(target);
  }
  cmsSyncRefreshAll(): Promise<CmsSyncRefreshResult> {
    return this.bridge.cmsSyncRefreshAll();
  }
  cmsSyncLoginHistory(): Promise<LarkReloginEntry[]> {
    return this.bridge.cmsSyncLoginHistory();
  }
  cmsSyncRefreshJob(jobId: string): Promise<CmsSyncJob> {
    return this.bridge.cmsSyncRefreshJob(jobId);
  }
  cmsSyncExecute(jobId: string): Promise<{ ok: boolean; synced?: number; total?: number; failed?: string[]; details?: string[]; viaLocal?: boolean; error?: string }> {
    return this.bridge.cmsSyncExecute(jobId);
  }
  cmsSyncToggle(jobId: string): Promise<CmsSyncJob> {
    return this.bridge.cmsSyncToggle(jobId);
  }
  cmsSyncDeleteJob(jobId: string): Promise<void> {
    return this.bridge.cmsSyncDeleteJob(jobId);
  }
  larkSummaries(id: string): Promise<Record<string, string>> {
    return this.bridge.larkSummaries(id);
  }
  larkSummarize(id: string, itemId: string, text: string): Promise<string> {
    return this.bridge.larkSummarize(id, itemId, text);
  }
  larkSetAccount(userId: string | null): Promise<void> {
    return this.bridge.larkSetAccount(userId);
  }
  larkGrantPolicies(): Promise<Record<string, LarkGrantPolicy>> {
    return this.bridge.larkGrantPolicies();
  }
  larkSetGrantPolicy(grantId: string, policy: LarkGrantPolicy | null): Promise<void> {
    return this.bridge.larkSetGrantPolicy(grantId, policy);
  }
  larkRunGrantTurn(grantId: string, prompt: string) {
    return this.bridge.larkRunGrantTurn(grantId, prompt);
  }
  larkRunAgentGrantTurn(grantId: string, prompt: string) {
    return this.bridge.larkRunAgentGrantTurn(grantId, prompt);
  }
  larkDeleteSession(id: string): Promise<void> {
    return this.bridge.larkDeleteSession(id);
  }
  larkCompactSession(convId?: string): Promise<{ ok: boolean; summary: string }> {
    return this.bridge.larkCompactSession(convId);
  }

  larkHandoffSession(): Promise<{ summary: string; id: string; bases: LarkBaseRef[] }> {
    return this.bridge.larkHandoffSession();
  }
  larkBotStatus(): Promise<LarkBotStatus> {
    return this.bridge.larkBotStatus();
  }
  larkBotConfigure(cfg: LarkBotConfig): Promise<LarkBotStatus> {
    return this.bridge.larkBotConfigure(cfg);
  }
  larkBotCreateChat(name: string): Promise<{ chatId: string; name: string; joinLink?: string }> {
    return this.bridge.larkBotCreateChat(name);
  }
  listPlugins(): Promise<PluginInfo[]> {
    return this.bridge.pluginList();
  }
  installPlugin(source: string): Promise<PluginInfo[]> {
    return this.bridge.pluginInstall(source);
  }
  setPluginEnabled(id: string, enabled: boolean): Promise<PluginInfo[]> {
    return this.bridge.pluginSetEnabled(id, enabled);
  }
  uninstallPlugin(id: string): Promise<PluginInfo[]> {
    return this.bridge.pluginUninstall(id);
  }
  larkPluginPanels(): Promise<PluginPanelInfo[]> {
    return this.bridge.pluginPanels();
  }
  larkRunTool(name: string, input: Record<string, unknown>): Promise<LarkToolRunResult> {
    return this.bridge.larkRunTool(name, input);
  }

  async *larkChat(input: LarkChatInput): AsyncIterable<LarkChatEvent> {
    const streamId = `lk_${Date.now().toString(36)}_${Math.floor(performance.now())}`;
    const queue: LarkChatEvent[] = [];
    let done = false;
    let wake: (() => void) | null = null;

    const off = this.bridge.onLarkChatEvent((sid, ev) => {
      if (sid !== streamId) return;
      if ((ev as { type: string }).type === '__end__') done = true;
      else queue.push(ev as LarkChatEvent);
      wake?.();
      wake = null;
    });

    try {
      await this.bridge.larkChat(streamId, input);
      while (!done || queue.length) {
        if (!queue.length) {
          await new Promise<void>((r) => (wake = r));
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      off();
    }
  }

  readonly claude: ClaudeControls = {
    status: () => this.bridge.claudeStatus(),
    logout: () => this.bridge.claudeLogout(),
    login: () => this.streamLogin(),
    setToken: (token: string) => this.bridge.claudeSetToken(token),
    clearToken: () => this.bridge.claudeClearToken(),
    listKeys: () => this.bridge.claudeListKeys(),
    addKey: (input) => this.bridge.claudeAddKey(input),
    removeKey: (id) => this.bridge.claudeRemoveKey(id),
    setActiveKey: (id) => this.bridge.claudeSetActiveKey(id),
    validateKey: (key) => this.bridge.claudeValidateKey(key),
  };

  // Multi-CLI runner registry (Claude/Grok/Gemini/Codex) — status + paste-key.
  readonly runners: RunnerControls = {
    list: () => this.bridge.runners(),
    setToken: (id: string, token: string) => this.bridge.runnerSetToken(id, token),
    clearToken: (id: string) => this.bridge.runnerClearToken(id),
  };

  // Remote control ("Điều khiển từ xa"). The main process needs the Larkwave
  // account JWT to open its SSE stream → forward it (same `tw_token` as deploy).
  readonly agent: AgentControls = {
    status: () => this.bridge.agentStatus(this.tw()),
    setEnabled: (on: boolean) => this.bridge.agentSetEnabled(on, this.tw()),
    regenerateToken: () => this.bridge.agentRegenToken(this.tw()),
    createToken: (name: string) => this.bridge.agentCreateToken(name, this.tw()),
    listTokens: () => this.bridge.agentListTokens(this.tw()),
    deleteToken: (id: string) => this.bridge.agentDeleteToken(id, this.tw()),
    testToken: (id: string) => this.bridge.agentTestToken(id, this.tw()),
    updateTokenNotify: (id: string, input: UpdateTokenNotifyInput) =>
      this.bridge.agentUpdateTokenNotify(id, input, this.tw()),
    telegramLink: () => this.bridge.agentTelegramLink(this.tw()),
    listTelegramBindings: () => this.bridge.agentTelegramBindings(this.tw()),
    deleteTelegramBinding: (id: string) => this.bridge.agentDeleteTelegramBinding(id, this.tw()),
    syncApps: () => this.bridge.agentSyncApps(this.tw()),
    onEvent: (cb: (s: AgentClientStatus) => void) => this.bridge.onAgentEvent(cb),
  };

  private async *streamLogin(): AsyncGenerator<ClaudeLoginEvent> {
    const streamId = `cl_${Date.now().toString(36)}_${Math.floor(performance.now())}`;
    const queue: ClaudeLoginEvent[] = [];
    let done = false;
    let wake: (() => void) | null = null;
    const off = this.bridge.onClaudeLoginEvent((sid, ev) => {
      if (sid !== streamId) return;
      if ((ev as { type: string }).type === '__end__') done = true;
      else queue.push(ev as ClaudeLoginEvent);
      wake?.();
      wake = null;
    });
    try {
      await this.bridge.claudeLogin(streamId);
      while (!done || queue.length) {
        if (!queue.length) {
          await new Promise<void>((r) => (wake = r));
          continue;
        }
        yield queue.shift()!;
      }
    } finally {
      off();
    }
  }
}
