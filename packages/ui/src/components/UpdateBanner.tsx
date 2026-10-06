'use client';
import { useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Progress, Space, Grid } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { DesktopUpdateInfo } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { APP_VERSION } from '../changelog';

/** Where the new installer lives (OS-detecting download page). */
const DOWNLOAD_URL = 'https://toolswave.net/download';

/** a > b for dotted numeric versions (renderer-side; main has its own cmp). */
function verGt(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/**
 * Surfaces desktop code-push status. The renderer auto-loads the latest pushed build on
 * launch, so this mostly: (1) when the MAIN/full version changed, the app CAN'T self-update
 * (unsigned → no electron-updater) so it points the user to DOWNLOAD + reinstall the new
 * .dmg/.exe; (2) shows a release notice + lets the user re-pull the renderer when it's only
 * a UI update. Dismissal is remembered per-version so it doesn't nag every launch.
 */
/** MB một chữ số thập phân — đủ để thấy nó ĐANG NHÍCH, mà không nhảy loạn mỗi lần vẽ lại. */
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
/** Thời gian còn lại nói bằng tiếng người: "12 giây", "2 phút". */
const eta = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} giây` : `${Math.round(s / 60)} phút`);

export function UpdateBanner() {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const [info, setInfo] = useState<DesktopUpdateInfo | null>(null);
  const [applying, setApplying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [dlPhase, setDlPhase] = useState<'downloading' | 'done'>('done');
  /** Tiến trình tải THẬT, do tiến trình chính bắn sang. `total = 0` nghĩa là chưa biết tổng. */
  const [dl, setDl] = useState<{ received: number; total: number; bps: number; etaSec: number } | null>(null);

  /**
   * Nghe tiến trình tải. Đăng ký MỘT LẦN lúc dựng, không phải lúc bấm tải: người dùng bấm "Ẩn"
   * rồi mở lại thì cửa sổ được dựng lại — đăng ký theo lần bấm thì lần mở lại sẽ im lặng, đúng
   * lúc họ quay lại để xem đã tới đâu.
   */
  useEffect(() => {
    if (!runtime.onInstallerProgress) return;
    // Tốc độ đo trên CỬA SỔ TRƯỢT ~3 giây, không phải trung bình từ đầu: trung bình từ đầu bị
    // đoạn khởi động chậm kéo xuống và mãi không lên, nên con số hiện ra không giống thứ người
    // dùng đang cảm nhận.
    let marks: { t: number; n: number }[] = [];
    return runtime.onInstallerProgress((p) => {
      const now = Date.now();
      marks.push({ t: now, n: p.received });
      marks = marks.filter((m) => now - m.t <= 3000);
      const first = marks[0];
      const bps = first && now > first.t ? ((p.received - first.n) * 1000) / (now - first.t) : 0;
      const left = p.total > 0 ? Math.max(0, p.total - p.received) : 0;
      setDl({ received: p.received, total: p.total, bps, etaSec: bps > 0 && left > 0 ? left / bps : 0 });
    });
  }, [runtime]);
  const [autoQuit, setAutoQuit] = useState<number | null>(null); // seconds left before self-quit
  const [dismissed, setDismissed] = useState(false);

  // Hard-exit via main (destroys every window incl. hidden Lark/OAuth ones, then app.exit(0)).
  // window.close() alone leaves the process running when a hidden window is open → "in use" on install.
  const hardQuit = () => {
    if (runtime.quitApp) void runtime.quitApp();
    else {
      try {
        window.close();
      } catch {
        /* fall back to Cmd+Q */
      }
    }
  };

  // Once the installer is downloaded + opened, auto-quit after a short countdown so the user
  // doesn't have to click "Thoát app" — closing the last window quits the app (window-all-closed
  // → app.quit()), freeing the bundle in /Applications for the drag-replace.
  useEffect(() => {
    if (dlPhase !== 'done' || !installOpen) {
      setAutoQuit(null);
      return;
    }
    setAutoQuit(4);
    const id = setInterval(() => {
      setAutoQuit((n) => {
        if (n === null) return null; // cancelled ("Để tôi tự làm")
        if (n <= 1) {
          clearInterval(id);
          hardQuit();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [dlPhase, installOpen]);

  useEffect(() => {
    if (!runtime.checkUpdate) return;
    let dead = false;
    runtime
      .checkUpdate()
      .then((i) => {
        if (dead) return;
        setInfo(i);
        // Remember a dismissal per latest-version so the reinstall banner (which the user
        // can only act on by downloading) doesn't reappear on every launch once seen.
        try {
          if (i.latest && typeof window !== 'undefined' && localStorage.getItem('tw_update_dismissed') === i.latest) {
            setDismissed(true);
          }
        } catch {
          /* no localStorage */
        }
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [runtime]);

  // `reinstall` already means the INSTALLED core (main) is older than the manifest's minMain
  // — i.e. a real .dmg install is genuinely needed. It's minMain-gated, so renderer-only
  // pushes (minMain unchanged) never set it. Do NOT further suppress by comparing the renderer
  // version to latestVersion: the code-pushed renderer is often AHEAD of the installer version
  // (e.g. renderer 1.0.51 vs installer 1.0.50), which used to wrongly hide this banner.
  const showReinstall = !!info?.reinstall;
  // SOFT nudge: a newer full installer exists (latestVersion advances ONLY on real .dmg
  // releases, never UI-only pushes) but the installed core still satisfies minMain — so the
  // app works, yet the user is missing the newest core features (e.g. edit skill content).
  // Non-blocking + dismissible, unlike the minMain-gated hard reinstall.
  const updateAvailable = !showReinstall && verGt(info?.latest, info?.current);
  const showDownload = showReinstall || updateAvailable;
  // A code-pushed renderer NEWER than the one currently running → a "Tải lại bản mới" is worth
  // offering. Once the running renderer (APP_VERSION) already matches the manifest's advertised
  // rendererVersion there is nothing to pull, so a lingering `notice` must NOT keep the banner up
  // (the old bug: the notice alone kept showing "Cập nhật" forever, even after reloading).
  const rendererUpdate = verGt(info?.rendererVersion, APP_VERSION);

  if (dismissed || !info || (!showDownload && !rendererUpdate)) return null;

  const onClose = () => {
    setDismissed(true);
    try {
      if (info.latest && typeof window !== 'undefined') localStorage.setItem('tw_update_dismissed', info.latest);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
    <Alert
      type={showReinstall ? 'warning' : 'info'}
      showIcon
      style={{ marginBottom: 16 }}
      message={
        showReinstall
          ? `Cần cập nhật PHẦN LÕI${info.latest ? ` (v${info.latest})` : ''}`
          : updateAvailable
            ? `Đã có bản cài mới${info.latest ? ` (v${info.latest})` : ''}`
            : 'Cập nhật'
      }
      description={
        info.notice ||
        (showReinstall
          ? `Giao diện đã là bản mới nhất (v${APP_VERSION}) nhờ cập nhật ngầm — nhưng PHẦN LÕI (bản cài) trên máy${
              info.current ? ` còn v${info.current}` : ' còn cũ'
            }, lần này lõi có thay đổi nên cần cài lại. Bấm “Tải & mở bộ cài” bên dưới: app TỰ TẢI đúng bản + mở sẵn bộ cài, bạn chỉ cần cài đè (kéo vào Applications trên Mac). Các bản chỉ đổi giao diện vẫn tự cập nhật ngầm — chỉ khi ĐỔI phần lõi mới nhắc cài lại như lần này.`
          : updateAvailable
            ? `Giao diện đã tự cập nhật (v${APP_VERSION}), nhưng PHẦN LÕI (bản cài) trên máy${
                info.current ? ` còn v${info.current}` : ' còn cũ'
              } — một số tính năng mới nằm ở phần lõi (vd sửa nội dung Kỹ năng) cần cài lại .dmg mới có. KHÔNG bắt buộc: bấm “Tải & mở bộ cài”, app tự tải + mở sẵn bộ cài, bạn chỉ cần kéo vào Applications (Mac). Có thể tạm ẩn thông báo này.`
            : undefined)
      }
      action={
        showDownload ? (
          // MAIN changed → the app can't self-update. Offer a one-click "download + open
          // installer" (unsigned, so the user still confirms the install) + a link to the page.
          <Space>
            {runtime.downloadInstaller && (
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                loading={downloading}
                onClick={async () => {
                  // Open the modal immediately in "downloading" mode so there's a visible
                  // progress surface (a tiny button spinner isn't enough).
                  //
                  // TRẦN THỜI GIAN: 300 giây cũ được đặt khi bộ cài ~100 MB. Bộ cài nay là ~214 MiB
                  // (bản universal gộp x64+arm64), nên đường truyền 2 Mbps cần 15 PHÚT — tức là
                  // trần cũ hỏng LUÔN LUÔN chứ không phải thỉnh thoảng, và người dùng thấy
                  // "quá thời gian" ngay cả khi mạng vẫn chạy tốt.
                  //
                  // Trần ở đây chỉ để một kết nối CHẾT không quay mãi. Việc canh mạng chết đã
                  // chuyển về tiến trình chính (ngưng nhận dữ liệu 90 giây thì dừng), nên ở đây
                  // để rộng hẳn — và bản lõi mới còn tải TIẾP được nên bấm lại không mất công cũ.
                  setDlPhase('downloading');
                  setInstallOpen(true);
                  setDownloading(true);
                  try {
                    const r = await Promise.race([
                      runtime.downloadInstaller!(),
                      new Promise<{ ok: boolean; error?: string }>((_, rej) =>
                        setTimeout(() => rej(new Error('__timeout__')), 1_800_000),
                      ),
                    ]);
                    if (r.ok) {
                      setDlPhase('done'); // guide: quit → drag → replace → reopen
                    } else {
                      setInstallOpen(false);
                      message.error(r.error || 'Tải không được — thử "Trang tải".');
                    }
                  } catch (e) {
                    setInstallOpen(false);
                    message.error(
                      (e as Error).message === '__timeout__'
                        ? 'Tải bộ cài quá lâu (trên 30 phút). Bấm lại để tải tiếp, hoặc dùng "Trang tải".'
                        : (e as Error).message,
                    );
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                Tải &amp; mở bộ cài
              </Button>
            )}
            <Button
              size="small"
              onClick={() => (runtime.openExternal ? runtime.openExternal(DOWNLOAD_URL) : window.open(DOWNLOAD_URL, '_blank'))}
            >
              Trang tải
            </Button>
          </Space>
        ) : runtime.applyUpdate ? (
          // UI-only update → re-pull the pushed renderer in place.
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={applying}
            onClick={async () => {
              setApplying(true);
              try {
                await runtime.applyUpdate!();
              } catch {
                setApplying(false);
              }
            }}
          >
            Tải lại bản mới
          </Button>
        ) : undefined
      }
      closable
      onClose={onClose}
    />
    <Modal
      open={installOpen}
      width={screens.md ? 520 : '94vw'}
      title={dlPhase === 'downloading' ? 'Đang tải bản mới…' : 'Cài bản mới (cập nhật lõi)'}
      onCancel={() => setInstallOpen(false)}
      maskClosable={dlPhase !== 'downloading'}
      footer={
        dlPhase === 'downloading'
          ? [
              <Button key="hide" onClick={() => setInstallOpen(false)}>
                Ẩn (vẫn tải tiếp)
              </Button>,
            ]
          : [
              <Button key="self" onClick={() => { setAutoQuit(null); setInstallOpen(false); }}>
                Để tôi tự làm (không tự thoát)
              </Button>,
              <Button key="quit" type="primary" onClick={hardQuit}>
                {autoQuit !== null ? `Thoát ngay (${autoQuit}s)` : 'Thoát app để cài'}
              </Button>,
            ]
      }
    >
      {dlPhase === 'downloading' ? (
        <>
          {/* Phần trăm THẬT khi biết tổng; chưa biết thì mới quay vô định — chứ không ghim 100%
              rồi nhấp nháy, vì thanh đó trông như sắp xong trong lúc mới tải được một phần mười. */}
          <Progress
            percent={dl && dl.total > 0 ? Math.min(99, Math.floor((dl.received / dl.total) * 100)) : 100}
            status="active"
            showInfo={!!(dl && dl.total > 0)}
          />
          <p style={{ margin: '10px 0 0' }}>
            {dl && dl.total > 0 ? (
              <>
                Đã tải <b>{mb(dl.received)}</b> / {mb(dl.total)}
                {dl.bps > 0 ? <> · {mb(dl.bps)}/giây{dl.etaSec > 0 ? <> · còn khoảng {eta(dl.etaSec)}</> : null}</> : null}
              </>
            ) : (
              <>Đang nối tới máy chủ…</>
            )}
            <br />
            Cửa sổ này sẽ chuyển sang hướng dẫn cài khi tải xong. Bạn có thể bấm <b>“Ẩn”</b> để làm việc khác trong
            lúc chờ.
          </p>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>✓ Đã tải xong — bộ cài (cửa sổ Larkwave…dmg) đang mở.</p>
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
            {autoQuit !== null
              ? `App sẽ TỰ THOÁT sau ${autoQuit}s để bạn kéo-thả cài đè (bấm “Để tôi tự làm” nếu muốn tự thoát sau).`
              : 'App đang chạy nên chưa ghi đè được — cần THOÁT app này trước.'}
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>
              Đợi app tự thoát (hoặc bấm <b>“Thoát ngay”</b> / <b>Cmd+Q</b>).
            </li>
            <li>
              Trong cửa sổ vừa mở, <b>kéo Larkwave vào Applications</b> → chọn <b>Thay thế/Replace</b>.
            </li>
            <li>
              Mở lại Larkwave. Lần đầu nếu macOS hỏi (chưa ký số): <b>chuột phải → Mở</b>.
            </li>
          </ol>
        </>
      )}
    </Modal>
    </>
  );
}
