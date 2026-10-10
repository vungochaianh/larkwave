#!/usr/bin/env node
/**
 * Chạy thử khởi động bản ĐÃ ĐÓNG GÓI với `electron` giả lập, rồi đếm số kênh IPC đăng ký được.
 *
 * Vì sao cần: `dist:mac` gói `@larkwave/core` từ `dist/` chứ không từ `src/`, và KHÔNG tự dựng
 * lại nó. Một `core` cũ ⇒ một kênh IPC thành `undefined` ⇒ `ipcMain.handle(undefined, …)` ném ⇒
 * `registerIpc` chết giữa chừng ⇒ renderer gọi gì cũng treo ⇒ **màn hình trắng ngay khi mở app**.
 * Đúng lớp lỗi đã làm hỏng bản 1.0.92. Bản cài trắng màn hình thì người dùng không báo lỗi được,
 * họ chỉ gỡ ra — nên phải bắt ở đây, trước khi đẩy.
 *
 * Cách dùng:  node scripts/boot-smoke.mjs [đường/dẫn/tới/app.asar hoặc thư mục đã giải nén]
 * Mặc định lấy bản vừa dựng ở apps/desktop/dist/mac-universal/.
 *
 * CẢNH BÁO khi sửa file này: giả lập THIẾU một phương thức sẽ làm `registerIpc` ném sớm và số
 * kênh tụt xuống — trông y hệt lỗi thật. Lần trước `BrowserWindow` của tôi thiếu `isDestroyed`
 * và tôi suýt tưởng bản dựng hỏng. Số kênh tụt thì nghi giả lập TRƯỚC, rồi mới nghi bản dựng.
 */
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';

/** Dưới ngưỡng này gần như chắc chắn là registerIpc đã chết giữa chừng. */
const MIN_CHANNELS = 150;

/**
 * Giải nén asar bằng THƯ VIỆN, không spawn `npx`.
 *
 * `npx` trần ném ENOENT trên Windows (phải là npx.cmd), mà `npx.cmd` thì Node ≥20 chặn với EINVAL
 * trừ khi shell:true (bản vá CVE-2024-27980) — và shell:true lại vỡ vì thư mục tạm của Windows có
 * dấu cách ("C:\Users\Hp Win11\..."). Ba lớp vấp chồng nhau; dùng thẳng thư viện là hết.
 *
 * @electron/asar là phụ thuộc GIÁN TIẾP (qua electron-builder) nên require.resolve từ gốc dự án
 * không thấy — phải tìm trong store của pnpm.
 */
async function extractAsar(archive, dest) {
  const store = resolve('node_modules/.pnpm');
  const dir = existsSync(store) ? readdirSync(store).find((d) => d.startsWith('@electron+asar@')) : null;
  if (!dir) {
    console.error('✗ không thấy @electron/asar trong node_modules/.pnpm — chạy `pnpm install` trước.');
    process.exit(1);
  }
  const mod = await import(pathToFileURL(join(store, dir, 'node_modules/@electron/asar/lib/asar.js')).href);
  (mod.extractAll ?? mod.default?.extractAll)(archive, dest);
}

const argPath = process.argv[2];
/**
 * Mặc định theo NỀN TẢNG ĐANG CHẠY. Trước đây cứng cú pháp đường dẫn của bản mac, nên trên máy
 * phát hành Windows script này không chạy nổi — tức là nền tảng duy nhất KHÔNG có lưới an toàn
 * lại đúng là nền tảng có máy dựng riêng, ít người ngó nhất.
 */
const DEFAULT_ASAR =
  process.platform === 'win32'
    ? 'apps/desktop/dist/win-unpacked/resources/app.asar'
    : 'apps/desktop/dist/mac-universal/Larkwave.app/Contents/Resources/app.asar';
let appDir = argPath || DEFAULT_ASAR;

if (appDir.endsWith('.asar')) {
  if (!existsSync(appDir)) {
    const how = process.platform === 'win32' ? 'dist:win' : 'dist:mac';
    console.error(`✗ không thấy ${appDir} — dựng trước bằng \`pnpm --filter desktop ${how}\``);
    process.exit(1);
  }
  const out = mkdtempSync(join(tmpdir(), 'tw-boot-'));
  await extractAsar(appDir, out);
  appDir = out;
}

const background = resolve(appDir, 'app/background.js');
if (!existsSync(background)) {
  console.error(`✗ không thấy ${background}`);
  process.exit(1);
}

const channels = new Set();
const userData = mkdtempSync(join(tmpdir(), 'tw-boot-data-'));

/** Cửa sổ giả — phải có ĐỦ những gì background.ts gọi tới, xem cảnh báo ở đầu file. */
class FakeWindow {
  webContents = {
    on: () => {},
    once: () => {},
    send: () => {},
    setWindowOpenHandler: () => {},
    session: { webRequest: { onBeforeSendHeaders: () => {}, onHeadersReceived: () => {} }, cookies: { get: async () => [] } },
    executeJavaScript: async () => undefined,
    openDevTools: () => {},
  };
  on = () => {};
  once = () => {};
  loadURL = async () => {};
  loadFile = async () => {};
  show = () => {};
  focus = () => {};
  maximize = () => {};
  isDestroyed = () => false;
  isMinimized = () => false;
  isVisible = () => true;
  restore = () => {};
  setMenuBarVisibility = () => {};
  destroy = () => {};
  close = () => {};
  getBounds = () => ({ x: 0, y: 0, width: 1200, height: 800 });
  setBounds = () => {};
}

const electronMock = {
  app: {
    getPath: () => userData,
    getName: () => 'Larkwave',
    getVersion: () => '0.0.0-smoke',
    getAppPath: () => appDir,
    // PHẢI resolve: `registerIpc(win)` nằm SAU `await app.whenReady()` (background.ts ~604).
    // Để treo mãi thì không kênh nào được đăng ký và bài kiểm báo 0 — trông y như bản dựng hỏng.
    whenReady: async () => {},
    on: () => {},
    once: () => {},
    setAsDefaultProtocolClient: () => true,
    requestSingleInstanceLock: () => true,
    quit: () => {},
    isPackaged: true,
    commandLine: { appendSwitch: () => {} },
  },
  BrowserWindow: Object.assign(FakeWindow, {
    getAllWindows: () => [],
    fromWebContents: () => null,
  }),
  ipcMain: {
    handle: (ch) => {
      if (typeof ch !== 'string' || !ch) throw new Error(`kênh IPC không hợp lệ: ${String(ch)}`);
      channels.add(ch);
    },
    on: (ch) => {
      if (typeof ch === 'string' && ch) channels.add(ch);
    },
    removeHandler: () => {},
  },
  protocol: {
    registerSchemesAsPrivileged: () => {},
    handle: () => {},
    registerFileProtocol: () => true,
    registerStringProtocol: () => true,
  },
  shell: { openExternal: async () => {}, showItemInFolder: () => {} },
  dialog: { showOpenDialog: async () => ({ canceled: true }), showMessageBox: async () => ({ response: 0 }) },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  Tray: class { setToolTip() {} setContextMenu() {} on() {} destroy() {} },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }) },
  Notification: Object.assign(class { show() {} on() {} }, { isSupported: () => false }),
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: () => {} }, cookies: { get: async () => [] } }, fromPartition: () => ({ webRequest: { onBeforeSendHeaders: () => {} }, cookies: { get: async () => [] }, clearStorageData: async () => {} }) },
  powerSaveBlocker: { start: () => 1, stop: () => {} },
  screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1440, height: 900 } }) },
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  autoUpdater: { on: () => {}, checkForUpdates: async () => {} },
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'electron') return electronMock;
  return origLoad.apply(this, [request, ...rest]);
};

let bootError = null;
try {
  await import(`file://${background}`);
} catch (e) {
  bootError = e;
}

// registerIpc chạy trong một IIFE bất đồng bộ sau whenReady — chờ vài nhịp cho nó xong.
//
// Sau đó PHẢI tự thoát: app thật dựng hẹn giờ, mở cổng nghe, gọi mạng… nên vòng lặp sự kiện
// không bao giờ rỗng và `node` treo vô hạn. Bài kiểm treo còn tệ hơn bài kiểm đỏ — nó làm nghẽn
// cả lượt phát hành mà không nói gì.
await new Promise((r) => setTimeout(r, 2500));

console.log(`kênh IPC đăng ký được: ${channels.size}`);
if (bootError) {
  console.error(`✗ nạp background.js ném lỗi: ${bootError.message}`);
  process.exit(1);
}
if (channels.size < MIN_CHANNELS) {
  console.error(
    `✗ chỉ có ${channels.size} kênh (ngưỡng ${MIN_CHANNELS}). registerIpc nhiều khả năng đã chết giữa chừng —\n` +
      '  nghi GIẢ LẬP thiếu phương thức trước, rồi mới nghi bản dựng (xem cảnh báo đầu file).',
  );
  process.exit(1);
}

// Những kênh mà một bản dựng "trắng màn hình" hay đánh rơi: khai báo ở core nhưng core cũ thì mất.
const MUST_HAVE = ['tw:auth', 'tw:larkStatus', 'tw:larkHostedPush'];
const missing = MUST_HAVE.filter((c) => !channels.has(c));
if (missing.length) {
  console.error(`✗ thiếu kênh bắt buộc: ${missing.join(', ')}`);
  console.error('  Đây đúng là dấu hiệu core cũ — dựng @larkwave/core RỒI dựng lại .dmg.');
  process.exit(1);
}

console.log(`✓ khởi động sạch, có đủ ${MUST_HAVE.length} kênh bắt buộc`);
process.exit(0);
