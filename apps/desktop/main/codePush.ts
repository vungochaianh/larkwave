import { app, BrowserWindow, shell } from 'electron';
import { IPC } from '@larkwave/core';
import { primeVersionSnapshot } from './runtime/versionHint';
import { createWriteStream, existsSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const pexec = promisify(execFile);

/**
 * TỰ CÀI bản .dmg vừa tải, thay vì mount rồi để người dùng kéo thả.
 *
 * Vì sao: app CHƯA KÝ, nên macOS (nhất là Apple Silicon) hay báo lỗi Finder -36 ("some data … can't
 * be read or written") đúng lúc kéo .app từ dmg vào Applications. `ditto` copy không dính lỗi đó.
 * Nên: mount (hdiutil) → `ditto` .app đè vào đúng chỗ app đang chạy (hoặc /Applications) → xoá cờ
 * quarantine → tháo mount. Thất bại ở bất kỳ bước nào thì trả false để người gọi LÙI VỀ cách cũ
 * (mở dmg cho kéo tay) — không bao giờ để người dùng kẹt.
 *
 * Lưu ý: bản vá này chỉ có tác dụng từ bản .dmg KẾ TIẾP trở đi (bản đang cài vẫn dùng luồng cũ).
 */
async function installDmgMac(dmg: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  const mnt = join(app.getPath('temp'), `tw-dmg-${Date.now()}`);
  let mounted = false;
  try {
    await pexec('hdiutil', ['attach', dmg, '-nobrowse', '-noautoopen', '-mountpoint', mnt], { timeout: 120_000 });
    mounted = true;
    const appName = readdirSync(mnt).find((n) => n.endsWith('.app'));
    if (!appName) return false;
    const srcApp = join(mnt, appName);
    // Cài ĐÈ lên chính chỗ app đang chạy nếu đó là một .app (thường là /Applications/Larkwave.app);
    // nếu không xác định được thì về /Applications. Ghi đè bundle đang chạy là an toàn trên macOS:
    // tiến trình giữ inode cũ, bundle mới nằm sẵn cho lần mở sau.
    const exe = app.getPath('exe');
    const m = /^(.*\.app)\/Contents\/MacOS\//.exec(exe);
    const destApp = m ? m[1] : join('/Applications', appName);
    await pexec('ditto', [srcApp, destApp], { timeout: 180_000 });
    await pexec('xattr', ['-cr', destApp], { timeout: 30_000 }).catch(() => undefined);
    return true;
  } catch {
    return false; // perms / mount / copy hỏng → lùi về mở dmg cho kéo tay
  } finally {
    if (mounted) await pexec('hdiutil', ['detach', mnt, '-force'], { timeout: 60_000 }).catch(() => undefined);
  }
}

/**
 * Renderer "code push" (OTA). The installed (possibly unsigned) app can pick up new
 * UI/renderer code WITHOUT a reinstall: it fetches a small release manifest, and if a
 * compatible remote renderer is published + reachable, loads THAT instead of the
 * bundled one. Pushing an update = deploy the renderer + bump the manifest. The MAIN
 * process (native/IPC) can't be hot-swapped — when it changes, `latestVersion` >
 * installed version signals "download a new .dmg"; until then the remote renderer is
 * gated by `minMain` so an incompatible UI is never loaded.
 *
 * Trust model: the manifest comes from the first-party HTTPS API; the renderer URL it
 * names must be HTTPS. Falls back to the bundled renderer on ANY problem (offline,
 * 404, abort, incompatible) so the app never breaks.
 */
export interface ReleaseManifest {
  /** HTTPS base URL hosting the latest renderer (the Next.js export). */
  renderer?: string;
  /** Minimum MAIN-process version the remote renderer requires (semver). */
  minMain?: string;
  /**
   * Bản gần nhất có thay đổi phần LÕI (main process). Do push-renderer ghi khi phát hành kèm
   * `--main-change`. Cần một trường RIÊNG vì `minMain` trả lời câu khác hẳn ("renderer mới có chạy
   * nổi trên lõi cũ không"), nên một bản vá lõi phát hành mà vẫn giữ nguyên minMain là VÔ HÌNH.
   */
  mainChangedAt?: string;
  /**
   * Version of the renderer hosted at `renderer`. Used to AVOID DOWNGRADING: a freshly
   * installed `.dmg` ships its own (bundled) renderer at the app version; if the remote
   * renderer is OLDER than the installed one (a stale Pages deploy), we must keep the
   * bundled one — otherwise a newer install would silently load an old UI (e.g. one
   * predating the version footer). Absent ⇒ legacy manifest; treated as "not older".
   */
  rendererVersion?: string;
  /** Latest full app version available (a MAIN change → suggests reinstalling). */
  latestVersion?: string;
  /** Direct installer download URLs (public) for one-click "download + open". */
  downloads?: { mac?: string; win?: string };
  /** Optional message to surface to the user. */
  notice?: string;
}

export interface UpdateInfo {
  /** The renderer is currently being served from a pushed remote build. */
  remote: boolean;
  /** A newer FULL version exists (main changed) → user should reinstall the .dmg. */
  reinstall: boolean;
  current: string;
  latest?: string;
  /** Version of the renderer the manifest advertises (for diagnostics in the footer). */
  rendererVersion?: string;
  /** Bản gần nhất có sửa phần LÕI — chuyển tiếp từ manifest (xem ReleaseManifest.mainChangedAt). */
  mainChangedAt?: string;
  /** Có bản cài mới hơn VÀ nó có sửa lõi → cài lại mới nhận được (xem DesktopUpdateInfo). */
  mainFixPending?: boolean;
  notice?: string;
}

/** Numeric semver-ish compare: 1 if a>b, -1 if a<b, 0 if equal. */
function cmp(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchJson(url: string, ms: number): Promise<any | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    const r = await fetch(url, { signal: c.signal, cache: 'no-store' as RequestCache });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function reachable(url: string, ms: number): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    const r = await fetch(url, { method: 'GET', signal: c.signal, cache: 'no-store' as RequestCache });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

/** Where the release manifest lives. Default = a static file co-hosted with the
 *  pushed renderer on Cloudflare Pages (override with LARKWAVE_RELEASE_URL). */
export function manifestUrl(): string {
  return process.env.LARKWAVE_RELEASE_URL || '';
}

export async function fetchManifest(): Promise<ReleaseManifest | null> {
  // Chưa có kênh phát hành riêng (phase deploy): không có URL thì coi như không có bản mới.
  if (!manifestUrl()) return null;
  return (await fetchJson(manifestUrl(), 5000)) as ReleaseManifest | null;
}

/**
 * One-click "download + open installer": fetch the platform's installer to the Downloads
 * folder and open it (mounts the .dmg / opens the .zip). The app is unsigned so it can't
 * silently auto-apply, but this spares the user hunting the download page. On success the
 * OS installer/DMG opens (or, if opening fails, the file is revealed in the folder).
 */
/**
 * Dịch lỗi mạng thô sang câu người dùng làm được gì đó.
 *
 * `fetch failed` là nguyên văn undici ném ra cho MỌI hỏng hóc tầng mạng — DNS, TLS, kết nối bị
 * cắt giữa chừng. Hiện thẳng chuỗi đó cho người dùng Việt là hiện một câu không ai hành động được,
 * và nó cũng không nói được rằng bấm lại sẽ tải TIẾP chứ không tải lại từ đầu.
 */
function netMessage(e: unknown): string {
  const raw = (e as Error)?.message || '';
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|network/i.test(raw)) {
    return 'Mạng đứt giữa chừng khi tải bộ cài. Bấm lại để tải TIẾP phần còn thiếu (không tải lại từ đầu).';
  }
  if (/ENOSPC/i.test(raw)) return 'Ổ đĩa hết chỗ — bộ cài cần khoảng 250 MB trống.';
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return 'Không phân giải được tên miền — kiểm tra kết nối mạng hoặc DNS.';
  return raw || 'Tải không được.';
}

/**
 * One-click "download + open installer": fetch the platform's installer to the Downloads
 * folder and open it (mounts the .dmg / opens the .zip). The app is unsigned so it can't
 * silently auto-apply, but this spares the user hunting the download page. On success the
 * OS installer/DMG opens (or, if opening fails, the file is revealed in the folder).
 *
 * BA ĐIỀU ĐÃ SỬA, cả ba đều do bộ cài phình lên ~214 MiB (bản universal gộp x64+arm64) trong khi
 * mã này viết cho bộ cài ~100 MB:
 *
 *  1. TẢI DÒNG, không nạp cả tệp vào bộ nhớ. `await res.arrayBuffer()` rồi `Buffer.from()` giữ
 *     HAI bản 214 MiB cùng lúc — hơn 400 MB phình lên trong tiến trình chính, chỉ để ghi ra đĩa.
 *
 *  2. TẢI TIẾP ĐƯỢC. Trước đây mạng đứt ở byte thứ 200 triệu là mất sạch, bấm lại tải lại từ đầu.
 *     Nay ghi vào tệp `.part` và dùng `Range:` để nối tiếp — đây là thứ thật sự sửa được ca
 *     "fetch failed" mà người dùng gặp.
 *
 *  3. KHÔNG CÓ TRẦN TỔNG THỜI GIAN. Trần cũ ở tầng giao diện là 300 giây, tính cho tệp 100 MB.
 *     Với 214 MiB, đường truyền 2 Mbps cần 15 phút ⇒ LUÔN LUÔN quá giờ, không phải thỉnh thoảng.
 *     Cái cần canh là mạng CHẾT, không phải mạng chậm — nên ở đây canh thời gian giữa hai lần
 *     nhận dữ liệu, còn tải bao lâu thì kệ.
 */
/**
 * Kết thúc cài: macOS thì TỰ CÀI bằng ditto rồi khởi động lại; hỏng (hoặc nền tảng khác) thì mở tệp
 * cho người dùng cài tay (luồng cũ). `installed` cho giao diện biết để hiện thông báo đúng.
 */
async function finishInstall(file: string): Promise<{ ok: boolean; path?: string; installed?: boolean }> {
  if (process.platform === 'darwin') {
    const installed = await installDmgMac(file);
    if (installed) {
      try {
        app.relaunch();
      } catch {
        /* vẫn thoát để người dùng tự mở lại bản mới */
      }
      setTimeout(() => {
        try {
          app.exit(0);
        } catch {
          /* ignore */
        }
      }, 1200);
      return { ok: true, path: file, installed: true };
    }
  }
  const openErr = await shell.openPath(file);
  if (openErr) shell.showItemInFolder(file);
  return { ok: true, path: file, installed: false };
}

export async function downloadAndOpenInstaller(): Promise<{ ok: boolean; path?: string; error?: string; installed?: boolean }> {
  const m = await fetchManifest();
  const url = process.platform === 'darwin' ? m?.downloads?.mac : m?.downloads?.win;
  if (!url || !/^https:\/\//i.test(url)) {
    return { ok: false, error: 'Chưa có link tải cho hệ điều hành này (thử lại sau).' };
  }
  const ext = process.platform === 'darwin' ? '.dmg' : url.toLowerCase().endsWith('.zip') ? '.zip' : '.exe';
  const file = join(app.getPath('downloads'), `Larkwave-${m?.latestVersion || 'moi'}${ext}`);
  const part = `${file}.part`;

  try {
    // Đã tải dở tới đâu. Tệp .part là của ĐÚNG phiên bản này (tên mang số hiệu), nên nối tiếp an toàn.
    let have = 0;
    try {
      if (existsSync(part)) have = statSync(part).size;
    } catch {
      have = 0;
    }

    const res = await fetch(url, {
      cache: 'no-store' as RequestCache,
      ...(have > 0 ? { headers: { Range: `bytes=${have}-` } } : {}),
    });

    // 206 = máy chủ chấp nhận nối tiếp. 200 kèm `have > 0` = nó BỎ QUA Range và gửi lại từ đầu —
    // phải ghi đè chứ không nối thêm, nếu không tệp sẽ hỏng một cách im lặng.
    const resuming = res.status === 206 && have > 0;
    if (!res.ok) {
      // 416 = đã tải đủ rồi mà lần trước chưa kịp đổi tên. Không phải lỗi.
      if (res.status === 416 && have > 0) {
        renameSync(part, file);
        return finishInstall(file);
      }
      return { ok: false, error: `Tải lỗi (HTTP ${res.status}).` };
    }
    if (!res.body) return { ok: false, error: 'Máy chủ không trả về dữ liệu.' };

    // Canh mạng CHẾT (không có byte nào trong 90 giây), không canh mạng chậm.
    const ac = new AbortController();
    let idle: NodeJS.Timeout | null = null;
    const kick = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => ac.abort(), 90_000);
    };
    /**
     * BÁO TIẾN TRÌNH THẬT ra giao diện.
     *
     * Trước đây không có gì cả: giao diện ghim một thanh `percent={100}` nhấp nháy, nên mười giây
     * và mười phút trông y hệt nhau — người dùng chỉ còn cách đoán, và họ đoán là "treo rồi".
     *
     * `content-length` ở lượt nối tiếp (206) là số byte CÒN LẠI, không phải tổng tệp — cộng thêm
     * phần đã có thì phần trăm mới đúng, nếu không thì bấm-tải-tiếp lại hiện 0% rồi nhảy vọt.
     *
     * Chặn nhịp 200ms: mỗi mẩu dữ liệu một lần gửi IPC thì với tệp 214 MiB là hàng chục nghìn
     * lượt vẽ lại, và chính việc báo tiến trình lại làm chậm thứ nó đang báo.
     */
    const declared = Number(res.headers.get('content-length') || 0);
    const total = declared > 0 ? declared + (resuming ? have : 0) : 0;
    let received = resuming ? have : 0;
    let lastTick = 0;
    const report = (force = false) => {
      const now = Date.now();
      if (!force && now - lastTick < 200) return;
      lastTick = now;
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IPC.installerProgress, { received, total });
      }
    };

    const src = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    src.on('data', (chunk: Buffer) => {
      kick();
      received += chunk.length;
      report();
    });
    kick();
    report(true);
    try {
      await pipeline(src, createWriteStream(part, { flags: resuming ? 'a' : 'w' }), { signal: ac.signal });
    } finally {
      if (idle) clearTimeout(idle);
    }

    report(true); // chốt 100% trước khi đổi màn, để thanh không dừng lại ở 98%
    renameSync(part, file); // chỉ đổi tên khi đã ghi XONG — tệp .dmg dở dang trông y hệt tệp thật
    return finishInstall(file); // macOS: tự cài (ditto) tránh -36 rồi relaunch; hỏng thì mở cho kéo tay
  } catch (e) {
    // GIỮ tệp .part để lần bấm sau tải tiếp. Xoá nó ở đây là vứt bỏ đúng thứ vừa tải được.
    const msg =
      (e as Error)?.name === 'AbortError'
        ? 'Mạng ngừng truyền dữ liệu quá lâu. Bấm lại để tải TIẾP phần còn thiếu.'
        : netMessage(e);
    return { ok: false, error: msg };
  }
}

/**
 * Decide which renderer URL to load. `localUrl` is the bundled fallback
 * (e.g. `app://./home`). Returns the chosen URL + update metadata.
 */
export async function resolveRenderer(localUrl: string): Promise<{ url: string; info: UpdateInfo }> {
  const current = app.getVersion();
  const m = await fetchManifest();
  const info: UpdateInfo = { remote: false, reinstall: false, current };
  // Không có manifest (chưa có kênh phát hành / mất mạng) → khẳng định "không có bản vá lõi",
  // để giao diện không tự đi hỏi một manifest nào khác thay cho main.
  if (!m) return { url: localUrl, info: { ...info, mainFixPending: false } };

  info.notice = m.notice;
  info.latest = m.latestVersion;
  info.rendererVersion = m.rendererVersion;
  info.mainChangedAt = m.mainChangedAt;
  // A reinstall is only TRULY required when the pushed renderer needs a newer MAIN than
  // installed (minMain > current) — then the renderer OTA below can't load it and only a
  // fresh .dmg/.exe carries the fix. A newer latestVersion whose minMain we ALREADY satisfy
  // is a UI-only update: it's delivered silently by the renderer OTA, so DON'T nag to
  // reinstall. (Was keyed on latestVersion → every release, even UI-only, showed the banner.)
  if (m.minMain && cmp(m.minMain, current) > 0) info.reinstall = true;
  // Bản vá LÕI đang chờ: có bản mới hơn, và thay đổi lõi gần nhất nằm SAU bản đang cài. Đây là ca
  // `reinstall` không bắt được — và cũng là ca duy nhất mà "kiểm tra & tải lại bản mới nhất"
  // (code-push giao diện) KHÔNG giúp được gì.
  // `mainChangedAt` vắng mặt ở manifest cũ → lùi về latestVersion (push-renderer chỉ nâng
  // latestVersion khi có --main-change, xem versionHint.build cho lý lẽ đầy đủ).
  const mainChanged = m.mainChangedAt || m.latestVersion;
  info.mainFixPending =
    !!m.latestVersion && cmp(m.latestVersion, current) > 0 && !!mainChanged && cmp(mainChanged, current) > 0;

  // Nạp ảnh chụp cho các lượt agent NGAY TẠI ĐÂY — một điểm duy nhất phủ cả khởi động lẫn hai
  // handler IPC checkUpdate/applyUpdate (người dùng bấm "kiểm tra bản mới" là lúc dữ liệu tươi
  // nhất, phải chảy sang cả đường agent). Chiều codePush → versionHint là import TĨNH bình thường;
  // chiều ngược lại versionHint nạp ĐỘNG nên không sinh vòng import.
  try {
    primeVersionSnapshot({
      latestVersion: m.latestVersion,
      mainChangedAt: m.mainChangedAt,
      notice: m.notice,
    });
  } catch {
    /* không bao giờ để việc này làm hỏng khởi động */
  }

  // Use the pushed remote renderer only if it's HTTPS, MAIN is new enough, the remote
  // renderer is NOT OLDER than what we shipped (no stale-Pages downgrade), and it's up.
  if (m.renderer && /^https:\/\//i.test(m.renderer)) {
    const compatible = !m.minMain || cmp(current, m.minMain) >= 0;
    // Bundled renderer version == app version at build time; refuse an older remote.
    const notStale = !m.rendererVersion || cmp(m.rendererVersion, current) >= 0;
    const base = m.renderer.replace(/\/+$/, '');
    if (compatible && notStale && (await reachable(`${base}/home`, 4000))) {
      info.remote = true;
      return { url: `${base}/home`, info };
    }
  }
  return { url: localUrl, info };
}
