'use client';
import { useEffect, useState } from 'react';
import { Button, Modal, Tag, Typography, Grid } from 'antd';
import { TagOutlined, ReloadOutlined, CheckCircleFilled, DownloadOutlined } from '@ant-design/icons';
import type { DesktopUpdateInfo } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { CHANGELOG, APP_VERSION } from '../changelog';
import { V } from '../theme';
import { useUpdateStatus } from '../useUpdateStatus';

const { Text, Title } = Typography;

/**
 * Sidebar footer showing the app version; clicking opens the changelog. On desktop
 * it also surfaces code-push status (remote vs bundled + current/latest version) so
 * the user can confirm a code-push landed and see what changed.
 */
export function VersionFooter({ collapsed }: { collapsed?: boolean }) {
  const runtime = useRuntime();
  const screens = Grid.useBreakpoint();
  const [info, setInfo] = useState<DesktopUpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const { needsReinstall } = useUpdateStatus();

  useEffect(() => {
    if (!runtime.checkUpdate) return;
    let dead = false;
    runtime.checkUpdate().then((i) => !dead && setInfo(i)).catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [runtime]);

  // The RENDERER (UI) version is what actually changes on a code-push — it's compiled
  // into whichever renderer is running (bundled OR pushed), so it's the honest "what am
  // I looking at" number. `info.current` is the NATIVE/main version (only changes on a
  // reinstall). Show the UI version primarily; surface the native version separately.
  const uiVersion = APP_VERSION;
  const nativeVersion = info?.current;
  const remote = !!info?.remote;
  const hasUpdateApi = !!runtime.checkUpdate;

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        title="Phiên bản & thay đổi"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 6,
          padding: collapsed ? '8px 0' : '8px 16px',
          cursor: 'pointer',
          borderTop: `1px solid ${V.borderSub}`,
          color: V.textFaint,
          fontSize: 12,
        }}
      >
        {collapsed ? (
          <span style={{ fontSize: 10, fontWeight: 700 }}>v{uiVersion}</span>
        ) : (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TagOutlined /> phiên bản v{uiVersion}
            </span>
            {hasUpdateApi && remote && (
              <CheckCircleFilled style={{ color: '#16B98D', fontSize: 11 }} title="Đang chạy bản code-push từ xa" />
            )}
          </>
        )}
      </div>

      <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={screens.md ? 520 : '94vw'} title="Phiên bản & thay đổi">
        {hasUpdateApi && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: V.surfaceMuted }}>
            <div style={{ fontSize: 13 }}>
              Giao diện đang chạy: <strong>v{uiVersion}</strong>
              {nativeVersion ? <span style={{ color: V.textFaint }}> · bản cài (native) v{nativeVersion}</span> : ''}
              {info?.latest && nativeVersion && info.latest !== nativeVersion ? ` · mới nhất v${info.latest}` : ''}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6, color: V.textSub }}>
              Giao diện:{' '}
              {remote ? <Tag color="success">Code-push từ xa ✓</Tag> : <Tag>Bản đóng gói</Tag>}
              {remote ? ' — đã nhận bản giao diện mới nhất qua mạng.' : ' — đang dùng bản kèm theo lúc cài.'}
            </div>
            {/* `mainFixPending` là ca trước đây BỊ BỎ SÓT: có bản cài mới chứa bản vá LÕI, nhưng
                minMain giữ nguyên nên `reinstall` = false → màn này im lặng và nút duy nhất hiện ra
                là "kiểm tra & tải lại bản mới nhất", thứ chỉ làm mới GIAO DIỆN và không bao giờ
                sửa được lỗi phần lõi. */}
            {(info?.reinstall || needsReinstall) && (
              <div style={{ marginTop: 8, fontSize: 12.5 }}>
                <Tag color="warning">Có bản cài mới (v{info?.latest})</Tag> phần lõi đổi — hãy tải lại bản .dmg mới.
                {info?.notice ? <div style={{ marginTop: 4, color: V.textSub }}>{info.notice}</div> : null}
              </div>
            )}
            {info?.reinstall || needsReinstall ? (
              // MAIN changed → unsigned app can't self-update; open the download page.
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                style={{ marginTop: 10 }}
                onClick={() =>
                  runtime.openExternal
                    ? runtime.openExternal('https://toolswave.net/download')
                    : window.open('https://toolswave.net/download', '_blank')
                }
              >
                Tải bản cài mới (.dmg/.exe)
              </Button>
            ) : (
              runtime.applyUpdate && (
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={applying}
                  style={{ marginTop: 10 }}
                  onClick={async () => {
                    setApplying(true);
                    try {
                      await runtime.applyUpdate!();
                    } catch {
                      setApplying(false);
                    }
                  }}
                >
                  Kiểm tra & tải lại bản mới nhất
                </Button>
              )
            )}
          </div>
        )}

        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          {CHANGELOG.map((e) => (
            <div key={e.version} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Title level={5} style={{ margin: 0 }}>v{e.version}</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>{e.date}</Text>
                {e.version === uiVersion && <Tag color="purple" style={{ marginInlineStart: 'auto' }}>đang dùng</Tag>}
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                {e.items.map((it, i) => (
                  <li key={i} style={{ fontSize: 13, marginBottom: 2 }}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
