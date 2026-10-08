import { contextBridge, ipcRenderer } from 'electron';

/**
 * The preload runs in Electron's SANDBOXED context, where it cannot `require()`
 * workspace packages at runtime — so the IPC channel names are inlined here
 * (must stay in sync with @larkwave/core `IPC`). This is the only surface the
 * renderer can touch; everything privileged stays in the main process.
 */
const CH = {
  auth: 'tw:auth',
  accountFetch: 'tw:accountFetch',
  accountUpload: 'tw:accountUpload',
  accountGetToken: 'tw:accountGetToken',
  accountSetToken: 'tw:accountSetToken',
  listSkills: 'tw:listSkills',
  importSkill: 'tw:importSkill',
  createSkill: 'tw:createSkill',
  setSkillEnabled: 'tw:setSkillEnabled',
  setSkillScope: 'tw:setSkillScope',
  setSkillTags: 'tw:setSkillTags',
  readSkill: 'tw:readSkill',
  updateSkill: 'tw:updateSkill',
  deleteSkill: 'tw:deleteSkill',
  quitApp: 'tw:quitApp',
  agentBusy: 'tw:agentBusy',
  agentBusyNow: 'tw:agentBusyNow',
  // Giữ ĐỒNG BỘ với IPC trong packages/core/src/index.ts — preload có bảng kênh riêng, lệch một
  // chuỗi là kênh im lặng không bao giờ tới nơi.
  agentBusyList: 'tw:agentBusyList',
  larkRenameSession: 'tw:larkRenameSession',
  larkListFiles: 'tw:larkListFiles',
  larkReadFile: 'tw:larkReadFile',
  larkDeleteFile: 'tw:larkDeleteFile',
  agentUnlock: 'tw:agentUnlock',
  claudeStatus: 'tw:claudeStatus',
  claudeLogin: 'tw:claudeLogin',
  claudeLoginEvent: 'tw:claudeLoginEvent',
  claudeLogout: 'tw:claudeLogout',
  claudeSetToken: 'tw:claudeSetToken',
  claudeClearToken: 'tw:claudeClearToken',
  claudeListKeys: 'tw:claudeListKeys',
  claudeAddKey: 'tw:claudeAddKey',
  claudeRemoveKey: 'tw:claudeRemoveKey',
  claudeSetActiveKey: 'tw:claudeSetActiveKey',
  claudeValidateKey: 'tw:claudeValidateKey',
  runners: 'tw:runners',
  runnerSetToken: 'tw:runnerSetToken',
  runnerClearToken: 'tw:runnerClearToken',
  agentStatus: 'tw:agentStatus',
  agentSetEnabled: 'tw:agentSetEnabled',
  agentRegenToken: 'tw:agentRegenToken',
  agentCreateToken: 'tw:agentCreateToken',
  agentListTokens: 'tw:agentListTokens',
  agentDeleteToken: 'tw:agentDeleteToken',
  agentTestToken: 'tw:agentTestToken',
  agentUpdateTokenNotify: 'tw:agentUpdateTokenNotify',
  agentTelegramLink: 'tw:agentTelegramLink',
  agentTelegramBindings: 'tw:agentTelegramBindings',
  agentDeleteTelegramBinding: 'tw:agentDeleteTelegramBinding',
  agentEvent: 'tw:agentEvent',
  openExternal: 'tw:openExternal',
  openLocalFile: 'tw:openLocalFile',
  installerProgress: 'tw:installerProgress',
  larkCompactSession: 'tw:larkCompactSession',
  checkUpdate: 'tw:checkUpdate',
  applyUpdate: 'tw:applyUpdate',
  downloadInstaller: 'tw:downloadInstaller',
  authDeepLink: 'tw:authDeepLink',
  authStatus: 'tw:authStatus',
  authLoopback: 'tw:authLoopback',
  authWindow: 'tw:authWindow',
  larkStatus: 'tw:larkStatus',
  larkConnect: 'tw:larkConnect',
  larkDisconnect: 'tw:larkDisconnect',
  larkHostedPush: 'tw:larkHostedPush',
  larkListSkillSets: 'tw:larkListSkillSets',
  larkPendingPrompts: 'tw:larkPendingPrompts',
  skillSnapshots: 'tw:skillSnapshots',
  restoreSkill: 'tw:restoreSkill',
  reorderSkills: 'tw:reorderSkills',
  larkListFieldNames: 'tw:larkListFieldNames',
  larkRunSkillSet: 'tw:larkRunSkillSet',
  suggestSkillContract: 'tw:suggestSkillContract',
  larkSkillSetEvent: 'tw:larkSkillSetEvent',
  larkExtractToTable: 'tw:larkExtractToTable',
  larkListApps: 'tw:larkListApps',
  larkConnectSaved: 'tw:larkConnectSaved',
  larkRenameApp: 'tw:larkRenameApp',
  larkForgetApp: 'tw:larkForgetApp',
  larkCheckConnection: 'tw:larkCheckConnection',
  larkUserLogin: 'tw:larkUserLogin',
  larkUserLogout: 'tw:larkUserLogout',
  larkWebConnect: 'tw:larkWebConnect',
  larkWebStatus: 'tw:larkWebStatus',
  larkWebDisconnect: 'tw:larkWebDisconnect',
  larkWebReveal: 'tw:larkWebReveal',
  larkWebSetWorkflowUrl: 'tw:larkWebSetWorkflowUrl',
  larkWebStartRecorder: 'tw:larkWebStartRecorder',
  larkWebGetRecording: 'tw:larkWebGetRecording',
  larkWebReplayWorkflow: 'tw:larkWebReplayWorkflow',
  larkBrowserAttach: 'tw:larkBrowserAttach',
  larkBrowserDetach: 'tw:larkBrowserDetach',
  larkBrowserState: 'tw:larkBrowserState',
  larkBrowserNavigate: 'tw:larkBrowserNavigate',
  larkBrowserStopAi: 'tw:larkBrowserStopAi',
  larkBrowserResumeAi: 'tw:larkBrowserResumeAi',
  larkUiTemplateList: 'tw:larkUiTemplateList',
  larkUiTemplateSave: 'tw:larkUiTemplateSave',
  larkUiTemplateDelete: 'tw:larkUiTemplateDelete',
  larkUiTemplateApply: 'tw:larkUiTemplateApply',
  larkListBases: 'tw:larkListBases',
  larkDiscoverBases: 'tw:larkDiscoverBases',
  larkBaseSnapshot: 'tw:larkBaseSnapshot',
  larkAddBase: 'tw:larkAddBase',
  larkRemoveBase: 'tw:larkRemoveBase',
  larkListAutomations: 'tw:larkListAutomations',
  larkSaveAutomation: 'tw:larkSaveAutomation',
  larkDeleteAutomation: 'tw:larkDeleteAutomation',
  larkSetAutomationEnabled: 'tw:larkSetAutomationEnabled',
  larkRunAutomation: 'tw:larkRunAutomation',
  larkListTables: 'tw:larkListTables',
  larkChat: 'tw:larkChat',
  larkChatEvent: 'tw:larkChatEvent',
  larkConfirmTool: 'tw:larkConfirmTool',
  larkAnswerAsk: 'tw:larkAnswerAsk',
  larkSetAutoApprove: 'tw:larkSetAutoApprove',
  larkSetAgentPrefs: 'tw:larkSetAgentPrefs',
  larkBackupSync: 'tw:larkBackupSync',
  larkResetChat: 'tw:larkResetChat',
  larkShareSession: 'tw:larkShareSession',
  larkUnshareSession: 'tw:larkUnshareSession',
  larkShareStatus: 'tw:larkShareStatus',
  larkSessions: 'tw:larkSessions',
  larkNewSession: 'tw:larkNewSession',
  larkSwitchSession: 'tw:larkSwitchSession',
  larkSaveSession: 'tw:larkSaveSession',
  larkDeleteSession: 'tw:larkDeleteSession',
  larkNotes: 'tw:larkNotes',
  larkSaveNotes: 'tw:larkSaveNotes',
  larkSpec: 'tw:larkSpec',
  larkSaveSpec: 'tw:larkSaveSpec',
  larkBuildSpec: 'tw:larkBuildSpec',
  larkPromoteToSpec: 'tw:larkPromoteToSpec',
  cmsSyncConfig: 'tw:cmsSyncConfig',
  cmsSyncSetBaseUrl: 'tw:cmsSyncSetBaseUrl',
  cmsSyncListJobs: 'tw:cmsSyncListJobs',
  cmsSyncCreateJob: 'tw:cmsSyncCreateJob',
  cmsSyncSetJobTables: 'tw:cmsSyncSetJobTables',
  cmsSyncUpdateJob: 'tw:cmsSyncUpdateJob',
  cmsSyncGetErrorReport: 'tw:cmsSyncGetErrorReport',
  cmsSyncSetErrorReport: 'tw:cmsSyncSetErrorReport',
  cmsSyncListLarkChats: 'tw:cmsSyncListLarkChats',
  cmsSyncCreateLarkChat: 'tw:cmsSyncCreateLarkChat',
  cmsSyncTestErrorReport: 'tw:cmsSyncTestErrorReport',
  cmsSyncKeeperStatus: 'tw:cmsSyncKeeperStatus',
  larkWebSessionDead: 'tw:larkWebSessionDead',
  cmsSyncRefreshAll: 'tw:cmsSyncRefreshAll',
  cmsSyncLoginHistory: 'tw:cmsSyncLoginHistory',
  cmsSyncRefreshJob: 'tw:cmsSyncRefreshJob',
  cmsSyncExecute: 'tw:cmsSyncExecute',
  cmsSyncToggle: 'tw:cmsSyncToggle',
  cmsSyncDeleteJob: 'tw:cmsSyncDeleteJob',
  larkSummaries: 'tw:larkSummaries',
  larkSummarize: 'tw:larkSummarize',
  larkSetAccount: 'tw:larkSetAccount',
  larkGrantPolicies: 'tw:larkGrantPolicies',
  larkSetGrantPolicy: 'tw:larkSetGrantPolicy',
  larkRunGrantTurn: 'tw:larkRunGrantTurn',
  larkRunAgentGrantTurn: 'tw:larkRunAgentGrantTurn',
  larkHandoffSession: 'tw:larkHandoffSession',
  larkBotStatus: 'tw:larkBotStatus',
  larkBotConfigure: 'tw:larkBotConfigure',
  larkBotCreateChat: 'tw:larkBotCreateChat',
  pluginList: 'tw:pluginList',
  pluginInstall: 'tw:pluginInstall',
  pluginSetEnabled: 'tw:pluginSetEnabled',
  pluginUninstall: 'tw:pluginUninstall',
  pluginPanels: 'tw:pluginPanels',
  larkRunTool: 'tw:larkRunTool',
} as const;

const bridge = {
  auth: () => ipcRenderer.invoke(CH.auth),
  accountFetch: (req: unknown) => ipcRenderer.invoke(CH.accountFetch, req),
  accountUpload: (req: unknown) => ipcRenderer.invoke(CH.accountUpload, req),
  accountGetToken: () => ipcRenderer.invoke(CH.accountGetToken),
  accountSetToken: (token: string | null) => ipcRenderer.invoke(CH.accountSetToken, token),
  listSkills: () => ipcRenderer.invoke(CH.listSkills),
  importSkill: (scope?: string[], tags?: string[]) => ipcRenderer.invoke(CH.importSkill, scope, tags),
  createSkill: (
    name: string,
    instructions: string,
    scope?: string[],
    tags?: string[],
    command?: string,
    contract?: unknown,
  ) => ipcRenderer.invoke(CH.createSkill, name, instructions, scope, tags, command, contract),
  setSkillEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke(CH.setSkillEnabled, id, enabled),
  setSkillScope: (id: string, scope: string[]) => ipcRenderer.invoke(CH.setSkillScope, id, scope),
  setSkillTags: (id: string, tags: string[]) => ipcRenderer.invoke(CH.setSkillTags, id, tags),
  // Marker only a main >= 1.0.280 ships. `command` rides the EXISTING createSkill/updateSkill
  // payloads, so there is no new method to feature-detect — but the renderer code-pushes AHEAD of
  // the installed main, and an older main would silently DROP the command. Its presence is what
  // lets the renderer tell the truth about `supportsSkillCommands` instead of assuming.
  skillCommandsSupported: true,
  // Cùng lý do với `skillCommandsSupported`: hợp đồng đi ghép vào payload create/update sẵn có nên
  // không có phương thức mới để dò. Một main cũ sẽ nuốt mất hợp đồng mà không báo gì — cờ này là
  // thứ duy nhất cho renderer biết sự thật thay vì đoán.
  skillContractsSupported: true,
  readSkill: (id: string) => ipcRenderer.invoke(CH.readSkill, id),
  updateSkill: (
    id: string,
    patch: {
      name?: string;
      instructions?: string;
      scope?: string[];
      tags?: string[];
      command?: string;
      contract?: unknown;
    },
  ) => ipcRenderer.invoke(CH.updateSkill, id, patch),
  deleteSkill: (id: string) => ipcRenderer.invoke(CH.deleteSkill, id),
  quitApp: () => ipcRenderer.invoke(CH.quitApp),
  claudeStatus: () => ipcRenderer.invoke(CH.claudeStatus),
  claudeLogout: () => ipcRenderer.invoke(CH.claudeLogout),
  claudeSetToken: (token: string) => ipcRenderer.invoke(CH.claudeSetToken, token),
  claudeClearToken: () => ipcRenderer.invoke(CH.claudeClearToken),
  claudeListKeys: () => ipcRenderer.invoke(CH.claudeListKeys),
  claudeAddKey: (input: unknown) => ipcRenderer.invoke(CH.claudeAddKey, input),
  claudeRemoveKey: (id: string) => ipcRenderer.invoke(CH.claudeRemoveKey, id),
  claudeSetActiveKey: (id: string) => ipcRenderer.invoke(CH.claudeSetActiveKey, id),
  claudeValidateKey: (key: string) => ipcRenderer.invoke(CH.claudeValidateKey, key),

  // Multi-CLI runners (Claude/Grok/Gemini/Codex).
  runners: () => ipcRenderer.invoke(CH.runners),
  runnerSetToken: (id: string, token: string) => ipcRenderer.invoke(CH.runnerSetToken, id, token),
  runnerClearToken: (id: string) => ipcRenderer.invoke(CH.runnerClearToken, id),

  // Remote control ("Điều khiển từ xa") agent client — token forwarded by the renderer.
  agentStatus: (token?: string) => ipcRenderer.invoke(CH.agentStatus, token),
  agentSetEnabled: (on: boolean, token?: string) => ipcRenderer.invoke(CH.agentSetEnabled, on, token),
  agentRegenToken: (token: string) => ipcRenderer.invoke(CH.agentRegenToken, token),
  agentCreateToken: (name: string, token?: string) => ipcRenderer.invoke(CH.agentCreateToken, name, token),
  agentListTokens: (token?: string) => ipcRenderer.invoke(CH.agentListTokens, token),
  agentDeleteToken: (id: string, token?: string) => ipcRenderer.invoke(CH.agentDeleteToken, id, token),
  agentTestToken: (id: string, token?: string) => ipcRenderer.invoke(CH.agentTestToken, id, token),
  agentUpdateTokenNotify: (id: string, input: unknown, token?: string) =>
    ipcRenderer.invoke(CH.agentUpdateTokenNotify, id, input, token),
  agentTelegramLink: (token?: string) => ipcRenderer.invoke(CH.agentTelegramLink, token),
  agentTelegramBindings: (token?: string) => ipcRenderer.invoke(CH.agentTelegramBindings, token),
  agentDeleteTelegramBinding: (id: string, token?: string) =>
    ipcRenderer.invoke(CH.agentDeleteTelegramBinding, id, token),
  onAgentEvent: (cb: (s: unknown) => void) => {
    const handler = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on(CH.agentEvent, handler);
    return () => ipcRenderer.removeListener(CH.agentEvent, handler);
  },
  agentBusyNow: () => ipcRenderer.invoke(CH.agentBusyNow),
  agentBusyList: () => ipcRenderer.invoke(CH.agentBusyList),
  onAgentBusyList: (cb: (owners: unknown[]) => void) => {
    const handler = (_e: unknown, list: unknown[]) => cb(list);
    ipcRenderer.on(CH.agentBusyList, handler);
    return () => ipcRenderer.removeListener(CH.agentBusyList, handler);
  },
  agentUnlock: (key?: string) => ipcRenderer.invoke(CH.agentUnlock, key),
  onAgentBusy: (cb: (owner: unknown) => void) => {
    const handler = (_e: unknown, owner: unknown) => cb(owner);
    ipcRenderer.on(CH.agentBusy, handler);
    return () => ipcRenderer.removeListener(CH.agentBusy, handler);
  },

  claudeLogin: (streamId: string) => ipcRenderer.invoke(CH.claudeLogin, streamId),
  onClaudeLoginEvent: (cb: (streamId: string, ev: unknown) => void) => {
    const handler = (_e: unknown, streamId: string, ev: unknown) => cb(streamId, ev);
    ipcRenderer.on(CH.claudeLoginEvent, handler);
    return () => ipcRenderer.removeListener(CH.claudeLoginEvent, handler);
  },
  openExternal: (url: string) => ipcRenderer.invoke(CH.openExternal, url),
  openLocalFile: (p: string) => ipcRenderer.invoke(CH.openLocalFile, p),
  larkCompactSession: (convId?: string) => ipcRenderer.invoke(CH.larkCompactSession, convId),
  onInstallerProgress: (cb: (p: { received: number; total: number }) => void) => {
    const handler = (_e: unknown, p: { received: number; total: number }) => cb(p);
    ipcRenderer.on(CH.installerProgress, handler);
    return () => ipcRenderer.removeListener(CH.installerProgress, handler);
  },
  checkUpdate: () => ipcRenderer.invoke(CH.checkUpdate),
  applyUpdate: () => ipcRenderer.invoke(CH.applyUpdate),
  downloadInstaller: () => ipcRenderer.invoke(CH.downloadInstaller),
  onAuthDeepLink: (cb: (token: string) => void) => {
    const handler = (_e: unknown, token: string) => cb(token);
    ipcRenderer.on(CH.authDeepLink, handler);
    return () => ipcRenderer.removeListener(CH.authDeepLink, handler);
  },
  onLarkWebSessionDead: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on(CH.larkWebSessionDead, handler);
    return () => ipcRenderer.removeListener(CH.larkWebSessionDead, handler);
  },
  onAuthStatus: (cb: (status: { phase: 'success' | 'error'; error?: string }) => void) => {
    const handler = (_e: unknown, status: { phase: 'success' | 'error'; error?: string }) => cb(status);
    ipcRenderer.on(CH.authStatus, handler);
    return () => ipcRenderer.removeListener(CH.authStatus, handler);
  },
  startAuthLoopback: () => ipcRenderer.invoke(CH.authLoopback),
  openAuthWindow: (url: string) => ipcRenderer.invoke(CH.authWindow, url),

  // Lark × Agents.
  larkStatus: () => ipcRenderer.invoke(CH.larkStatus),
  larkConnect: (creds: unknown) => ipcRenderer.invoke(CH.larkConnect, creds),
  larkDisconnect: () => ipcRenderer.invoke(CH.larkDisconnect),
  larkHostedPush: () => ipcRenderer.invoke(CH.larkHostedPush),
  larkListSkillSets: () => ipcRenderer.invoke(CH.larkListSkillSets),
  larkPendingPrompts: (convId: string) => ipcRenderer.invoke(CH.larkPendingPrompts, convId),
  skillSnapshots: (id: string) => ipcRenderer.invoke(CH.skillSnapshots, id),
  restoreSkill: (id: string, at: string) => ipcRenderer.invoke(CH.restoreSkill, id, at),
  reorderSkills: (ids: string[]) => ipcRenderer.invoke(CH.reorderSkills, ids),
  larkListFieldNames: (appToken: string, tableId: string) => ipcRenderer.invoke(CH.larkListFieldNames, appToken, tableId),
  larkRunSkillSet: (skillId: string, seedFacts?: Record<string, unknown>, mode?: 'ask' | 'build') =>
    ipcRenderer.invoke(CH.larkRunSkillSet, skillId, seedFacts, mode),
  suggestSkillContract: (name: string, instructions: string, existingKeys?: string[]) =>
    ipcRenderer.invoke(CH.suggestSkillContract, name, instructions, existingKeys),
  larkExtractToTable: (skillId: string, dryRun: boolean) =>
    ipcRenderer.invoke(CH.larkExtractToTable, skillId, dryRun),
  onLarkSkillSetEvent: (cb: (e: unknown) => void) => {
    const h = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(CH.larkSkillSetEvent, h);
    return () => ipcRenderer.removeListener(CH.larkSkillSetEvent, h);
  },
  larkListApps: () => ipcRenderer.invoke(CH.larkListApps),
  larkConnectSaved: (appId: string) => ipcRenderer.invoke(CH.larkConnectSaved, appId),
  larkRenameApp: (appId: string, name: string) => ipcRenderer.invoke(CH.larkRenameApp, appId, name),
  larkForgetApp: (appId: string) => ipcRenderer.invoke(CH.larkForgetApp, appId),
  larkCheckConnection: () => ipcRenderer.invoke(CH.larkCheckConnection),
  larkUserLogin: () => ipcRenderer.invoke(CH.larkUserLogin),
  larkUserLogout: () => ipcRenderer.invoke(CH.larkUserLogout),
  larkWebConnect: (url?: string) => ipcRenderer.invoke(CH.larkWebConnect, url),
  larkWebStatus: () => ipcRenderer.invoke(CH.larkWebStatus),
  larkWebDisconnect: () => ipcRenderer.invoke(CH.larkWebDisconnect),
  larkWebReveal: () => ipcRenderer.invoke(CH.larkWebReveal),
  larkWebSetWorkflowUrl: (url: string) => ipcRenderer.invoke(CH.larkWebSetWorkflowUrl, url),
  larkWebStartRecorder: (url?: string) => ipcRenderer.invoke(CH.larkWebStartRecorder, url),
  larkWebGetRecording: () => ipcRenderer.invoke(CH.larkWebGetRecording),
  larkWebReplayWorkflow: (opts?: { enable?: boolean }) => ipcRenderer.invoke(CH.larkWebReplayWorkflow, opts),
  larkBrowserAttach: (rect: { x: number; y: number; width: number; height: number }) => ipcRenderer.invoke(CH.larkBrowserAttach, rect),
  larkBrowserDetach: () => ipcRenderer.invoke(CH.larkBrowserDetach),
  larkBrowserState: () => ipcRenderer.invoke(CH.larkBrowserState),
  larkBrowserNavigate: (input: { url?: string; action?: string }) => ipcRenderer.invoke(CH.larkBrowserNavigate, input),
  larkBrowserStopAi: () => ipcRenderer.invoke(CH.larkBrowserStopAi),
  larkBrowserResumeAi: () => ipcRenderer.invoke(CH.larkBrowserResumeAi),
  larkUiTemplateList: () => ipcRenderer.invoke(CH.larkUiTemplateList),
  larkUiTemplateSave: (input: { name: string; description?: string }) => ipcRenderer.invoke(CH.larkUiTemplateSave, input),
  larkUiTemplateDelete: (id: string) => ipcRenderer.invoke(CH.larkUiTemplateDelete, id),
  larkUiTemplateApply: (input: { id: string; baseId?: string; vars?: Record<string, string>; title?: string }) => ipcRenderer.invoke(CH.larkUiTemplateApply, input),
  larkListBases: () => ipcRenderer.invoke(CH.larkListBases),
  larkDiscoverBases: () => ipcRenderer.invoke(CH.larkDiscoverBases),
  larkBaseSnapshot: (appToken: string) => ipcRenderer.invoke(CH.larkBaseSnapshot, appToken),
  larkAddBase: (input: unknown) => ipcRenderer.invoke(CH.larkAddBase, input),
  larkRemoveBase: (appToken: string) => ipcRenderer.invoke(CH.larkRemoveBase, appToken),
  larkListAutomations: () => ipcRenderer.invoke(CH.larkListAutomations),
  larkSaveAutomation: (rule: unknown) => ipcRenderer.invoke(CH.larkSaveAutomation, rule),
  larkDeleteAutomation: (id: string) => ipcRenderer.invoke(CH.larkDeleteAutomation, id),
  larkSetAutomationEnabled: (id: string, on: boolean) => ipcRenderer.invoke(CH.larkSetAutomationEnabled, id, on),
  larkRunAutomation: (id: string) => ipcRenderer.invoke(CH.larkRunAutomation, id),
  larkListTables: (appToken: string) => ipcRenderer.invoke(CH.larkListTables, appToken),
  larkConfirmTool: (callId: string, decision: string) => ipcRenderer.invoke(CH.larkConfirmTool, callId, decision),
  larkAnswerAsk: (callId: string, answer: string) => ipcRenderer.invoke(CH.larkAnswerAsk, callId, answer),
  larkSetAutoApprove: (on: boolean) => ipcRenderer.invoke(CH.larkSetAutoApprove, on),
  larkSetAgentPrefs: (prefs: unknown) => ipcRenderer.invoke(CH.larkSetAgentPrefs, prefs),
  larkBackupSync: (token: string) => ipcRenderer.invoke(CH.larkBackupSync, token),
  larkResetChat: () => ipcRenderer.invoke(CH.larkResetChat),
  larkShareSession: (id: string, token: string) => ipcRenderer.invoke(CH.larkShareSession, id, token),
  larkUnshareSession: (id: string, token: string) => ipcRenderer.invoke(CH.larkUnshareSession, id, token),
  larkShareStatus: (id: string, token: string) => ipcRenderer.invoke(CH.larkShareStatus, id, token),
  larkSessions: () => ipcRenderer.invoke(CH.larkSessions),
  larkNewSession: (base?: unknown) => ipcRenderer.invoke(CH.larkNewSession, base),
  larkSwitchSession: (id: string) => ipcRenderer.invoke(CH.larkSwitchSession, id),
  larkSaveSession: (id: string, items: unknown, bases?: unknown) =>
    ipcRenderer.invoke(CH.larkSaveSession, id, items, bases),
  larkDeleteSession: (id: string) => ipcRenderer.invoke(CH.larkDeleteSession, id),
  larkRenameSession: (id: string, title: string) => ipcRenderer.invoke(CH.larkRenameSession, id, title),
  larkListFiles: () => ipcRenderer.invoke(CH.larkListFiles),
  larkReadFile: (convId: string, name: string) => ipcRenderer.invoke(CH.larkReadFile, convId, name),
  larkDeleteFile: (convId: string, name: string) => ipcRenderer.invoke(CH.larkDeleteFile, convId, name),
  larkNotes: (id: string) => ipcRenderer.invoke(CH.larkNotes, id),
  larkSaveNotes: (id: string, doc: unknown) => ipcRenderer.invoke(CH.larkSaveNotes, id, doc),
  larkSpec: (token: string) => ipcRenderer.invoke(CH.larkSpec, token),
  larkSaveSpec: (doc: unknown, token: string) => ipcRenderer.invoke(CH.larkSaveSpec, doc, token),
  larkBuildSpec: (token: string) => ipcRenderer.invoke(CH.larkBuildSpec, token),
  larkPromoteToSpec: (input: unknown, token: string) => ipcRenderer.invoke(CH.larkPromoteToSpec, input, token),
  cmsSyncConfig: () => ipcRenderer.invoke(CH.cmsSyncConfig),
  cmsSyncSetBaseUrl: (url: string) => ipcRenderer.invoke(CH.cmsSyncSetBaseUrl, url),
  cmsSyncListJobs: () => ipcRenderer.invoke(CH.cmsSyncListJobs),
  cmsSyncCreateJob: (input: unknown) => ipcRenderer.invoke(CH.cmsSyncCreateJob, input),
  cmsSyncSetJobTables: (jobId: string, tableIds: string[]) => ipcRenderer.invoke(CH.cmsSyncSetJobTables, jobId, tableIds),
  cmsSyncUpdateJob: (jobId: string, patch: unknown) => ipcRenderer.invoke(CH.cmsSyncUpdateJob, jobId, patch),
  cmsSyncGetErrorReport: () => ipcRenderer.invoke(CH.cmsSyncGetErrorReport),
  cmsSyncSetErrorReport: (cfg: unknown) => ipcRenderer.invoke(CH.cmsSyncSetErrorReport, cfg),
  cmsSyncListLarkChats: () => ipcRenderer.invoke(CH.cmsSyncListLarkChats),
  cmsSyncCreateLarkChat: (name: string) => ipcRenderer.invoke(CH.cmsSyncCreateLarkChat, name),
  cmsSyncTestErrorReport: (target: unknown) => ipcRenderer.invoke(CH.cmsSyncTestErrorReport, target),
  cmsSyncKeeperStatus: () => ipcRenderer.invoke(CH.cmsSyncKeeperStatus),
  cmsSyncRefreshAll: () => ipcRenderer.invoke(CH.cmsSyncRefreshAll),
  cmsSyncLoginHistory: () => ipcRenderer.invoke(CH.cmsSyncLoginHistory),
  cmsSyncRefreshJob: (jobId: string) => ipcRenderer.invoke(CH.cmsSyncRefreshJob, jobId),
  cmsSyncExecute: (jobId: string) => ipcRenderer.invoke(CH.cmsSyncExecute, jobId),
  cmsSyncToggle: (jobId: string) => ipcRenderer.invoke(CH.cmsSyncToggle, jobId),
  cmsSyncDeleteJob: (jobId: string) => ipcRenderer.invoke(CH.cmsSyncDeleteJob, jobId),
  larkSummaries: (id: string) => ipcRenderer.invoke(CH.larkSummaries, id),
  larkSummarize: (id: string, itemId: string, text: string) =>
    ipcRenderer.invoke(CH.larkSummarize, id, itemId, text),
  larkSetAccount: (userId: string | null) => ipcRenderer.invoke(CH.larkSetAccount, userId),
  larkGrantPolicies: () => ipcRenderer.invoke(CH.larkGrantPolicies),
  larkSetGrantPolicy: (grantId: string, policy: unknown) =>
    ipcRenderer.invoke(CH.larkSetGrantPolicy, grantId, policy),
  larkRunGrantTurn: (grantId: string, prompt: string) =>
    ipcRenderer.invoke(CH.larkRunGrantTurn, grantId, prompt),
  larkRunAgentGrantTurn: (grantId: string, prompt: string) =>
    ipcRenderer.invoke(CH.larkRunAgentGrantTurn, grantId, prompt),
  larkHandoffSession: () => ipcRenderer.invoke(CH.larkHandoffSession),
  larkBotStatus: () => ipcRenderer.invoke(CH.larkBotStatus),
  larkBotConfigure: (cfg: unknown) => ipcRenderer.invoke(CH.larkBotConfigure, cfg),
  larkBotCreateChat: (name: string) => ipcRenderer.invoke(CH.larkBotCreateChat, name),
  larkChat: (streamId: string, input: unknown) => ipcRenderer.invoke(CH.larkChat, streamId, input),
  onLarkChatEvent: (cb: (streamId: string, ev: unknown) => void) => {
    const handler = (_e: unknown, streamId: string, ev: unknown) => cb(streamId, ev);
    ipcRenderer.on(CH.larkChatEvent, handler);
    return () => ipcRenderer.removeListener(CH.larkChatEvent, handler);
  },

  // Curated plugins.
  pluginList: () => ipcRenderer.invoke(CH.pluginList),
  pluginInstall: (source: string) => ipcRenderer.invoke(CH.pluginInstall, source),
  pluginSetEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke(CH.pluginSetEnabled, id, enabled),
  pluginUninstall: (id: string) => ipcRenderer.invoke(CH.pluginUninstall, id),
  pluginPanels: () => ipcRenderer.invoke(CH.pluginPanels),
  larkRunTool: (name: string, input: unknown) => ipcRenderer.invoke(CH.larkRunTool, name, input),
};

contextBridge.exposeInMainWorld('toolswave', bridge);
export type LarkwaveBridge = typeof bridge;
