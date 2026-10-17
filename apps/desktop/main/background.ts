import path from 'node:path';
import { hostname } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import serve from 'electron-serve';
import { APIA_BASE, IPC } from '@larkwave/core';
import type { LarkFileActionInput, LarkFileActionResult, SkillLearnSettings, SkillProposal } from '@larkwave/core';
import type { CmsSyncErrorReport, CmsSyncJobPatch, LarkBaseRef, LarkBrowserRect, LarkChatInput, LarkGrantPolicy, LarkNoteDoc, LarkSpecDoc, SkillContractFields, SpecPromoteInput, UpdateTokenNotifyInput } from '@larkwave/core';
import { LocalRuntimeAdapter } from './runtime/localAdapter';
import { onLockChange, currentOwner, owners, forceRelease, forceReleaseAll } from './runtime/agentLock';
import { getRunner, invalidateRunnerStatus, listRunnerStatus } from './runtime/runners/registry';
import { AgentClient } from './runtime/agentClient';
import { startAuthLoopback } from './authLoopback';
import { openAuthWindow } from './authWindow';
import { isExecutableName, isInsideDir } from './runtime/lark/filePaths';
import { openLarkAuthWindow } from './runtime/lark/larkOAuth';
import { resolveRenderer, downloadAndOpenInstaller, type UpdateInfo } from './codePush';
import { AccountCache } from './accountCache';
import { AccountTokenStore } from './accountTokenStore';
import { hiddenMode } from './hiddenMode';
import { larkwaveUserAgent, withDefaultUserAgent } from './deviceIdentity';
import { ToolswaveMigrationService } from './runtime/migrate/migrationService';
import { getLarkWebSession } from './runtime/lark/larkWebSession';

/** Larkwave API base (overridable for staging). */
// `APIA_BASE` tự đọc `LARKWAVE_API_BASE` từ 24/09/2026 (xem packages/core/src/index.ts), nên
// không còn đọc lại ở đây: hai cơ chế song song đúng là cách một hôm nào đó chúng lệch nhau.
const API_BASE = APIA_BASE;

/**
 * User-Agent cho các lời gọi tài khoản đi qua main (đăng nhập email/mật khẩu nằm ở đây).
 * Máy chủ Toolswave tự dựng nhãn thiết bị từ UA (auth.service.ts deviceLabelFromUA) và KHÔNG đọc
 * tên do client gửi. Fetch của Node mặc định gửi "node" → phiên hiện là "web" / "Thiết bị".
 * Có "Electron" thì máy chủ xếp đúng loại desktop ("App Toolswave · macOS"); phần
 * `Larkwave/<ver> (<host>)` giữ lại trong cột userAgent để phân biệt với app Toolswave và để một
 * thay đổi 1 dòng phía máy chủ (khớp /Larkwave/ → "Larkwave · <host>") dùng được ngay.
 */
const ACCOUNT_UA = larkwaveUserAgent(process.platform, app.getVersion(), process.versions.electron ?? '', hostname());

const isProd = process.env.NODE_ENV === 'production';
if (isProd) serve({ directory: 'app' });
else app.setPath('userData', `${app.getPath('userData')} (development)`);
// Dev + chế độ ẩn: chạy thử trên một userData RIÊNG (thư mục tạm) để không đụng dữ liệu dev thật
// (phiên đăng nhập, hội thoại). Bản cài bỏ qua biến này.
if (!isProd && hiddenMode() && process.env.LARKWAVE_USER_DATA) app.setPath('userData', process.env.LARKWAVE_USER_DATA);

const runtime = new LocalRuntimeAdapter(app.getPath('userData'));
const accountCache = new AccountCache(app.getPath('userData'));
const accountTokenStore = new AccountTokenStore(app.getPath('userData'));
// The main window — assigned once created (below). Declared here so the agent
// client's onStatus push (which fires later, at runtime) can reach it.
let mainWin: BrowserWindow | null = null;
// Remote control ("Điều khiển từ xa") agent client — pushes live status to the
// window (mainWin is set once the window is created; guard with optional chaining).
// Nhập dữ liệu cũ của app desktop Toolswave (chỉ đọc thư mục Toolswave; xem runtime/migrate).
const toolswaveMigration = new ToolswaveMigrationService(
  app.getPath('userData'),
  (ev) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(IPC.toolswaveMigrationEvent, ev);
  },
  () => {
    runtime.resyncSkills();
    // Bộ nhập vừa ghi id phiên Claude vào tệp hội thoại → lượt sau phải đọc lại từ đĩa.
    runtime.larkForgetTurnStates();
  },
);
const agentClient = new AgentClient(runtime, app.getPath('userData'), (s) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(IPC.agentEvent, s);
});

function registerIpc(win: BrowserWindow) {
  ipcMain.handle(IPC.auth, () => runtime.auth());
  // Proxy Larkwave-account API calls through main (Node has no CORS). The renderer
  // Origin-independent account token: localStorage is per-origin, but codePush can load the
  // renderer from either app:// (bundled) or pages.dev (remote) → a token saved on one origin
  // is lost on the other. Mirror it here so the session survives an origin flip.
  ipcMain.handle(IPC.accountGetToken, () => accountTokenStore.get());
  ipcMain.handle(IPC.accountSetToken, (_e, token: string | null) => accountTokenStore.set(token ?? null));
  // origin (localhost / app://) isn't in the API's allowlist, so a direct renderer
  // fetch is blocked; routing here makes the whole account system work on desktop.
  ipcMain.handle(
    IPC.accountFetch,
    async (_e, req: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
      const method = (req.method ?? 'GET').toUpperCase();
      // Offline-first (Phase 0): cache successful GETs + serve the last-known data
      // when apia is unreachable / 5xx, so account views render instead of blanking.
      const cacheable = method === 'GET' && !AccountCache.skip(req.url);
      try {
        if (new URL(req.url).origin !== new URL(API_BASE).origin) {
          return { ok: false, status: 0, text: '{"message":"Chặn origin không hợp lệ"}' };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        const headers = withDefaultUserAgent(req.headers, ACCOUNT_UA);
        const res = await fetch(req.url, { method, headers, body: req.body, signal: controller.signal });
        clearTimeout(timer);
        const text = await res.text();
        if (cacheable && res.status >= 500) {
          const c = accountCache.read(method, req.url, req.headers);
          if (c) return { ok: true, status: c.status, text: c.text, stale: true };
        }
        if (cacheable && res.ok) accountCache.write(method, req.url, req.headers, res.status, text);
        return { ok: res.ok, status: res.status, text };
      } catch (e) {
        if (cacheable) {
          const c = accountCache.read(method, req.url, req.headers);
          if (c) return { ok: true, status: c.status, text: c.text, stale: true };
        }
        return { ok: false, status: 0, text: JSON.stringify({ message: (e as Error).message }) };
      }
    },
  );
  // Multipart upload (avatar) through main — a renderer FormData fetch would CORS-fail
  // just like accountFetch. The renderer streams the file bytes; main rebuilds the
  // multipart body (Node has global FormData/Blob/fetch) and posts with the bearer.
  ipcMain.handle(
    IPC.accountUpload,
    async (
      _e,
      req: { url: string; field: string; filename: string; mimeType?: string; bytes: Uint8Array; headers?: Record<string, string> },
    ) => {
      try {
        if (new URL(req.url).origin !== new URL(API_BASE).origin) {
          return { ok: false, status: 0, text: '{"message":"Chặn origin không hợp lệ"}' };
        }
        const fd = new FormData();
        const blob = new Blob([Buffer.from(req.bytes)], { type: req.mimeType || 'application/octet-stream' });
        fd.append(req.field, blob, req.filename);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        // NB: don't set Content-Type — fetch derives the multipart boundary from the body.
        const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: fd, signal: controller.signal });
        clearTimeout(timer);
        return { ok: res.ok, status: res.status, text: await res.text() };
      } catch (e) {
        return { ok: false, status: 0, text: JSON.stringify({ message: (e as Error).message }) };
      }
    },
  );
  ipcMain.handle(IPC.listSkills, () => runtime.listSkills());
  ipcMain.handle(IPC.importSkill, (_e, scope?: string[], tags?: string[]) => runtime.importSkill(scope, tags));
  // `command` is the 5th IPC arg (the preload bridge's shape); the core contract puts it 7th,
  // after attachments/description — which the local skill files don't support, hence the two
  // `undefined` placeholders. Dropping it here would silently swallow every slash-command.
  ipcMain.handle(
    IPC.createSkill,
    (
      _e,
      name: string,
      instructions: string,
      scope?: string[],
      tags?: string[],
      command?: string,
      contract?: SkillContractFields,
    ) => runtime.createSkill(name, instructions, scope, tags, undefined, undefined, command, contract),
  );
  ipcMain.handle(IPC.setSkillEnabled, (_e, id: string, enabled: boolean) => runtime.setSkillEnabled(id, enabled));
  ipcMain.handle(IPC.setSkillScope, (_e, id: string, scope: string[]) => runtime.setSkillScope(id, scope));
  ipcMain.handle(IPC.setSkillTags, (_e, id: string, tags: string[]) => runtime.setSkillTags(id, tags));
  ipcMain.handle(IPC.readSkill, (_e, id: string) => runtime.readSkill(id));
  ipcMain.handle(
    IPC.updateSkill,
    (
      _e,
      id: string,
      patch: {
        name?: string;
        instructions?: string;
        scope?: string[];
        tags?: string[];
        command?: string;
        contract?: SkillContractFields;
      },
    ) => runtime.updateSkill(id, patch),
  );
  ipcMain.handle(IPC.suggestSkillContract, (_e, name: string, instructions: string, existingKeys?: string[]) =>
    runtime.suggestSkillContract(name, instructions, existingKeys),
  );
  ipcMain.handle(IPC.deleteSkill, (_e, id: string) => runtime.deleteSkill(id));
  ipcMain.handle(IPC.quitApp, () => {
    // HARD exit: window.close() only fires window-all-closed when EVERY window is gone, but a
    // hidden Lark/OAuth BrowserWindow keeps the app alive. Reap AI turns, destroy all windows,
    // then app.exit(0) (skips before-quit) so the bundle frees for a drag-replace install.
    try {
      forceReleaseAll('quit');
    } catch {
      /* ignore */
    }
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        w.destroy();
      } catch {
        /* ignore */
      }
    }
    app.exit(0);
  });
  // Force-release the shared AI lock — kills whatever is running (stuck-turn recovery).
  ipcMain.handle(IPC.agentBusyNow, () => currentOwner());
  // Danh sách ĐẦY ĐỦ các lượt đang chạy. `agentBusyNow` giữ nguyên (trả một chủ) để bản renderer
  // cũ vẫn chạy được sau khi cập nhật lõi mà chưa cập nhật giao diện.
  ipcMain.handle(IPC.agentBusyList, () => owners());
  // Không truyền khoá = mở khoá khẩn cấp toàn bộ; truyền khoá = chỉ dừng đúng lượt đó.
  ipcMain.handle(IPC.agentUnlock, (_e, key?: string) =>
    key ? forceRelease(key, 'user') : forceReleaseAll('user'),
  );
  // Mirror the shared lock to the renderer so every tab can block its own send while
  // another tab (or the phone relay) is mid-answer. Pushes on every change + once now.
  onLockChange(() => {
    if (win.isDestroyed()) return;
    win.webContents.send(IPC.agentBusy, currentOwner());
    win.webContents.send(IPC.agentBusyList, owners());
  });
  if (!win.isDestroyed()) {
    win.webContents.send(IPC.agentBusy, currentOwner());
    win.webContents.send(IPC.agentBusyList, owners());
  }

  // Claude CLI controls. Auth-changing ones drop the runner-status cache so the
  // registry re-probes claude's ready state on the next `runners.list()`.
  ipcMain.handle(IPC.claudeStatus, () => runtime.claude!.status());
  ipcMain.handle(IPC.claudeLogout, async () => {
    const r = await runtime.claude!.logout();
    invalidateRunnerStatus();
    return r;
  });
  ipcMain.handle(IPC.claudeSetToken, async (_e, token: string) => {
    const r = await runtime.claude!.setToken(token);
    invalidateRunnerStatus();
    return r;
  });
  ipcMain.handle(IPC.claudeClearToken, async () => {
    const r = await runtime.claude!.clearToken();
    invalidateRunnerStatus();
    return r;
  });
  // Managed Anthropic API keys (team access).
  ipcMain.handle(IPC.claudeListKeys, () => runtime.claude!.listKeys!());
  ipcMain.handle(IPC.claudeAddKey, async (_e, input: { label: string; key: string }) => {
    const r = await runtime.claude!.addKey!(input);
    invalidateRunnerStatus();
    return r;
  });
  ipcMain.handle(IPC.claudeRemoveKey, async (_e, id: string) => {
    const r = await runtime.claude!.removeKey!(id);
    invalidateRunnerStatus();
    return r;
  });
  ipcMain.handle(IPC.claudeSetActiveKey, async (_e, id: string) => {
    const r = await runtime.claude!.setActiveKey!(id);
    invalidateRunnerStatus();
    return r;
  });
  ipcMain.handle(IPC.claudeValidateKey, (_e, key: string) => runtime.claude!.validateKey!(key));
  ipcMain.handle(IPC.claudeLogin, async (_e, streamId: string) => {
    (async () => {
      try {
        for await (const ev of runtime.claude!.login()) {
          if (win.isDestroyed()) return;
          win.webContents.send(IPC.claudeLoginEvent, streamId, ev);
        }
      } catch (err) {
        win.webContents.send(IPC.claudeLoginEvent, streamId, { type: 'error', message: (err as Error).message });
      }
      invalidateRunnerStatus(); // a completed login flips claude to ready → re-probe next list
      win.webContents.send(IPC.claudeLoginEvent, streamId, { type: '__end__' });
    })();
    return { started: true };
  });

  // ── Multi-CLI runners (Claude/Grok/Gemini/Codex registry) ────────────────────
  // A token change alters ready/auth state → drop the status cache so the re-list re-probes.
  ipcMain.handle(IPC.runners, () => listRunnerStatus());
  ipcMain.handle(IPC.runnerSetToken, async (_e, id: string, token: string) => {
    await getRunner(id).setToken(token);
    invalidateRunnerStatus();
    return listRunnerStatus();
  });
  ipcMain.handle(IPC.runnerClearToken, async (_e, id: string) => {
    await getRunner(id).clearToken();
    invalidateRunnerStatus();
    return listRunnerStatus();
  });

  // ── Remote control ("Điều khiển từ xa") agent client ─────────────────────────
  // The renderer forwards the Larkwave account JWT (needed to open the SSE stream).
  ipcMain.handle(IPC.agentStatus, (_e, token?: string) => agentClient.status(token));
  ipcMain.handle(IPC.agentSetEnabled, (_e, on: boolean, token?: string) => agentClient.setEnabled(on, token));
  ipcMain.handle(IPC.agentRegenToken, (_e, token: string) => agentClient.regenerateToken(token));
  ipcMain.handle(IPC.agentCreateToken, (_e, name: string, token?: string) => agentClient.createToken(name, token as string));
  ipcMain.handle(IPC.agentListTokens, (_e, token?: string) => agentClient.listTokens(token));
  ipcMain.handle(IPC.agentDeleteToken, (_e, id: string, token?: string) => agentClient.deleteToken(id, token));
  ipcMain.handle(IPC.agentTestToken, (_e, id: string, token?: string) => agentClient.testToken(id, token));
  ipcMain.handle(IPC.agentUpdateTokenNotify, (_e, id: string, input: UpdateTokenNotifyInput, token?: string) =>
    agentClient.updateTokenNotify(id, input, token),
  );
  ipcMain.handle(IPC.agentTelegramLink, (_e, token?: string) => agentClient.telegramLink(token));
  ipcMain.handle(IPC.agentTelegramBindings, (_e, token?: string) => agentClient.listTelegramBindings(token));
  ipcMain.handle(IPC.agentDeleteTelegramBinding, (_e, id: string, token?: string) =>
    agentClient.deleteTelegramBinding(id, token),
  );

  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  /**
   * Mở tệp agent vừa dựng bằng ứng dụng mặc định.
   *
   * CHỐT THƯ MỤC là toàn bộ phần bảo mật ở đây: đường dẫn tới từ một sự kiện do lượt chạy của
   * model sinh ra, nên phải coi như dữ liệu không tin được. Không chốt thì một `path` bịa ra mở
   * được bất kỳ tệp nào trên máy — và `shell.openPath` trên tệp thực thi là CHẠY nó.
   * `lark/work/` là nơi duy nhất `create_file` ghi vào (xem setFileOutDir).
   */
  ipcMain.handle(IPC.openLocalFile, async (_e, p: string) => {
    try {
      const root = path.join(app.getPath('userData'), 'lark', 'work');
      // Thư mục của các quy tắc tự động hoá (tệp nguồn + kết quả mỗi lần chạy) — cùng mức tin cậy.
      const autoRoot = path.join(app.getPath('userData'), 'lark', 'automations');
      const target = path.resolve(String(p || ''));
      if (!isInsideDir(root, target) && !isInsideDir(autoRoot, target)) {
        return { ok: false, error: 'Tệp nằm ngoài thư mục hội thoại.' };
      }
      if (!existsSync(target)) return { ok: false, error: 'Tệp không còn trên máy.' };
      // `shell.openPath` lên ứng dụng/script là CHẠY nó — kể cả khi nằm đúng thư mục (một tệp tải từ
      // Lark về có thể là .command/.exe). Thư mục (kể cả gói .app) cũng không mở.
      if (isExecutableName(target) || statSync(target).isDirectory()) {
        return { ok: false, error: 'Không mở tệp chạy được (ứng dụng/script/thư mục) — chỉ mở tài liệu.' };
      }
      const err = await shell.openPath(target);
      return err ? { ok: false, error: err } : { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Không mở được tệp.' };
    }
  });
  /**
   * Nút trên thẻ tệp. Cùng chốt thư mục với openLocalFile: chỉ tệp trong `lark/work/`. "Lưu về…" mở hộp
   * thoại lưu của hệ điều hành — CHỈ vì người dùng vừa bấm nút đó. Đưa lên Lark đi qua larkService
   * (phiên Lark web) — không qua agent, không cần duyệt (người dùng bấm chính là lệnh).
   */
  ipcMain.handle(IPC.larkFileAction, async (_e, input: LarkFileActionInput): Promise<LarkFileActionResult> => {
    try {
      const root = path.join(app.getPath('userData'), 'lark', 'work');
      const autoRoot = path.join(app.getPath('userData'), 'lark', 'automations');
      const target = path.resolve(String(input?.path || ''));
      if (!isInsideDir(root, target) && !isInsideDir(autoRoot, target)) return { ok: false, error: 'Tệp nằm ngoài thư mục hội thoại.' };
      if (!existsSync(target)) return { ok: false, error: 'Tệp không còn trên máy.' };
      if (input.action === 'reveal') {
        shell.showItemInFolder(target);
        return { ok: true };
      }
      if (input.action === 'saveAs') {
        const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), path.basename(target)) });
        if (r.canceled || !r.filePath) return { ok: false, error: 'cancelled' };
        await copyFile(target, r.filePath);
        return { ok: true, savedTo: r.filePath };
      }
      return await runtime.larkFileAction({ ...input, path: target });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Không làm được thao tác với tệp.' };
    }
  });
  ipcMain.handle(IPC.authLoopback, () => startAuthLoopback(win));
  ipcMain.handle(IPC.authWindow, async (_e, url: string) => {
    try {
      return await openAuthWindow(win, url);
    } finally {
      restoreMainWindow(win); // un-black the main window after the child OAuth window closes
    }
  });

  // ── Code push (renderer OTA) ────────────────────────────────────────────────
  ipcMain.handle(IPC.checkUpdate, async (): Promise<UpdateInfo> => {
    if (!isProd) return { remote: false, reinstall: false, current: app.getVersion() };
    return (await resolveRenderer(localHomeUrl)).info;
  });
  ipcMain.handle(IPC.applyUpdate, async (): Promise<UpdateInfo> => {
    if (!isProd) return { remote: false, reinstall: false, current: app.getVersion() };
    const r = await resolveRenderer(localHomeUrl);
    await win.loadURL(r.url); // hot-swap the renderer to the pushed build
    return r.info;
  });
  ipcMain.handle(IPC.downloadInstaller, () => downloadAndOpenInstaller());

  // Lark × Agents.
  ipcMain.handle(IPC.larkStatus, () => runtime.larkStatus());
  ipcMain.handle(IPC.larkConnect, (_e, creds: { appId: string; appSecret: string; name?: string }) =>
    runtime.larkConnect(creds),
  );
  ipcMain.handle(IPC.larkDisconnect, () => runtime.larkDisconnect());
  ipcMain.handle(IPC.larkHostedPush, () => runtime.larkHostedPush());
  ipcMain.handle(IPC.larkListSkillSets, () => runtime.larkListSkillSets());
  ipcMain.handle(IPC.larkPendingPrompts, (_e, convId: string) => runtime.larkPendingPrompts(convId));
  ipcMain.handle(IPC.skillSnapshots, (_e, id: string) => runtime.skillSnapshots(id));
  ipcMain.handle(IPC.skillVersionText, (_e, id: string, at: string) => runtime.skillVersionText(id, at));
  ipcMain.handle(IPC.skillLearnSettings, (_e) => runtime.skillLearnSettings());
  ipcMain.handle(IPC.setSkillLearnSettings, (_e, patch: Partial<SkillLearnSettings>) => runtime.setSkillLearnSettings(patch));
  ipcMain.handle(IPC.skillSaveProposal, (_e, p: SkillProposal) => runtime.skillSaveProposal(p));
  ipcMain.handle(IPC.skillUndoLearn, (_e, id: string) => runtime.skillUndoLearn(id));
  ipcMain.handle(IPC.skillRestoreLearned, (_e, id: string) => runtime.skillRestoreLearned(id));
  ipcMain.handle(IPC.restoreBuiltinSkills, (_e) => runtime.restoreBuiltinSkills());
  ipcMain.handle(IPC.larkLearnFromBase, (_e, appToken: string, name?: string) => runtime.larkLearnFromBase(appToken, name));
  ipcMain.handle(IPC.restoreSkill, (_e, id: string, at: string) => runtime.restoreSkill(id, at));
  ipcMain.handle(IPC.reorderSkills, (_e, ids: string[]) => runtime.reorderSkills(ids));
  ipcMain.handle(IPC.larkListFieldNames, (_e, a: string, t: string) => runtime.larkListFieldNames(a, t));
  ipcMain.handle(IPC.larkExtractToTable, (_e, skillId: string, dryRun: boolean) =>
    runtime.larkExtractToTable(skillId, dryRun, (ev) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.larkSkillSetEvent, ev);
    }),
  );
  // Tiến trình bắn về cửa sổ đang mở: một lượt chạy bộ kỹ năng mất nhiều phút, không có tiến
  // trình thì người dùng chỉ thấy nút quay mãi và không biết đang ở kỹ năng nào.
  ipcMain.handle(IPC.larkRunSkillSet, (_e, skillId: string, seedFacts?: Record<string, never>, mode?: 'ask' | 'build') =>
    runtime.larkRunSkillSet(skillId, seedFacts, mode, (ev) => {
      if (!win.isDestroyed()) win.webContents.send(IPC.larkSkillSetEvent, ev);
    }),
  );
  // Saved-app history (switch between connected Lark apps) + active token health check.
  ipcMain.handle(IPC.larkListApps, () => runtime.larkListApps());
  ipcMain.handle(IPC.larkConnectSaved, (_e, appId: string) => runtime.larkConnectSaved(appId));
  ipcMain.handle(IPC.larkRenameApp, (_e, appId: string, name: string) => runtime.larkRenameApp(appId, name));
  ipcMain.handle(IPC.larkForgetApp, (_e, appId: string) => runtime.larkForgetApp(appId));
  ipcMain.handle(IPC.larkCheckConnection, () => runtime.larkCheckConnection());
  // Personal-account OAuth: build the authorize request in the service (it has the app
  // creds), open + intercept the window here (we have `win`), then finish in the service.
  ipcMain.handle(IPC.larkUserLogin, async () => {
    const start = runtime.larkUserAuthStart();
    if ('error' in start) {
      const s = await runtime.larkStatus();
      return { ...s, error: start.error };
    }
    try {
      const res = await openLarkAuthWindow(win, start.appId, start.state);
      if (!res.code) {
        runtime.larkUserAuthCancel(); // clear the in-flight guard so the user can retry
        const s = await runtime.larkStatus();
        return res.error === 'cancelled' ? s : { ...s, error: `Đăng nhập Lark thất bại: ${res.error}` };
      }
      return await runtime.larkUserAuthComplete(res.code, start.state);
    } finally {
      // macOS quirk: after a CHILD auth window (parent = main) closes, the main window can be
      // left BLACK / not repainting until you click it. Force it back to front + repaint.
      restoreMainWindow(win);
    }
  });
  ipcMain.handle(IPC.larkUserLogout, () => runtime.larkUserLogout());
  ipcMain.handle(IPC.larkWebConnect, (_e, url?: string) => runtime.larkWebConnect!(url));
  ipcMain.handle(IPC.larkWebStatus, () => runtime.larkWebStatus!());
  ipcMain.handle(IPC.larkWebDisconnect, () => runtime.larkWebDisconnect!());
  ipcMain.handle(IPC.larkWebReveal, () => runtime.larkWebReveal!());
  ipcMain.handle(IPC.larkWebSetWorkflowUrl, (_e, url: string) => runtime.larkWebSetWorkflowUrl!(url));
  ipcMain.handle(IPC.larkWebStartRecorder, (_e, url?: string) => runtime.larkWebStartRecorder!(url));
  ipcMain.handle(IPC.larkWebGetRecording, () => runtime.larkWebGetRecording!());
  ipcMain.handle(IPC.larkWebReplayWorkflow, (_e, opts?: { enable?: boolean }) => runtime.larkWebReplayWorkflow!(opts));
  // "Trình duyệt Lark": the SAME Lark web page embedded in the window that asked for it.
  // Khung Lark gắn THẲNG vào cửa sổ chính, nằm trên lớp giao diện. Giao diện tải lại / sập thì màn
  // Trình duyệt Lark không kịp gọi detach → khung nổi đè cả app (gặp thật 09/10/2026). Nên main tự
  // thu khung về chỗ đỗ mỗi khi trang của cửa sổ đó điều hướng (không phải đổi #hash) hoặc sập.
  const larkHostWatched = new WeakSet<Electron.WebContents>();
  const watchLarkHost = (wc: Electron.WebContents): void => {
    if (larkHostWatched.has(wc)) return;
    larkHostWatched.add(wc);
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) runtime.larkBrowserDetach();
    });
    wc.on('render-process-gone', () => runtime.larkBrowserDetach());
    wc.once('destroyed', () => runtime.larkBrowserDetach());
  };
  // `lane` = id hội thoại của tab đang xem (mỗi hội thoại một trang Lark). Vắng = trang mặc định.
  const laneArg = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : undefined);
  ipcMain.handle(IPC.larkBrowserAttach, (e, rect: LarkBrowserRect, lane?: string) => {
    watchLarkHost(e.sender);
    const r = rect || { x: 0, y: 0, width: 0, height: 0 };
    const safe = { x: Number(r.x) || 0, y: Number(r.y) || 0, width: Number(r.width) || 0, height: Number(r.height) || 0 };
    return runtime.larkBrowserAttach(safe, laneArg(lane), BrowserWindow.fromWebContents(e.sender) ?? undefined);
  });
  ipcMain.handle(IPC.larkBrowserDetach, () => runtime.larkBrowserDetach());
  ipcMain.handle(IPC.larkBrowserState, (_e, lane?: string) => runtime.larkBrowserState(laneArg(lane)));
  ipcMain.handle(IPC.larkBrowserNavigate, (_e, input: { url?: string; action?: 'back' | 'forward' | 'reload' | 'home' | 'stop' | 'loginQr' | 'loginForm'; lane?: string }) => runtime.larkBrowserNavigate({ ...(input || {}), lane: laneArg(input?.lane) }));
  ipcMain.handle(IPC.larkBrowserStopAi, (_e, lane?: string) => runtime.larkBrowserStopAi(laneArg(lane)));
  ipcMain.handle(IPC.larkBrowserResumeAi, (_e, lane?: string) => runtime.larkBrowserResumeAi(laneArg(lane)));
  ipcMain.handle(IPC.larkBrowserRelease, (_e, lane?: string) => runtime.larkBrowserRelease(laneArg(lane) || ''));
  ipcMain.handle(IPC.larkWebAccounts, () => runtime.larkWebAccounts());
  // Kết nối cá nhân cho kỹ năng — CHỈ người dùng gọi (Kỹ năng → Kết nối). Nhận đúng danh sách thao tác;
  // mật khẩu ứng dụng Gmail đi vào, KHÔNG bao giờ đi ra (gmailList chỉ trả email + cờ mã hoá).
  ipcMain.handle(IPC.connectorsCall, async (_e, op: string, payload?: Record<string, unknown>) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    if (op.startsWith('zalo')) {
      const { zaloService } = await import('./runtime/connectors/zalo/zaloService');
      if (op === 'zaloStatus') return zaloService.status();
      if (op === 'zaloQrStart') return zaloService.qrStart();
      if (op === 'zaloQrRetry') return zaloService.qrRetry();
      if (op === 'zaloQrAbort') return zaloService.qrAbort();
      if (op === 'zaloLogout') return zaloService.logout(String(p.accountId ?? '').slice(0, 64));
      // Đồng bộ tin (Cài đặt → Đồng bộ tin Zalo).
      const acc = p.account ? String(p.account).slice(0, 80) : undefined;
      if (op === 'zaloSyncStatus') return zaloService.syncStatus();
      if (op === 'zaloSyncSettings') {
        return zaloService.saveSyncSettings({
          ...(typeof p.persist === 'boolean' ? { persist: p.persist } : {}),
          ...(p.retentionDays !== undefined ? { retentionDays: Number(p.retentionDays) } : {}),
          ...(p.perThread !== undefined ? { perThread: Number(p.perThread) } : {}),
        });
      }
      if (op === 'zaloHistoryFetch') return zaloService.fetchHistory({ account: acc, ...(p.threadId ? { threadId: String(p.threadId).slice(0, 80) } : {}) });
      if (op === 'zaloStoreClear') return zaloService.clearStore(p.accountId ? String(p.accountId).slice(0, 64) : undefined);
      // Cửa sổ Zalo Web nhúng.
      if (op === 'zaloWebOpen') return zaloService.webOpen({ account: acc, show: p.show !== false });
      if (op === 'zaloWebShow') return zaloService.webShow();
      if (op === 'zaloWebHide') return zaloService.webHide();
      if (op === 'zaloWebReload') return zaloService.webReload();
      if (op === 'zaloWebClose') return zaloService.webClose();
      if (op === 'zaloWebStatus') return zaloService.webStatus();
      if (op === 'zaloWebAdopt') return zaloService.adoptWebSession();
      if (op === 'zaloWebRead') return zaloService.webRead({ ...(p.scrolls !== undefined ? { scrolls: Number(p.scrolls) } : {}), ...(p.chat ? { chat: String(p.chat).slice(0, 120) } : {}), ...(p.since !== undefined ? { since: Number(p.since) } : {}) });
    } else if (op.startsWith('gmail')) {
      const { gmailService } = await import('./runtime/connectors/gmail/gmailService');
      if (op === 'gmailList') return gmailService.list();
      if (op === 'gmailAdd') return gmailService.add({ email: String(p.email ?? '').slice(0, 200), appPassword: String(p.appPassword ?? '').slice(0, 100), name: p.name ? String(p.name).slice(0, 80) : undefined });
      if (op === 'gmailRemove') return gmailService.remove(String(p.email ?? '').slice(0, 200));
    }
    throw new Error(`Thao tác kết nối không hợp lệ: ${op}`);
  });
  ipcMain.handle(IPC.larkWebSwitchAccount, (_e, id?: string) => runtime.larkWebSwitchAccount(String(id ?? '').slice(0, 40)));
  ipcMain.handle(IPC.larkWebAddAccount, () => runtime.larkWebAddAccount());
  ipcMain.handle(IPC.larkWebLogout, () => runtime.larkWebLogout());
  ipcMain.handle(IPC.larkUiTemplateList, () => runtime.larkUiTemplateList());
  ipcMain.handle(IPC.larkUiTemplateSave, (_e, input: { name: string; description?: string }) => runtime.larkUiTemplateSave(input));
  ipcMain.handle(IPC.larkUiTemplateDelete, (_e, id: string) => runtime.larkUiTemplateDelete(String(id || '')));
  ipcMain.handle(IPC.larkUiTemplateApply, (_e, input: { id: string; baseId?: string; vars?: Record<string, string>; title?: string }) => runtime.larkUiTemplateApply(input));
  ipcMain.handle(IPC.larkListBases, () => runtime.larkListBases());
  ipcMain.handle(IPC.larkDiscoverBases, () => runtime.larkDiscoverBases());
  ipcMain.handle(IPC.larkBaseSnapshot, (_e, appToken: string) => runtime.larkBaseSnapshot(appToken));
  ipcMain.handle(IPC.larkAddBase, (_e, input: { appToken?: string; url?: string; name?: string; description?: string }) =>
    runtime.larkAddBase(input),
  );
  ipcMain.handle(IPC.larkRemoveBase, (_e, appToken: string) => runtime.larkRemoveBase(appToken));
  // Tự động hoá (Larkwave rule engine).
  ipcMain.handle(IPC.larkListAutomations, () => runtime.larkListAutomations());
  ipcMain.handle(IPC.larkSaveAutomation, (_e, rule) => runtime.larkSaveAutomation(rule));
  ipcMain.handle(IPC.larkDeleteAutomation, (_e, id: string) => runtime.larkDeleteAutomation(id));
  ipcMain.handle(IPC.larkSetAutomationEnabled, (_e, id: string, on: boolean) =>
    runtime.larkSetAutomationEnabled(id, on),
  );
  ipcMain.handle(IPC.larkRunAutomation, (_e, id: string) => runtime.larkRunAutomation(id));
  ipcMain.handle(IPC.larkAutomationFolder, (_e, id: string) => runtime.larkAutomationFolder(id));
  ipcMain.handle(IPC.larkAutomationAddInput, (_e, id: string, file: { name: string; dataBase64: string }) => runtime.larkAutomationAddInput(id, file));
  ipcMain.handle(IPC.larkAutomationRemoveInput, (_e, id: string, name: string) => runtime.larkAutomationRemoveInput(id, name));
  ipcMain.handle(IPC.larkAutomationResetProcessed, (_e, id: string) => runtime.larkAutomationResetProcessed(id));
  ipcMain.handle(IPC.larkAutomationRevealFolder, (_e, id: string) => runtime.larkAutomationRevealFolder(id));
  ipcMain.handle(IPC.larkListTables, (_e, appToken: string) => runtime.larkListTables(appToken));
  ipcMain.handle(IPC.larkConfirmTool, (_e, callId: string, decision: 'allow' | 'deny') =>
    runtime.larkConfirmTool(callId, decision),
  );
  ipcMain.handle(IPC.larkAnswerAsk, (_e, callId: string, answer: string) => runtime.larkAnswerAsk(callId, answer));
  ipcMain.handle(IPC.larkSetAutoApprove, (_e, on: boolean) => runtime.larkSetAutoApprove(on));
  ipcMain.handle(IPC.larkGetWorkflowAuto, () => runtime.larkGetWorkflowAuto());
  ipcMain.handle(IPC.larkSetWorkflowAuto, (_e, on: boolean) => runtime.larkSetWorkflowAuto(!!on));
  ipcMain.handle(IPC.larkSetAgentPrefs, (_e, prefs: { runner?: string; model?: string }) =>
    runtime.larkSetAgentPrefs(prefs),
  );
  ipcMain.handle(IPC.larkBackupSync, (_e, token: string) => runtime.larkBackupSync(token));
  ipcMain.handle(IPC.larkResetChat, () => runtime.larkResetChat());
  ipcMain.handle(IPC.larkSessions, () => runtime.larkSessions());
  ipcMain.handle(IPC.larkNewSession, (_e, bases?: LarkBaseRef[], opts?: { kind?: 'workflow' }) =>
    runtime.larkNewSession(bases, opts?.kind === 'workflow' ? { kind: 'workflow' } : undefined),
  );
  ipcMain.handle(IPC.larkWebListBases, (_e, input?: { query?: string }) =>
    runtime.larkWebListBases(typeof input?.query === 'string' ? { query: input.query.slice(0, 200) } : undefined),
  );
  ipcMain.handle(IPC.larkSwitchSession, (_e, id: string) => runtime.larkSwitchSession(id));
  ipcMain.handle(IPC.larkSaveSession, (_e, id: string, items: unknown[], bases?: LarkBaseRef[]) =>
    runtime.larkSaveSession(id, items, bases),
  );
  ipcMain.handle(IPC.larkDeleteSession, (_e, id: string) => runtime.larkDeleteSession(id));
  ipcMain.handle(IPC.larkRenameSession, (_e, id: string, title: string) => runtime.larkRenameSession!(id, title));
  ipcMain.handle(IPC.larkListFiles, () => runtime.larkListFiles!());
  ipcMain.handle(IPC.larkReadFile, (_e, convId: string, name: string) => runtime.larkReadFile!(convId, name));
  ipcMain.handle(IPC.larkDeleteFile, (_e, convId: string, name: string) => runtime.larkDeleteFile!(convId, name));
  ipcMain.handle(IPC.larkNotes, (_e, id: string) => runtime.larkNotes(id));
  ipcMain.handle(IPC.larkSaveNotes, (_e, id: string, doc: LarkNoteDoc) => runtime.larkSaveNotes(id, doc));
  ipcMain.handle(IPC.larkSpec, (_e, token: string) => runtime.larkSpec(token));
  ipcMain.handle(IPC.larkSaveSpec, (_e, doc: LarkSpecDoc, token: string) => runtime.larkSaveSpec(doc, token));
  ipcMain.handle(IPC.larkBuildSpec, (_e, token: string) => runtime.larkBuildSpec(token));
  ipcMain.handle(IPC.larkPromoteToSpec, (_e, input: SpecPromoteInput, token: string) =>
    runtime.larkPromoteToSpec(input, token),
  );
  ipcMain.handle(IPC.cmsSyncConfig, () => runtime.cmsSyncConfig());
  ipcMain.handle(IPC.cmsSyncSetBaseUrl, (_e, url: string) => runtime.cmsSyncSetBaseUrl(url));
  ipcMain.handle(IPC.cmsSyncListJobs, () => runtime.cmsSyncListJobs());
  ipcMain.handle(IPC.cmsSyncCreateJob, (_e, input: { name: string; appToken: string; tableIds: string[]; enabled?: boolean; intervalSeconds?: number }) =>
    runtime.cmsSyncCreateJob(input),
  );
  ipcMain.handle(IPC.cmsSyncSetJobTables, (_e, jobId: string, tableIds: string[]) => runtime.cmsSyncSetJobTables(jobId, tableIds));
  ipcMain.handle(IPC.cmsSyncUpdateJob, (_e, jobId: string, patch: CmsSyncJobPatch) => runtime.cmsSyncUpdateJob(jobId, patch));
  ipcMain.handle(IPC.cmsSyncGetErrorReport, () => runtime.cmsSyncGetErrorReport());
  ipcMain.handle(IPC.cmsSyncSetErrorReport, (_e, cfg: CmsSyncErrorReport) => runtime.cmsSyncSetErrorReport(cfg));
  ipcMain.handle(IPC.cmsSyncKeeperStatus, () => runtime.cmsSyncKeeperStatus());
  ipcMain.handle(IPC.cmsSyncListLarkChats, () => runtime.cmsSyncListLarkChats());
  ipcMain.handle(IPC.cmsSyncCreateLarkChat, (_e, name: string) => runtime.cmsSyncCreateLarkChat(name));
  ipcMain.handle(IPC.cmsSyncTestErrorReport, (_e, target: { larkWebhookUrl?: string; chatId?: string }) => runtime.cmsSyncTestErrorReport(target));
  ipcMain.handle(IPC.cmsSyncRefreshAll, () => runtime.cmsSyncRefreshAll());
  ipcMain.handle(IPC.cmsSyncLoginHistory, () => runtime.cmsSyncLoginHistory());
  ipcMain.handle(IPC.cmsSyncRefreshJob, (_e, jobId: string) => runtime.cmsSyncRefreshJob(jobId));
  ipcMain.handle(IPC.cmsSyncExecute, (_e, jobId: string) => runtime.cmsSyncExecute(jobId));
  ipcMain.handle(IPC.cmsSyncToggle, (_e, jobId: string) => runtime.cmsSyncToggle(jobId));
  ipcMain.handle(IPC.cmsSyncDeleteJob, (_e, jobId: string) => runtime.cmsSyncDeleteJob(jobId));
  ipcMain.handle(IPC.larkSummaries, (_e, id: string) => runtime.larkSummaries(id));
  ipcMain.handle(IPC.larkSummarize, (_e, id: string, itemId: string, text: string) =>
    runtime.larkSummarize(id, itemId, text),
  );
  ipcMain.handle(IPC.larkSetAccount, async (_e, userId: string | null) => {
    await runtime.larkSetAccount(userId);
    // Lần đăng nhập đầu của tài khoản này ⇒ tự nhập dữ liệu cũ của app Toolswave (một lần).
    toolswaveMigration.setAccount(userId);
  });
  ipcMain.handle(IPC.toolswaveMigrationStatus, () => toolswaveMigration.status());
  ipcMain.handle(IPC.toolswaveMigrate, (_e, o?: { dryRun?: boolean }) => toolswaveMigration.run({ dryRun: !!o?.dryRun }));
  ipcMain.handle(IPC.larkGrantPolicies, () => runtime.larkGrantPolicies());
  ipcMain.handle(IPC.larkSetGrantPolicy, (_e, grantId: string, policy: LarkGrantPolicy | null) =>
    runtime.larkSetGrantPolicy(grantId, policy),
  );
  ipcMain.handle(IPC.larkRunGrantTurn, (_e, grantId: string, prompt: string) =>
    runtime.larkRunGrantTurn(grantId, prompt),
  );
  ipcMain.handle(IPC.larkRunAgentGrantTurn, (_e, grantId: string, prompt: string) =>
    runtime.larkRunAgentGrantTurn(grantId, prompt),
  );
  ipcMain.handle(IPC.larkHandoffSession, () => runtime.larkHandoffSession());
  ipcMain.handle(IPC.larkCompactSession, (_e, convId?: string) => runtime.larkCompactSession!(convId));
  // Public sharing of a conversation → website link.
  ipcMain.handle(IPC.larkShareSession, (_e, id: string, token: string) => runtime.larkShareSession(id, token));
  ipcMain.handle(IPC.larkUnshareSession, (_e, id: string, token: string) => runtime.larkUnshareSession(id, token));
  ipcMain.handle(IPC.larkShareStatus, (_e, id: string, token: string) => runtime.larkShareStatus(id, token));
  ipcMain.handle(IPC.larkBotStatus, () => runtime.larkBotStatus());
  ipcMain.handle(IPC.larkBotConfigure, (_e, cfg) => runtime.larkBotConfigure(cfg));
  ipcMain.handle(IPC.larkBotCreateChat, (_e, name: string) => runtime.larkBotCreateChat(name));

  // Curated plugins.
  ipcMain.handle(IPC.pluginList, () => runtime.listPlugins());
  ipcMain.handle(IPC.pluginInstall, (_e, source: string) => runtime.installPlugin(source));
  ipcMain.handle(IPC.pluginSetEnabled, (_e, id: string, enabled: boolean) =>
    runtime.setPluginEnabled(id, enabled),
  );
  ipcMain.handle(IPC.pluginUninstall, (_e, id: string) => runtime.uninstallPlugin(id));
  ipcMain.handle(IPC.pluginPanels, () => runtime.larkPluginPanels());
  ipcMain.handle(IPC.larkRunTool, (_e, name: string, input: Record<string, unknown>) =>
    runtime.larkRunTool(name, input),
  );
  ipcMain.handle(IPC.larkChat, async (_e, streamId: string, input: LarkChatInput) => {
    (async () => {
      try {
        for await (const ev of runtime.larkChat(input)) {
          if (win.isDestroyed()) return;
          win.webContents.send(IPC.larkChatEvent, streamId, ev);
        }
      } catch (err) {
        win.webContents.send(IPC.larkChatEvent, streamId, { type: 'error', message: (err as Error).message });
      }
      if (!win.isDestroyed()) win.webContents.send(IPC.larkChatEvent, streamId, { type: '__end__' });
    })();
    return { started: true };
  });
}

// ── larkwave:// deep link → Larkwave-account OAuth token hand-off ──────────
// The browser OAuth flow finishes by 302-ing to `larkwave://auth?token=<JWT>`;
// the OS routes that to this running app, and we push the JWT to the renderer.
// (mainWin is declared near the top so the agent client can reach it.)
let pendingDeepLink: string | null = null;
/** The bundled (fallback) home URL — set at load; used by the code-push resolver. */
let localHomeUrl = 'app://./home';

/** Bring the main window back to front + force a repaint. macOS can leave the parent window
 *  BLACK after a child window (e.g. the Lark OAuth window) closes; a focus + tiny resize nudge
 *  reliably un-blacks it. */
function restoreMainWindow(win: BrowserWindow | null): void {
  try {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    try {
      win.webContents.invalidate();
    } catch {
      /* older Electron — the resize nudge below covers it */
    }
    // A 1px resize round-trip forces a compositor repaint (the reliable fix for a stale/black window).
    const b = win.getBounds();
    win.setBounds({ ...b, height: b.height + 1 });
    win.setBounds(b);
  } catch {
    /* best-effort */
  }
}

function handleDeepLink(url: string): void {
  try {
    const token = new URL(url).searchParams.get('token');
    if (!token) return;
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.focus();
      mainWin.webContents.send(IPC.authDeepLink, token);
    } else {
      pendingDeepLink = url; // window not ready yet — flush after it's created
    }
  } catch {
    /* malformed deep link — ignore */
  }
}

// Register the custom scheme (in dev, bind to the dev binary + entry script).
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('larkwave', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('larkwave');
}

// Single-instance lock so a second `larkwave://` launch routes to this window.
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  app.quit();
} else {
  app.on('open-url', (e, url) => {
    e.preventDefault(); // macOS delivers deep links here
    handleDeepLink(url);
  });
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith('larkwave://')); // Win/Linux
    if (url) handleDeepLink(url);
    else if (mainWin && !mainWin.isDestroyed()) mainWin.focus();
  });

  (async () => {
    await app.whenReady();
    // Hidden dev mode: not even a Dock icon (nothing appears on the user's screen).
    if (hiddenMode() && process.platform === 'darwin') {
      try {
        app.dock?.hide();
      } catch {
        /* ignore */
      }
    }
    const win = new BrowserWindow({
      width: 1280,
      height: 860,
      // Show immediately so user sees the app (with internal loading states/skeleton) instead of blank + spinner.
      // LARKWAVE_HIDDEN=1 (dev only): never shown, still painted → drive/screenshot it over CDP.
      show: !hiddenMode(),
      paintWhenInitiallyHidden: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    });
    mainWin = win;
    // Khôi phục phiên Zalo đã lưu (kỹ năng Zalo) — chạy nền, không chặn khởi động. Chưa từng kết nối thì
    // không có tệp phiên nào và zca-js không được nạp.
    setTimeout(() => {
      void import('./runtime/connectors/zalo/zaloService')
        .then((m) => m.zaloService.restore())
        .catch((e) => console.warn('[zalo] restore:', (e as Error)?.message));
    }, 4000);
    // The Lark web page parks off-screen inside the main window so it keeps painting while hidden.
    try {
      getLarkWebSession().setParkingWindow(win);
    } catch (e) {
      console.error('[boot] setParkingWindow failed:', e);
    }
    if (hiddenMode()) {
      // Hidden dev mode: a window that is never shown has no display surface for its child views
      // (the Lark page would not paint / capture). So the window IS shown — fully transparent,
      // click-through, unfocusable, off every display, no taskbar/Dock entry. Nothing on screen.
      try {
        win.setOpacity(0);
        win.setIgnoreMouseEvents(true);
        win.setFocusable(false);
        win.setSkipTaskbar(true);
        win.setPosition(-30000, -30000);
        win.showInactive();
        win.setPosition(-30000, -30000);
      } catch (e) {
        console.error('[boot] hidden mode setup failed:', e);
      }
    }
    // Auto-recover from a renderer crash (a "black screen") instead of leaving a dead window —
    // reload the current URL so the app comes back on its own.
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[main] renderer gone:', details.reason);
      if (details.reason !== 'clean-exit' && !win.isDestroyed()) {
        setTimeout(() => {
          if (!win.isDestroyed()) win.webContents.reload();
        }, 300);
      }
    });
    // Push "Lark web session died" events to the renderer (→ a persistent re-login banner).
    runtime.setLarkWebSessionDeadEmitter(() => {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(IPC.larkWebSessionDead);
    });
    // NEVER let a failing IPC registration (e.g. a stale-bundled channel const → an
    // ipcMain.handle with an undefined channel throws) abort startup: that would leave the
    // window created but the renderer never loaded → a permanent WHITE screen. Registering
    // handlers must be best-effort so loadURL below always runs.
    try {
      registerIpc(win);
    } catch (e) {
      console.error('[boot] registerIpc failed — some IPC handlers may be unavailable:', e);
    }
    // Restore remote control if it was left enabled: safeStorage is ready now, so
    // the persisted JWT can be read and the command stream reconnected on its own
    // (an idle machine starts receiving phone commands without opening Settings).
    try {
      agentClient.bootstrap();
    } catch (e) {
      console.error('[boot] agentClient.bootstrap failed:', e);
    }

    if (isProd) {
      // Code push: load a pushed remote renderer if one is published + compatible,
      // else the bundled renderer. Never blocks startup (falls back on any problem) —
      // and if the remote load itself fails, fall back to the bundled renderer rather
      // than leaving a blank window.
      localHomeUrl = 'app://./home';
      let target = localHomeUrl;
      try {
        // resolveRenderer tự nạp ảnh chụp phiên bản cho các lượt agent (xem codePush).
        target = (await resolveRenderer(localHomeUrl)).url;
      } catch (e) {
        console.error('[boot] resolveRenderer failed — using bundled renderer:', e);
      }
      try {
        await win.loadURL(target);
      } catch (e) {
        console.error('[boot] loadURL failed for', target, '— falling back to bundled:', e);
        if (target !== localHomeUrl) await win.loadURL(localHomeUrl).catch(() => undefined);
      }
    } else {
      const port = process.argv[2] || '8888';
      localHomeUrl = `http://localhost:${port}/home`;
      await win.loadURL(localHomeUrl);
      // DevTools is a window too — not in hidden mode.
      if (!hiddenMode()) win.webContents.openDevTools({ mode: 'detach', activate: false });
    }

    // Cold-start (Win/Linux argv) or an open-url that arrived before the window.
    const coldUrl = process.argv.find((a) => a.startsWith('larkwave://'));
    if (coldUrl) handleDeepLink(coldUrl);
    if (pendingDeepLink) {
      const u = pendingDeepLink;
      pendingDeepLink = null;
      handleDeepLink(u);
    }
  })();

  app.on('before-quit', () => {
    forceReleaseAll('quit'); // SIGTERM every running AI turn so no orphaned CLI outlives the app
  });
  app.on('window-all-closed', () => app.quit());
}
