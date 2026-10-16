#!/usr/bin/env node
/**
 * KIỂM KẾT NỐI ZALO / GMAIL TRÊN BẢN ĐÃ GÓI — chạy sau boot-smoke, trước khi phát hành.
 *
 * Vì sao cần: bản cài chỉ mang `app/` (main đã được webpack gom), KHÔNG mang node_modules. zca-js (ESM),
 * nodemailer, imapflow (kéo theo pino) phải chạy được SAU KHI GOM — typecheck và test node không thấy
 * được lỗi gom (thiếu chunk, require động gãy). Ở đây nạp ĐÚNG background.js của bản dựng (electron giả
 * như boot-smoke) rồi gọi kênh `tw:connectorsCall` thật:
 *   1. zaloQrStart → phải ra ảnh QR thật từ máy chủ Zalo (zca-js chạy được) → huỷ ngay, không ai quét.
 *   2. gmailAdd với địa chỉ `@example.invalid` (không thể là tài khoản thật của ai) → Google phải TỪ CHỐI
 *      ĐĂNG NHẬP qua cả SMTP lẫn IMAP (nodemailer + imapflow chạy được). Lỗi kiểu "Cannot find module" /
 *      "is not a function" = bản gom hỏng.
 * Cần mạng. Dùng:  node scripts/connectors-smoke.mjs [đường/dẫn/app.asar]
 */
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Module from 'node:module';

async function extractAsar(archive, dest) {
  const store = resolve('node_modules/.pnpm');
  const dir = existsSync(store) ? readdirSync(store).find((d) => d.startsWith('@electron+asar@')) : null;
  if (!dir) throw new Error('không thấy @electron/asar trong node_modules/.pnpm');
  const mod = await import(pathToFileURL(join(store, dir, 'node_modules/@electron/asar/lib/asar.js')).href);
  (mod.extractAll ?? mod.default?.extractAll)(archive, dest);
}

let appDir = process.argv[2] || 'apps/desktop/dist/mac-universal/Larkwave.app/Contents/Resources/app.asar';
if (appDir.endsWith('.asar')) {
  if (!existsSync(appDir)) {
    console.error(`✗ không thấy ${appDir} — dựng trước bằng dist:mac`);
    process.exit(1);
  }
  const out = mkdtempSync(join(tmpdir(), 'lw-conn-'));
  await extractAsar(appDir, out);
  appDir = out;
}
const background = resolve(appDir, 'app/background.js');
const userData = mkdtempSync(join(tmpdir(), 'lw-conn-data-'));
const handlers = new Map();

class FakeWindow {
  webContents = { on() {}, once() {}, send() {}, setWindowOpenHandler() {}, session: { webRequest: { onBeforeSendHeaders() {}, onHeadersReceived() {} }, cookies: { get: async () => [] } }, executeJavaScript: async () => undefined, openDevTools() {} };
  on() {}
  once() {}
  async loadURL() {}
  async loadFile() {}
  show() {}
  focus() {}
  maximize() {}
  isDestroyed() { return false; }
  isMinimized() { return false; }
  isVisible() { return true; }
  restore() {}
  setMenuBarVisibility() {}
  destroy() {}
  close() {}
  getBounds() { return { x: 0, y: 0, width: 1200, height: 800 }; }
  setBounds() {}
}
const electronMock = {
  app: { getPath: () => userData, getName: () => 'Larkwave', getVersion: () => '0.0.0-smoke', getAppPath: () => appDir, whenReady: async () => {}, on() {}, once() {}, setAsDefaultProtocolClient: () => true, requestSingleInstanceLock: () => true, quit() {}, isPackaged: true, commandLine: { appendSwitch() {} } },
  BrowserWindow: Object.assign(FakeWindow, { getAllWindows: () => [], fromWebContents: () => null }),
  ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on() {}, removeHandler() {} },
  protocol: { registerSchemesAsPrivileged() {}, handle() {}, registerFileProtocol: () => true, registerStringProtocol: () => true },
  shell: { openExternal: async () => {}, showItemInFolder() {} },
  dialog: { showOpenDialog: async () => ({ canceled: true }), showMessageBox: async () => ({ response: 0 }) },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu() {} },
  Tray: class { setToolTip() {} setContextMenu() {} on() {} destroy() {} },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }) },
  Notification: Object.assign(class { show() {} on() {} }, { isSupported: () => false }),
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders() {} }, cookies: { get: async () => [] } }, fromPartition: () => ({ webRequest: { onBeforeSendHeaders() {} }, cookies: { get: async () => [] }, clearStorageData: async () => {} }) },
  powerSaveBlocker: { start: () => 1, stop() {} },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1440, height: 900 } }) },
  globalShortcut: { register: () => true, unregisterAll() {} },
  autoUpdater: { on() {}, checkForUpdates: async () => {} },
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronMock;
  return origLoad.apply(this, [request, ...rest]);
};

await import(`file://${background}`);
await new Promise((r) => setTimeout(r, 2500));
const call = handlers.get('tw:connectorsCall');
let bad = 0;
const fail = (m) => {
  bad++;
  console.error(`✗ ${m}`);
};
const BUNDLE_BROKEN = /Cannot find module|is not a function|is not a constructor|Unexpected token|ERR_REQUIRE_ESM|__webpack|Module not found/i;

if (!call) {
  console.error('✗ không có kênh tw:connectorsCall — lõi cũ hoặc registerIpc chết giữa chừng');
  process.exit(1);
}

// 1. Zalo: trạng thái → QR thật → huỷ.
try {
  const st = await call({}, 'zaloStatus');
  if (!st || !Array.isArray(st.accounts) || !st.qr) fail(`zaloStatus trả lạ: ${JSON.stringify(st).slice(0, 200)}`);
  await call({}, 'zaloQrStart');
  let snap = null;
  for (let i = 0; i < 40; i++) {
    snap = (await call({}, 'zaloStatus')).qr;
    if (snap.image || ['error', 'expired', 'declined'].includes(snap.state)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (snap?.image && snap.image.length > 1000) console.log(`✓ Zalo: zca-js chạy trong bản gom — có ảnh QR thật (${snap.image.length} ký tự base64, trạng thái ${snap.state})`);
  else fail(`Zalo: không ra ảnh QR (trạng thái ${snap?.state}: ${snap?.message})`);
  await call({}, 'zaloQrAbort');
} catch (e) {
  fail(`Zalo ném lỗi${BUNDLE_BROKEN.test(String(e?.message)) ? ' (BẢN GOM HỎNG)' : ''}: ${e?.message}`);
}

// 2. Gmail: tài khoản không thể tồn tại → Google phải từ chối đăng nhập (SMTP + IMAP đã thật sự chạy).
try {
  await call({}, 'gmailAdd', { email: 'larkwave-smoke@example.invalid', appPassword: 'abcd efgh ijkl mnop' });
  fail('Gmail: tài khoản giả mà lại "kết nối được"?');
} catch (e) {
  const m = String(e?.message || e);
  if (BUNDLE_BROKEN.test(m)) fail(`Gmail: BẢN GOM HỎNG — ${m}`);
  // verify() chạy SMTP + IMAP song song và nối câu lỗi KHÁC nhau: một câu duy nhất = cả hai cùng ra lỗi đăng nhập.
  else if (m.split(' · ').every((x) => /từ chối đăng nhập|MẬT KHẨU ỨNG DỤNG/i.test(x))) console.log(`✓ Gmail: nodemailer (SMTP) + imapflow (IMAP) chạy trong bản gom — Google từ chối tài khoản giả ở cả hai`);
  else fail(`Gmail: lỗi không mong đợi (mạng?): ${m.slice(0, 200)}`);
}
const list = await call({}, 'gmailList');
if (!Array.isArray(list) || list.length) fail(`gmailList phải rỗng sau lần thử thất bại: ${JSON.stringify(list)}`);

if (bad) {
  console.error(`\n✗ ${bad} lỗi — KHÔNG phát hành`);
  process.exit(1);
}
console.log('✓ kết nối Zalo / Gmail chạy được trên bản đã gói');
process.exit(0);
