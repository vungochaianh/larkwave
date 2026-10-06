'use client';
import { useEffect, useState } from 'react';
import { Alert, App, Button, Input, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, LinkOutlined, DisconnectOutlined, VideoCameraOutlined, ThunderboltOutlined, CopyOutlined } from '@ant-design/icons';
import type { RuntimeAdapter, LarkWebRecording } from '@larkwave/core';
import { V } from '../../theme';
import { useI18n } from '../../i18n';

const { Text, Paragraph } = Typography;

/**
 * EXPERIMENTAL — connect a Lark WEB session so the agent can READ automations/workflows
 * (via the internal web API the Open API doesn't expose). Distinct from the Open-API
 * connection + the personal-account OAuth. See larkWebSession.ts.
 */
export function LarkWebPanel({ runtime }: { runtime: RuntimeAdapter }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState<string | undefined>();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [wfEndpoint, setWfEndpoint] = useState<string | undefined>();
  const [wfUrl, setWfUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  // UI-automation recorder state
  const [recording, setRecording] = useState(false);
  const [recBusy, setRecBusy] = useState(false);
  const [rec, setRec] = useState<LarkWebRecording | null>(null);
  const [replayInfo, setReplayInfo] = useState<string | undefined>();
  const refreshStatus = () =>
    runtime.larkWebStatus?.().then((s) => {
      if (s.error === 'unavailable') return setAvailable(false);
      setConnected(!!s.connected);
      setHost(s.host);
      setWfEndpoint(s.workflowEndpoint);
    }).catch(() => undefined);
  // Hidden when the INSTALLED main process predates this feature (code-pushed renderer on an
  // old main): larkWebStatus reports error:'unavailable' → don't show a panel that can't work.
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    // NOTE: `runtime.larkWebStatus?.()` returns undefined on an OLD main process → guard it.
    if (!runtime.larkWebStatus) return;
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  // URL is OPTIONAL: with none we open the standard Lark login (www.larksuite.com). Only orgs on
  // a private/regional host (Feishu, a tenant shard) need to paste their URL to open that server.
  const connect = async (override?: string) => {
    if (!runtime.larkWebConnect) return;
    const u = (override ?? '').trim();
    if (u && !/larksuite\.com|feishu\.(cn|com)/i.test(u)) {
      message.warning(t('chat.urlMustBeLark', 'URL phải là địa chỉ Lark/Feishu (vd https://…larksuite.com/… hoặc feishu.cn).'));
      return;
    }
    setBusy(true);
    try {
      const s = await runtime.larkWebConnect(u || undefined);
      setConnected(!!s.connected);
      setHost(s.host);
      if (s.connected) message.success(t('chat.larkWebConnected', 'Đã kết nối Lark web.'));
      else message.warning(s.error || t('chat.notLoggedInYet', 'Chưa đăng nhập xong — hãy đăng nhập trong cửa sổ Lark rồi thử lại.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.cannotConnect', 'Không kết nối được.'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      await runtime.larkWebDisconnect?.();
    } catch {
      /* ignore */
    }
    setConnected(false);
    setHost(undefined);
    message.success(t('chat.larkWebDisconnected', 'Đã ngắt Lark web.'));
  };

  // ── UI-automation: học từ Lark → tạo lại ────────────────────────────────────
  const startRec = async () => {
    if (!runtime.larkWebStartRecorder) return message.warning(t('chat.needNewInstall', 'Tính năng này cần bản cài mới (.dmg).'));
    setRecBusy(true);
    try {
      const r = await runtime.larkWebStartRecorder();
      if (r?.ok) {
        setRecording(true);
        message.success(t('chat.recorderStarted', 'Đã mở cửa sổ Lark + bật ghi. Vào Base → tab "Tự động hoá" → TẠO 1 workflow bằng tay, hoàn tất + BẬT.'));
      } else {
        message.error(r?.error || t('chat.recorderFailed', 'Không bật được ghi.'));
      }
    } catch (e) {
      message.error((e as Error)?.message || t('chat.errorShort', 'Lỗi.'));
    } finally {
      setRecBusy(false);
    }
  };
  const saveRec = async () => {
    if (!runtime.larkWebGetRecording) return;
    setRecBusy(true);
    try {
      const r = await runtime.larkWebGetRecording();
      setRec(r);
      if (r?.captured) message.success(`${t('chat.capturedWfPre', 'Đã bắt được gói workflow hợp lệ')} (${r.capturedFields.join(', ')}).`);
      else message.warning(t('chat.noValidPacket', 'Chưa thấy gói hợp lệ — hãy chắc đã HOÀN TẤT + BẬT 1 workflow trong Lark, rồi bấm lại.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.errorShort', 'Lỗi.'));
    } finally {
      setRecBusy(false);
    }
  };
  const replay = async (enable: boolean) => {
    if (!runtime.larkWebReplayWorkflow) return;
    setRecBusy(true);
    setReplayInfo(undefined);
    try {
      const r = await runtime.larkWebReplayWorkflow({ enable });
      setReplayInfo(
        `✓ ${t('chat.createdWorkflow', 'Đã tạo workflow')} ${r.title ? '“' + r.title + '” ' : ''}(id ${r.workflowID})${enable ? ` + ${t('chat.enabledCaps', 'đã BẬT')}` : ` (${t('chat.disabledOpenLark', 'đang tắt — mở Lark để xem/bật')})`}.`,
      );
      message.success(t('chat.createdRealWorkflow', 'Đã tạo workflow THẬT từ gói đã học.'));
    } catch (e) {
      message.error((e as Error)?.message || t('chat.replayFailed', 'Không tạo lại được.'));
    } finally {
      setRecBusy(false);
    }
  };
  const copyRec = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rec, null, 2));
      message.success(t('chat.copiedRecording', 'Đã sao chép bản ghi (JSON) — có thể gửi lại cho dev để dựng bộ điều khiển.'));
    } catch {
      message.warning(t('chat.copyFailed', 'Không sao chép được.'));
    }
  };

  if (!runtime.larkWebConnect || !available) return null;

  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 12, padding: 14, background: V.surfaceAlt }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ExperimentOutlined style={{ color: '#E0A800' }} />
        <Text strong>{t('chat.larkWebTitle', 'Kết nối Lark web')}</Text>
        <Tag color="gold" style={{ marginInlineStart: 4 }}>{t('chat.experimental', 'Thử nghiệm')}</Tag>
        {connected && <Tag color="success">{t('chat.connected', 'Đã kết nối')}</Tag>}
      </div>
      <Paragraph type="secondary" style={{ fontSize: 12.5, marginBottom: 10 }}>
        {t('chat.webIntro1', 'Cho phép trợ lý ĐỌC & giải thích các')} <Text strong>Automation/Workflow</Text> {t('chat.webIntro2', 'của Base (tool')}{' '}
        <Text code>bitable_read_workflows</Text>){t('chat.webIntro3', ' — thứ Open API không đọc được.')} <Text strong>{t('chat.webIntro4', 'Kết nối MỘT LẦN cho cả tài khoản')}</Text>{' '}
        {t('chat.webIntro5', '— dùng được với MỌI Base trên cùng máy chủ đó (URL chỉ để mở đúng máy chủ, không phải chọn 1 base). Cookie chỉ gửi cho Lark, lưu mã hoá trên máy.')} <Text type="warning">{t('chat.webIntroWarn', 'Đây là API nội bộ của Lark, có thể thay đổi/ngừng bất kỳ lúc nào.')}</Text>
      </Paragraph>

      {connected ? (
        <>
          <Space wrap style={{ marginBottom: 10 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('chat.serverLabel', 'Máy chủ')}: <Text code>{host || '—'}</Text></Text>
            <Button size="small" onClick={() => void connect()} loading={busy} icon={<LinkOutlined />}>{t('chat.relogin', 'Đăng nhập lại')}</Button>
            <Button size="small" danger icon={<DisconnectOutlined />} onClick={() => void disconnect()}>{t('chat.disconnectShort', 'Ngắt')}</Button>
          </Space>
          {/* Workflow endpoint — sniffed automatically, or pasted manually. */}
          <div style={{ paddingTop: 10, borderTop: `1px dashed ${V.borderSub}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{t('chat.wfEndpointLabel', 'Endpoint workflow:')}</Text>
              {wfEndpoint ? (
                <Tag color="success">{t('chat.captured', 'đã bắt được ✓')}</Tag>
              ) : (
                <Tag color="warning">{t('chat.notCaptured', 'chưa — mở Automation của Base để tự bắt')}</Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginBottom: 8 }}>
              {t('chat.wfHint1', 'Bấm "Mở cửa sổ Lark" → vào một Base → mở tab')} <Text strong>{t('chat.automation', 'Tự động hoá')}</Text> {t('chat.wfHint2', '(để nó hiện danh sách) → app tự bắt đúng endpoint. Xong thì đóng cửa sổ. (Chỉ cần làm 1 lần.)')}
            </Text>
            <Space wrap>
              <Button
                size="small"
                onClick={async () => {
                  await runtime.larkWebReveal?.().catch(() => undefined);
                  message.info(t('chat.openedLarkWindow', 'Đã mở cửa sổ Lark — vào Base → tab "Tự động hoá", rồi bấm "Làm mới" ở đây.'));
                }}
              >
                {t('chat.openLarkWindowBtn', 'Mở cửa sổ Lark')}
              </Button>
              <Button size="small" onClick={() => void refreshStatus()}>{t('chat.refresh', 'Làm mới')}</Button>
            </Space>
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Input
                size="small"
                placeholder={t('chat.pasteWfUrl', '…hoặc dán URL request workflow từ Network (/space/api/bitable/.../workflow...)')}
                value={wfUrl}
                onChange={(e) => setWfUrl(e.target.value)}
              />
              <Button
                size="small"
                onClick={async () => {
                  const u = wfUrl.trim();
                  if (!/\/space\/api\/bitable\/.+\/workflow/i.test(u)) return message.warning(t('chat.urlMustContainPath', 'URL phải chứa /space/api/bitable/<base>/workflow…'));
                  try {
                    const s = await runtime.larkWebSetWorkflowUrl!(u);
                    setWfEndpoint(s.workflowEndpoint);
                    setWfUrl('');
                    message.success(t('chat.wfEndpointSaved', 'Đã lưu endpoint workflow.'));
                  } catch (e) {
                    message.error((e as Error)?.message || t('chat.invalidUrl', 'URL không hợp lệ.'));
                  }
                }}
              >
                {t('chat.save', 'Lưu')}
              </Button>
            </Space.Compact>
          </div>

          {/* UI-automation: học từ Lark → tạo lại (khắc phục 800004006 bằng cách dùng đúng gói Lark tạo) */}
          {runtime.larkWebStartRecorder && (
            <div style={{ paddingTop: 10, marginTop: 10, borderTop: `1px dashed ${V.borderSub}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <VideoCameraOutlined style={{ color: '#7A5AF8' }} />
                <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{t('chat.createWfByControl', 'Tạo workflow bằng cách điều khiển Lark')}</Text>
                <Tag color="gold">{t('chat.experimental', 'Thử nghiệm')}</Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginBottom: 8 }}>
                Schema workflow của Lark là API nội bộ (hay lỗi <Text code>800004006</Text>). Nên app <b>học từ chính Lark</b>: bạn tạo tay
                1 workflow, app bắt <b>đúng gói request hợp lệ</b> Lark gửi, rồi <b>tạo lại</b> — chuẩn 100%, không đoán.
              </Text>
              <Space wrap>
                <Button size="small" icon={<VideoCameraOutlined />} loading={recBusy} onClick={() => void startRec()}>
                  {t('chat.recStep1', '① Mở Lark & bắt đầu học')}
                </Button>
                <Button size="small" loading={recBusy} disabled={!recording} onClick={() => void saveRec()}>
                  {t('chat.recStep2', '② Lưu bản ghi')}
                </Button>
              </Space>
              {rec && (
                <div style={{ marginTop: 8, fontSize: 11.5 }}>
                  <Space wrap size={6}>
                    <Tag>{rec.uiCount} {t('chat.actionsUnit', 'thao tác')}</Tag>
                    <Tag>{rec.netCount} request</Tag>
                    {rec.captured ? <Tag color="success">{t('chat.capturedValid', 'đã bắt gói hợp lệ ✓')}</Tag> : <Tag color="warning">{t('chat.notCapturedValid', 'chưa bắt được gói hợp lệ')}</Tag>}
                    <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => void copyRec()}>
                      {t('chat.copyJson', 'Sao chép JSON')}
                    </Button>
                  </Space>
                  {rec.captured && (
                    <div style={{ marginTop: 8 }}>
                      <Space wrap>
                        <Button size="small" type="primary" icon={<ThunderboltOutlined />} loading={recBusy} onClick={() => void replay(false)}>
                          {t('chat.recStep3Preview', '③ Tạo lại (tắt — xem trước)')}
                        </Button>
                        <Button size="small" loading={recBusy} onClick={() => void replay(true)}>
                          {t('chat.recreateEnable', 'Tạo lại + Bật ngay')}
                        </Button>
                      </Space>
                    </div>
                  )}
                  {replayInfo && <Alert type="success" showIcon style={{ marginTop: 8 }} message={replayInfo} />}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div>
          <Button type="primary" loading={busy} icon={<LinkOutlined />} onClick={() => void connect()}>
            {t('chat.openLarkLogin', 'Mở cửa sổ Lark & đăng nhập')}
          </Button>
          <Button type="link" size="small" style={{ paddingInline: 8 }} onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? t('chat.hide', 'Ẩn') : t('chat.privateServer', 'Máy chủ riêng (Feishu / vùng khác)?')}
          </Button>
          {showAdvanced && (
            <Space.Compact style={{ width: '100%', marginTop: 8 }}>
              <Input
                size="small"
                placeholder={t('chat.pasteOrgUrl', 'Dán URL Lark/Feishu của tổ chức bạn (mở ĐÚNG máy chủ)…')}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPressEnter={() => void connect(url)}
              />
              <Button size="small" loading={busy} onClick={() => void connect(url)}>{t('chat.connectThisServer', 'Kết nối máy chủ này')}</Button>
            </Space.Compact>
          )}
        </div>
      )}
      {!connected && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 10 }}
          message={t('chat.whyThisStep', 'Vì sao cần bước này?')}
          description={
            <span style={{ fontSize: 12.5 }}>
              Kết nối Lark web <b>MỘT LẦN</b> để MỞ KHOÁ tính năng <b>đọc + tạo Automation/Workflow</b> (Open API không làm được).
              Bấm <b>“Mở cửa sổ Lark &amp; đăng nhập”</b> → đăng nhập bằng QR/SSO ngay trong cửa sổ Lark → cửa sổ tự ẩn, xong (không cần dán link).
              KHI CHƯA kết nối, các lệnh workflow trong hội thoại sẽ báo “cần Kết nối Lark web” và không chạy.
            </span>
          }
        />
      )}
    </div>
  );
}
