'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, List, Modal, Space, Spin, Tag, Typography } from 'antd';
import { ImportOutlined } from '@ant-design/icons';
import type { ToolswaveMigrationCategory, ToolswaveMigrationEvent, ToolswaveMigrationReport, ToolswaveMigrationStatus } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';

const { Text, Paragraph } = Typography;

/** Nhãn từng hạng mục — thứ tự hiển thị. */
const CAT_LABEL: [ToolswaveMigrationCategory, string][] = [
  ['sessions', 'Hội thoại Lark'],
  ['deleted', 'Danh sách đã xoá'],
  ['specs', 'Đặc tả'],
  ['larkConfig', 'Cài đặt Lark'],
  ['bases', 'Base đã thêm'],
  ['automations', 'Lịch tự động hoá'],
  ['relogin', 'Lịch sử đăng nhập Lark web'],
  ['workFiles', 'Tệp làm việc'],
  ['skills', 'Kỹ năng'],
  ['plugins', 'Plugin'],
];

/** Tổng số mục "sẽ/đã thêm hoặc hợp nhất" — để biết có cần tải lại giao diện không. */
export function migrationChanges(r: ToolswaveMigrationReport | null | undefined): number {
  if (!r) return 0;
  return Object.values(r.counts).reduce((n, c) => n + c.added + c.merged, 0);
}

function ReportView({ report }: { report: ToolswaveMigrationReport }) {
  const rows = CAT_LABEL.map(([k, label]) => ({ k, label, c: report.counts[k] })).filter((r) => r.c && r.c.added + r.c.merged + r.c.unchanged > 0);
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={10}>
      {report.dryRun && <Alert type="info" showIcon message="Chạy thử — chưa ghi gì. Đây là những gì sẽ được nhập." />}
      {rows.length ? (
        <List
          size="small"
          bordered
          dataSource={rows}
          renderItem={(r) => (
            <List.Item>
              <Text>{r.label}</Text>
              <Space size={4}>
                {r.c.added > 0 && <Tag color="green">{report.dryRun ? 'sẽ thêm' : 'thêm'} {r.c.added}</Tag>}
                {r.c.merged > 0 && <Tag color="blue">{report.dryRun ? 'sẽ hợp nhất' : 'hợp nhất'} {r.c.merged}</Tag>}
                {r.c.unchanged > 0 && <Tag>đã có {r.c.unchanged}</Tag>}
              </Space>
            </List.Item>
          )}
        />
      ) : (
        <Text type="secondary">Không có gì mới để nhập.</Text>
      )}
      {report.skipped.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer' }}>
            <Text type="secondary">Bỏ qua {report.skipped.length} mục (vì sao)</Text>
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
            {report.skipped.map((s, i) => (
              <li key={i}>
                <Text code style={{ fontSize: 11.5 }}>{s.path}</Text> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.droppedSecretFields > 0 && (
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          Đã bỏ {report.droppedSecretFields} trường trông như bí mật khỏi tệp cấu hình (không chép khoá/mật khẩu).
        </Text>
      )}
      <Alert
        type="warning"
        showIcon
        message="Còn 2 việc bạn cần làm"
        description={
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {report.followUps.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        }
      />
    </Space>
  );
}

/**
 * Lắng nghe việc nhập TỰ ĐỘNG (lần đăng nhập đầu) và hiện tiến độ + kết quả. Gắn một lần trong
 * AccountAuthProvider. Không có gì trên web (runtime không có kênh này).
 */
export function ToolswaveImportWatcher() {
  const runtime = useRuntime();
  const [ev, setEv] = useState<ToolswaveMigrationEvent | null>(null);
  useEffect(() => {
    if (!runtime.onToolswaveMigrationEvent) return;
    return runtime.onToolswaveMigrationEvent((e) => {
      // Chỉ bật hộp thoại cho lần chạy TỰ ĐỘNG; nút trong Cài đặt tự hiện kết quả của nó.
      if (e.auto) setEv(e);
    });
  }, [runtime]);
  if (!ev) return null;
  const close = () => {
    const changed = ev.phase === 'done' && !ev.report.dryRun && migrationChanges(ev.report) > 0;
    setEv(null);
    // Danh sách hội thoại/kỹ năng đã đọc trước khi nhập — tải lại để thấy dữ liệu mới.
    if (changed && typeof window !== 'undefined') window.location.reload();
  };
  return (
    <Modal
      open
      title={<Space><ImportOutlined /> Nhập dữ liệu từ app Toolswave</Space>}
      onCancel={ev.phase === 'start' ? undefined : close}
      closable={ev.phase !== 'start'}
      maskClosable={false}
      footer={ev.phase === 'start' ? null : <Button type="primary" onClick={close}>Xong</Button>}
    >
      {ev.phase === 'start' && (
        <Space direction="vertical" style={{ width: '100%', alignItems: 'center', padding: 16 }}>
          <Spin />
          <Text>Đang chép hội thoại, Đặc tả, kỹ năng… từ app Toolswave (chỉ đọc, không đổi gì bên đó).</Text>
        </Space>
      )}
      {ev.phase === 'done' && <ReportView report={ev.report} />}
      {ev.phase === 'error' && <Alert type="error" showIcon message="Chưa nhập được" description={ev.message} />}
    </Modal>
  );
}

/** Thẻ trong Cài đặt: trạng thái + "Chạy thử" + "Nhập lại dữ liệu từ Toolswave". */
export function ToolswaveImportCard({ style }: { style?: React.CSSProperties }) {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const [st, setSt] = useState<ToolswaveMigrationStatus | null>(null);
  const [busy, setBusy] = useState<false | 'dry' | 'run'>(false);
  const [report, setReport] = useState<ToolswaveMigrationReport | null>(null);
  const load = useCallback(async () => {
    if (!runtime.toolswaveMigrationStatus) return;
    setSt(await runtime.toolswaveMigrationStatus().catch(() => null));
  }, [runtime]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!runtime.toolswaveMigrate || !st) return null;
  const go = async (dryRun: boolean) => {
    setBusy(dryRun ? 'dry' : 'run');
    try {
      setReport(await runtime.toolswaveMigrate!({ dryRun }));
      await load();
    } catch (e) {
      message.error((e as Error).message || 'Chưa nhập được.');
    } finally {
      setBusy(false);
    }
  };
  const closeReport = () => {
    const changed = !!report && !report.dryRun && migrationChanges(report) > 0;
    setReport(null);
    if (changed && typeof window !== 'undefined') window.location.reload();
  };
  return (
    <Card size="small" style={style} title={<Space><ImportOutlined /> Dữ liệu từ app Toolswave</Space>}>
      <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12.5 }}>
        Larkwave dùng chung tài khoản Toolswave. Nút dưới chép (không di chuyển, không xoá) hội thoại Lark, Đặc tả,
        Base, lịch tự động hoá, kỹ năng và plugin của app desktop Toolswave trên máy này vào Larkwave. Dữ liệu
        đã mã hoá (App Secret, phiên Lark web, token) không chép.
      </Paragraph>
      {!st.found ? (
        <Text type="secondary">Không thấy dữ liệu của app desktop Toolswave trên máy này.</Text>
      ) : !st.userId ? (
        <Text type="secondary">Đăng nhập trước để nhập đúng dữ liệu của tài khoản.</Text>
      ) : (
        <Space wrap>
          <Button onClick={() => go(true)} loading={busy === 'dry'} disabled={!!busy}>
            Chạy thử
          </Button>
          <Button type="primary" onClick={() => go(false)} loading={busy === 'run'} disabled={!!busy}>
            Nhập lại dữ liệu từ Toolswave
          </Button>
          {st.last && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Lần nhập trước: {new Date(st.last.at).toLocaleString('vi-VN')}
            </Text>
          )}
        </Space>
      )}
      <Modal open={!!report} title="Kết quả nhập dữ liệu" onCancel={closeReport} footer={<Button type="primary" onClick={closeReport}>Xong</Button>}>
        {report && <ReportView report={report} />}
      </Modal>
    </Card>
  );
}
