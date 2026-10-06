export * from './runtime';
export * from './skillCommand';
export * from './skillContract';
export * from './chatTurn';

/**
 * Địa chỉ API của App Builder (NestJS, tiền tố `/v1`).
 *
 * Sau khi hai hệ hoán đổi tên miền (22/09/2026) đây là `api.toolswave.net`. Cửa hàng nay nằm ở
 * `apia.toolswave.net` — tức giá trị CŨ của hằng này giờ trỏ sang một hệ thống khác hẳn, không
 * phải một địa chỉ chết. Gọi nhầm vào đó thì không nhận lỗi mạng, chỉ nhận 404 từ một API lạ.
 * (Tên hằng giữ nguyên `APIA_BASE` để không phải sửa 31 nơi gọi tới.)
 *
 * ĐỌC BIẾN MÔI TRƯỜNG NGAY TẠI ĐÂY, và đó là điểm mấu chốt. Trước ngày 24/09/2026, chỉ
 * `apps/desktop/main/background.ts` đọc `LARKWAVE_API_BASE`; 30 chỗ còn lại (agentClient,
 * larkService, localAdapter, larkMaicAgent) dùng thẳng hằng số. Nghĩa là lối thoát hiểm ấy chỉ
 * che được một phần: người dùng đặt biến để trỏ bản desktop cũ sang địa chỉ đúng thì phần lớn
 * lời gọi VẪN đi sai hệ, mà không có dấu hiệu nào cho thấy nó chỉ chạy một nửa. Đưa việc đọc
 * biến về đúng một chỗ khiến "đặt biến" là một hành động có nghĩa trọn vẹn.
 *
 * Đọc qua `globalThis` chứ không tham chiếu thẳng `process`, vì hai lý do cùng lúc: gói này chạy
 * cả ở trình duyệt (apps/web, packages/ui) nơi `process` có thể không tồn tại — chạm vào một tên
 * không khai báo là ReferenceError giết cả trang — và bản thân gói CỐ Ý không phụ thuộc
 * `@types/node`, nên viết `process.env` thẳng thì không biên dịch được.
 */
const moiTruong = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const apiBaseTuMoiTruong = (moiTruong?.env?.LARKWAVE_API_BASE ?? '').trim().replace(/\/+$/, '');

export const APIA_BASE = apiBaseTuMoiTruong || 'https://api.toolswave.net/v1';

/** IPC channel names shared between the Electron main process and renderer. */
export const IPC = {
  auth: 'tw:auth',
  signIn: 'tw:signIn',
  signOut: 'tw:signOut',
  listApps: 'tw:listApps',
  templates: 'tw:templates',
  accountFetch: 'tw:accountFetch', // main-process proxy for api.toolswave.net (bypasses renderer CORS)
  accountUpload: 'tw:accountUpload', // main-process proxy for multipart uploads (avatar) — same CORS bypass
  createBuild: 'tw:createBuild', // invoke → returns a stream id
  composeRunnerPrompt: 'tw:composeRunnerPrompt', // invoke (input) → RunnerPromptPreview
  buildEvent: 'tw:buildEvent', // main → renderer push (per stream id)
  cancelBuild: 'tw:cancelBuild',
  agentBusy: 'tw:agentBusy', // main → renderer push: the shared AI lock owner (or null)
  agentBusyNow: 'tw:agentBusyNow', // invoke: pull the CURRENT lock owner (mount-time mirror)
  // Danh sách ĐẦY ĐỦ các lượt AI đang chạy. Từ khi Lark chạy được nhiều hội thoại song song,
  // "một chủ khoá" không còn mô tả đủ trạng thái máy. `agentBusyNow` giữ lại để bản renderer cũ
  // (code-push chưa kịp) vẫn hoạt động.
  agentBusyList: 'tw:agentBusyList',
  larkRenameSession: 'tw:larkRenameSession',
  larkListFiles: 'tw:larkListFiles',
  larkReadFile: 'tw:larkReadFile',
  larkDeleteFile: 'tw:larkDeleteFile',
  agentUnlock: 'tw:agentUnlock', // invoke: force-release the lock (stuck-turn recovery)
  appConversation: 'tw:appConversation',
  appSessions: 'tw:appSessions',
  appCheckpoints: 'tw:appCheckpoints',
  appHandoffSession: 'tw:appHandoffSession', // summarize the chat → seed a fresh session (handoff)
  renameApp: 'tw:renameApp', // rename a local app / conversation (writes meta.name)
  listSkills: 'tw:listSkills', // Claude-style skills the local CLI uses
  importSkill: 'tw:importSkill',
  createSkill: 'tw:createSkill',
  setSkillEnabled: 'tw:setSkillEnabled',
  setSkillScope: 'tw:setSkillScope', // change which CLI runners a skill applies to
  setSkillTags: 'tw:setSkillTags', // change a skill's free-form labels (tags)
  readSkill: 'tw:readSkill', // read a skill's editable instruction body
  updateSkill: 'tw:updateSkill', // edit a skill in place (name/instructions/scope/tags)
  deleteSkill: 'tw:deleteSkill',
  appFiles: 'tw:appFiles', // read a local app's source file tree (Code view)
  writeAppFile: 'tw:writeAppFile', // write back an edited source file (editable Code view)
  appDb: 'tw:appDb', // local SQLite: list tables (Database view)
  appDbRows: 'tw:appDbRows', // local SQLite: page a table's rows
  appDbExec: 'tw:appDbExec', // local SQLite: run SQL (writes persist)
  appDbCreate: 'tw:appDbCreate', // local SQLite: create a fresh data.db
  gitImportLocal: 'tw:gitImportLocal', // clone a Git repo into a new local app
  importLocalFolder: 'tw:importLocalFolder', // import an existing project folder as a local app
  importLocalFolderPath: 'tw:importLocalFolderPath', // import a folder by absolute path (renderer picker)
  uploadAttachment: 'tw:uploadAttachment', // save an uploaded image/file → { id, name } for a build
  quitApp: 'tw:quitApp', // hard-exit the app (force) so a hidden window can't keep it alive on install
  readAppEnvSpec: 'tw:readAppEnvSpec', // env vars a local app expects (.env.example) for the config form
  appViews: 'tw:appViews', // app's surfaces (public/CMS/API) for the preview "Trang/API" switcher
  appLastPrompt: 'tw:appLastPrompt', // the full prompt last sent to the runner (Prompt tab)
  deleteApp: 'tw:deleteApp', // delete a local app's directory
  openAppFolder: 'tw:openAppFolder', // reveal the app dir in Finder/Explorer
  appLocation: 'tw:appLocation', // where an app is / will be saved on disk
  chooseAppLocation: 'tw:chooseAppLocation', // folder picker → parent dir for a new project
  setDefaultAppsDir: 'tw:setDefaultAppsDir', // set the global default save dir
  listMigratableApps: 'tw:listMigratableApps', // old flat apps that can be restructured
  migrateApp: 'tw:migrateApp', // restructure one flat app → {slug}-workspace/{slug}-home
  downloadAppZip: 'tw:downloadAppZip', // export the app as a .zip
  preview: 'tw:preview',
  stopPreview: 'tw:stopPreview', // stop a local preview dev server (free it when leaving the app)
  restartPreview: 'tw:restartPreview', // stop + start an app's dev server(s) again (ports panel)
  listRunningPreviews: 'tw:listRunningPreviews', // all dev servers running now (global ports panel)
  captureAppScreenshot: 'tw:captureAppScreenshot', // shoot the app's views from its RUNNING dev server
  appScreenshot: 'tw:appScreenshot', // the app's cover shot as a data: URL (app card thumbnail)
  appServices: 'tw:appServices', // app's declared services (home/cms/api) without starting them
  apiRoutes: 'tw:apiRoutes', // app backend API endpoints (Swagger-like tester)
  apiRequest: 'tw:apiRequest', // proxy an API request to the app's running api service
  deploy: 'tw:deploy',
  deployServer: 'tw:deployServer', // desktop: deploy a local app's backend to the Docker server
  deployServerStatus: 'tw:deployServerStatus', // desktop: poll the server deploy
  claudeStatus: 'tw:claudeStatus',
  claudeLogin: 'tw:claudeLogin', // invoke → stream id
  claudeLoginEvent: 'tw:claudeLoginEvent', // main → renderer push (per stream id)
  claudeLogout: 'tw:claudeLogout',
  claudeSetToken: 'tw:claudeSetToken', // desktop: paste an API key / OAuth token
  claudeClearToken: 'tw:claudeClearToken',
  // Managed Anthropic API keys (team access)
  claudeListKeys: 'tw:claudeListKeys',
  claudeAddKey: 'tw:claudeAddKey',
  claudeRemoveKey: 'tw:claudeRemoveKey',
  claudeSetActiveKey: 'tw:claudeSetActiveKey',
  claudeValidateKey: 'tw:claudeValidateKey',
  // Multi-CLI runners (Claude/Grok/Gemini/Codex registry)
  runners: 'tw:runners', // invoke → RunnerStatusInfo[] (status of every runner)
  runnerSetToken: 'tw:runnerSetToken', // invoke (id, token) → RunnerStatusInfo[]
  runnerClearToken: 'tw:runnerClearToken', // invoke (id) → RunnerStatusInfo[]
  // Remote control ("Điều khiển từ xa") — desktop agent client
  agentStatus: 'tw:agentStatus', // invoke → AgentClientStatus
  agentSetEnabled: 'tw:agentSetEnabled', // invoke (on) → AgentClientStatus
  agentRegenToken: 'tw:agentRegenToken', // invoke → AgentClientStatus (token shown once)
  agentCreateToken: 'tw:agentCreateToken', // invoke (name) → AgentClientStatus (raw token once)
  agentListTokens: 'tw:agentListTokens', // invoke → AgentClientStatus (token list)
  agentDeleteToken: 'tw:agentDeleteToken', // invoke (id) → AgentClientStatus
  agentTestToken: 'tw:agentTestToken', // invoke (id) → TokenTestResult
  agentUpdateTokenNotify: 'tw:agentUpdateTokenNotify', // invoke (id, input) → AgentClientStatus
  agentTelegramLink: 'tw:agentTelegramLink', // invoke → TelegramLinkResponse (one-time code)
  agentTelegramBindings: 'tw:agentTelegramBindings', // invoke → AgentClientStatus (bindings refreshed)
  agentDeleteTelegramBinding: 'tw:agentDeleteTelegramBinding', // invoke (id) → AgentClientStatus
  agentSyncApps: 'tw:agentSyncApps', // invoke → { ok, count } (push app list to server)
  agentEvent: 'tw:agentEvent', // main → renderer push (live AgentClientStatus)
  openExternal: 'tw:openExternal',
  openLocalFile: 'tw:openLocalFile', // mở tệp agent vừa dựng, CHỈ trong thư mục hội thoại
  installerProgress: 'tw:installerProgress', // main → renderer: đã tải bao nhiêu / tổng bao nhiêu
  larkCompactSession: 'tw:larkCompactSession', // nén ngữ cảnh TẠI CHỖ, giữ nguyên hội thoại
  checkUpdate: 'tw:checkUpdate', // code-push: query the release manifest
  applyUpdate: 'tw:applyUpdate', // code-push: reload the renderer to the pushed build
  downloadInstaller: 'tw:downloadInstaller', // download the new .dmg/.exe + open it (core reinstall)
  authDeepLink: 'tw:authDeepLink', // main → renderer push (Larkwave JWT from larkwave:// / loopback / in-app window)
  authStatus: 'tw:authStatus', // main → renderer push (OAuth result: success/error, for the status modal)
  authLoopback: 'tw:authLoopback', // invoke → start a one-shot 127.0.0.1 OAuth-callback server
  authWindow: 'tw:authWindow', // invoke → run OAuth in an in-app window, intercept the web callback
  // Lark × Claude (desktop only)
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
  larkListBases: 'tw:larkListBases',
  larkDiscoverBases: 'tw:larkDiscoverBases',
  larkBaseSnapshot: 'tw:larkBaseSnapshot',
  larkAddBase: 'tw:larkAddBase',
  larkRemoveBase: 'tw:larkRemoveBase',
  larkChat: 'tw:larkChat', // invoke → stream id
  larkChatEvent: 'tw:larkChatEvent', // main → renderer push (per stream id)
  larkConfirmTool: 'tw:larkConfirmTool',
  larkAnswerAsk: 'tw:larkAnswerAsk',
  larkSetAutoApprove: 'tw:larkSetAutoApprove',
  larkBackupSync: 'tw:larkBackupSync',
  larkResetChat: 'tw:larkResetChat',
  larkShareSession: 'tw:larkShareSession',
  larkUnshareSession: 'tw:larkUnshareSession',
  larkShareStatus: 'tw:larkShareStatus',
  larkListAutomations: 'tw:larkListAutomations',
  larkSaveAutomation: 'tw:larkSaveAutomation',
  larkDeleteAutomation: 'tw:larkDeleteAutomation',
  larkSetAutomationEnabled: 'tw:larkSetAutomationEnabled',
  larkRunAutomation: 'tw:larkRunAutomation',
  larkListTables: 'tw:larkListTables',
  larkSessions: 'tw:larkSessions',
  larkNewSession: 'tw:larkNewSession',
  larkSwitchSession: 'tw:larkSwitchSession',
  larkSetAgentPrefs: 'tw:larkSetAgentPrefs',
  larkSaveSession: 'tw:larkSaveSession',
  larkDeleteSession: 'tw:larkDeleteSession',
  accountGetToken: 'tw:accountGetToken',
  accountSetToken: 'tw:accountSetToken',
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
  larkWebSessionDead: 'tw:larkWebSessionDead', // main → renderer push (Lark web session expired)
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
  larkRunAgentGrantTurn: 'tw:larkRunAgentGrantTurn', // delegated READ-ONLY "shared Trợ lý AI" turn
  larkHandoffSession: 'tw:larkHandoffSession', // summarize current chat → start a fresh session seeded with it
  larkBotStatus: 'tw:larkBotStatus',
  larkBotConfigure: 'tw:larkBotConfigure',
  larkBotCreateChat: 'tw:larkBotCreateChat',
  // Curated plugins
  pluginList: 'tw:pluginList',
  pluginInstall: 'tw:pluginInstall',
  pluginSetEnabled: 'tw:pluginSetEnabled',
  pluginUninstall: 'tw:pluginUninstall',
  pluginPanels: 'tw:pluginPanels',
  larkRunTool: 'tw:larkRunTool',
} as const;
