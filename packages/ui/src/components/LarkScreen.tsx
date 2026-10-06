'use client';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Modal, Spin, Typography } from 'antd';
import { SettingOutlined, ReadOutlined, TeamOutlined } from '@ant-design/icons';
import type { LarkConnection } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { useAccountAuth } from '../account/auth';
import { LarkConnectPanel } from './lark/LarkConnectPanel';
import { LarkGrantsPanel } from './lark/LarkGrantsPanel';
import { LarkChatShell } from './lark/LarkChatShell';
import { BasesPanel } from './lark/BasesPanel';
import { AutomationsPanel } from './lark/AutomationsPanel';
import { PluginsPanel } from './lark/PluginsPanel';
import { PluginPanelsCard } from './lark/PluginPanelsCard';
import { BotPanel } from './lark/BotPanel';
import { LarkGuideModal } from './lark/LarkGuideModal';
import { LarkWebPanel } from './lark/LarkWebPanel';

const { Title, Text } = Typography;

/**
 * The "Lark × Agents" screen (desktop only). Gates on a Lark custom-app
 * connection; once connected, shows the chat agent on the left and the
 * connection + Bases panels on the right. On web (no `runtime.larkChat`) it shows
 * a "desktop only" notice.
 */
export function LarkScreen({
  onOpenSkills,
}: { onOpenSkills?: () => void } = {}) {
  const runtime = useRuntime();
  const { user } = useAccountAuth();
  const supported = !!runtime.larkChat;
  // Gate the chat on the account scope being SET in the main process (awaited), so
  // LarkChat never lists/saves a conversation under a stale account during a login/switch.
  const [accountReady, setAccountReady] = useState(!runtime.larkSetAccount);
  const [conn, setConn] = useState<LarkConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  /** Bumped when Bases change so the chat re-loads its Base list immediately. */
  const [basesRev, setBasesRev] = useState(0);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    // Wait until the account scope is set in the main process (below), so status() reports
    // THIS account's connection — not the previous one — right after a login/switch.
    if (!accountReady) return;
    let alive = true;
    setLoading(true);
    runtime
      .larkStatus?.()
      .then((c) => {
        if (!alive) return;
        setConn(c);
        // If connected, actively re-validate in the background: an idle-too-long / rotated
        // token is DETECTED here and surfaced (reconnect banner) instead of only blowing up
        // on the next chat turn. Non-blocking — the screen already rendered from `status()`.
        if (c.connected && runtime.larkCheckConnection) {
          runtime
            .larkCheckConnection()
            .then((h) => alive && setConn(h))
            .catch(() => undefined);
        }
      })
      .catch(() => alive && setConn({ connected: false }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [runtime, supported, accountReady]);

  // 1. Set the per-account scope (AWAITED) whenever the signed-in account changes, then
  //    2. back up + pull-merge that account's Lark data. LarkChat is not rendered until
  //    the scope is set, so it can never read/save under a stale account during a switch.
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    if (!runtime.larkSetAccount) {
      runtime.larkBackupSync?.().catch(() => undefined);
      return;
    }
    setAccountReady(false);
    runtime
      .larkSetAccount(user?.id ?? null)
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        setAccountReady(true);
        runtime.larkBackupSync?.().catch(() => undefined);
      });
    return () => {
      alive = false;
    };
  }, [runtime, supported, user?.id]);

  if (!supported) {
    return (
      <Alert
        type="info"
        showIcon
        message="Lark × Agents chỉ khả dụng trên bản Desktop"
        description="Mở ứng dụng Larkwave Desktop để kết nối Lark và dùng AI (Claude/Grok/...) tuỳ chỉnh dữ liệu workspace của bạn."
      />
    );
  }

  return (
    // Fill the content area (viewport − topbar − paddings) so the chat is full-height.
    // The negative margin reclaims most of the AppShell content's bottom padding.
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 108px)', minHeight: 460, marginBottom: -44 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Lark × Agents
          </Title>
          <Text type="secondary">
            Hỏi đáp & tuỳ chỉnh dữ liệu Lark (Base, tin nhắn, tài liệu, danh bạ) bằng AI (Claude / Grok / ...) trên máy bạn.
          </Text>
        </div>
        {!loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button icon={<ReadOutlined />} onClick={() => setGuideOpen(true)}>
              Hướng dẫn
            </Button>
            {conn?.connected && (
              <>
                {/* "Chia sẻ" đứng RIÊNG ở đầu màn, không chôn trong modal Cài đặt.
                    Tính năng chia sẻ đã chạy đầu-cuối từ lâu (tạo lời mời, nhận, thu hồi, tạm
                    dừng, xem nhật ký lượt chạy), nhưng nó là panel thứ hai trong một modal cuộn
                    dọc chứa bảy panel — nên người dùng báo là "chưa làm". Một tính năng không
                    tìm thấy thì đúng bằng một tính năng không tồn tại. */}
                <Button icon={<TeamOutlined />} onClick={() => setShareOpen(true)}>
                  Chia sẻ
                </Button>
                <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
                  Cài đặt
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <LarkGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Chia sẻ có modal RIÊNG: đây là việc người dùng đi tìm có chủ đích ("cho đồng nghiệp dùng
          cùng"), không phải một tuỳ chọn họ vô tình bắt gặp khi đang chỉnh cấu hình. */}
      <Modal
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        footer={null}
        width={640}
        title="Chia sẻ Lark × Agents cho người khác"
        styles={{ body: { maxHeight: '76vh', overflowY: 'auto' } }}
      >
        <LarkGrantsPanel runtime={runtime} mode="all" />
      </Modal>

      {loading ? (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <Spin size="large" />
        </div>
      ) : !conn?.connected ? (
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* LỜI MỜI phải hiện Ở ĐÂY — trước cổng "đã kết nối".
              Người được mời thường CHƯA có app Lark của riêng họ; đó chính là lý do họ cần được
              chia sẻ. Nhưng trước đây nơi DUY NHẤT trong cả app bấm được "Kết nối" cho một lời mời
              Lark lại nằm sau cổng đó. Nghĩa là người cần nhận nhất thì không bao giờ thấy nút —
              tính năng chia sẻ có đủ máy móc ở cả hai đầu mà trên thực tế không ai dùng được.
              Phần nhận chỉ gọi accountApi, không đụng kết nối Lark cục bộ, nên chạy tốt ở đây. */}
          <LarkGrantsPanel runtime={runtime} mode="receive" />
          <LarkConnectPanel runtime={runtime} connection={conn} onChange={setConn} />
        </div>
      ) : (
        <>
          {/* Logged in but the personal token lacks Bitable permission → every Base read/write
              comes back empty with no error. Warn proactively (not just after a confusing 0-result). */}
          {conn.userBitableScopeMissing && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 10 }}
              message="Tài khoản Lark đang đăng nhập THIẾU quyền Bitable"
              description={
                'Token của bạn chưa có scope "bitable:app" nên đọc/ghi Base sẽ trả về rỗng (không báo lỗi). Cách sửa: mở Lark Developer Console → app của bạn → Permissions & Scopes → bật "bitable:app" (và các scope cần) → tạo version mới & PHÁT HÀNH (publish); rồi trong Cài đặt Lark × Agents, đăng xuất tài khoản và đăng nhập lại (QR) để token mới nhận quyền.'
              }
            />
          )}
          {/* Full-width, full-height chat — connection/Bases/Bot/Plugins live in the Settings modal. */}
          <Card
            size="small"
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            styles={{ body: { padding: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}
          >
            {accountReady ? (
              // key by account so switching users REMOUNTS the chat under the new scope
              // (fresh session list, no carried-over state).
              <LarkChatShell
                key={user?.id || '_local'}
                userName={(user?.name || '').trim().split(/\s+/).pop() || undefined}
                runtime={runtime}
                basesRev={basesRev}
                onOpenSkills={onOpenSkills}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin />
              </div>
            )}
          </Card>

          <Modal
            open={settingsOpen}
            onCancel={() => setSettingsOpen(false)}
            footer={null}
            width={580}
            title="Cài đặt Lark × Agents"
            styles={{ body: { maxHeight: '74vh', overflowY: 'auto' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LarkConnectPanel runtime={runtime} connection={conn} onChange={setConn} />
              <BasesPanel runtime={runtime} onChanged={() => setBasesRev((k) => k + 1)} />
              <AutomationsPanel runtime={runtime} />
              <LarkWebPanel runtime={runtime} />
              <BotPanel runtime={runtime} />
              <PluginsPanel runtime={runtime} />
              <PluginPanelsCard runtime={runtime} />
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
