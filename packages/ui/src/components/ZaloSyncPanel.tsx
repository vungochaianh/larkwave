'use client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Collapse, Popconfirm, Select, Space, Switch, Tag, Typography } from 'antd';
import { CloudDownloadOutlined, DeleteOutlined, EyeInvisibleOutlined, GlobalOutlined, ReloadOutlined } from '@ant-design/icons';
import type { RuntimeAdapter, ZaloSyncStatus, ZaloWebStatus } from '@larkwave/core';
import { useI18n } from '../i18n';
import { OK, V } from '../theme';
import { openFix } from './fix/fixRules';

const { Text, Paragraph } = Typography;

const day = (ts?: number) => (ts ? new Date(ts).toLocaleDateString('vi-VN') : '');
const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/**
 * Cài đặt → "Đồng bộ tin Zalo". Hai đường lấy tin cũ: (1) máy chủ Zalo (không cần điện thoại), (2) CỬA SỔ ZALO
 * WEB nhúng — người dùng mở, (nếu được hỏi) bấm Đồng ý đồng bộ trên điện thoại, trợ lý đọc nội dung đang hiển
 * thị. Cộng cài đặt lưu tin trên máy + hỏi đáp. Lõi < 0.1.7 không có các thao tác này ⇒ báo cần cài bản mới.
 */
export function ZaloSyncPanel({ runtime, embedded }: { runtime: RuntimeAdapter; embedded?: boolean }) {
  const { t } = useI18n();
  const { message } = AntApp.useApp();
  const call = runtime.connectorsCall?.bind(runtime);
  const [st, setSt] = useState<ZaloSyncStatus | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!call) return null;
    try {
      const s = (await call('zaloSyncStatus')) as ZaloSyncStatus;
      setSt(s);
      setUnsupported(false);
      return s;
    } catch (e) {
      if (/không hợp lệ/i.test(String((e as Error)?.message))) setUnsupported(true);
      return null;
    }
  }, [call]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cửa sổ Web đang mở → nhịp hỏi lại trạng thái (đăng nhập xong thì nút đổi).
  const webExists = !!st?.web.exists;
  useEffect(() => {
    if (!webExists) return;
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [webExists, refresh]);

  if (!call) return null;

  const run = async (key: string, fn: () => Promise<unknown>, ok?: (r: unknown) => string | undefined) => {
    setBusy(key);
    try {
      const r = await fn();
      const msg = ok?.(r);
      if (msg) message.success(msg);
      await refresh();
    } catch (e) {
      message.error(String((e as Error)?.message || e).slice(0, 300));
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = (patch: Partial<ZaloSyncStatus['settings']>) => run('settings', () => call('zaloSyncSettings', patch));

  if (unsupported) {
    return (
      <Alert
        type="info"
        showIcon
        message={t('zsync.needUpdate', 'Đồng bộ tin Zalo cần Larkwave 0.1.7 trở lên')}
        description={t('zsync.needUpdateDesc', 'Bản cài trên máy chưa có phần này. Tải bản mới ở toolswave.net/larkwave rồi cài đè.')}
      />
    );
  }

  const accounts = st?.accounts ?? [];
  const ready = accounts.some((a) => a.status === 'ready');
  const settings = st?.settings;
  const web = st?.web;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!embedded && (
        <Paragraph type="secondary" style={{ margin: 0, fontSize: 12.5 }}>
          {t('zsync.lead2', 'Đăng nhập Zalo MỘT LẦN bằng cửa sổ Zalo Web bên dưới (quét QR trong cửa sổ). Một đăng nhập đó dùng cho cả ĐỌC lịch sử lẫn GỬI tin. Trợ lý chỉ đọc được tin Larkwave đang có.')}
        </Paragraph>
      )}

      {/* Sổ tin theo tài khoản */}
      {accounts.length === 0 ? (
        <Alert
          type="warning"
          showIcon
          message={t('zsync.noAccount', 'Chưa kết nối Zalo')}
          action={
            <Button size="small" type="primary" onClick={() => openFix('zalo', t('zsync.connectReason', 'Kết nối Zalo để đồng bộ tin nhắn'))}>
              {t('zsync.connect', 'Quét QR Zalo')}
            </Button>
          }
        />
      ) : (
        accounts.map((a) => (
          <div key={a.accountId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text strong>{a.label}</Text>
            <Tag color={a.status === 'ready' ? 'green' : 'default'}>{a.status === 'ready' ? t('zsync.ready', 'đã đăng nhập') : t('zsync.notHere', 'chưa đăng nhập ở đây')}</Tag>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {a.messages
                ? `${a.threads} ${t('zsync.threads', 'hội thoại')} · ${a.messages.toLocaleString('vi-VN')} ${t('zsync.msgs', 'tin')}${a.oldestTs ? ` · ${t('zsync.oldest', 'cũ nhất')} ${day(a.oldestTs)}` : ''}${a.storedBytes ? ` · ${t('zsync.stored', 'đã lưu')} ${mb(a.storedBytes)}` : ''}`
                : t('zsync.empty', 'chưa có tin nào trong sổ')}
            </Text>
          </div>
        ))
      )}

      {/* Cửa sổ Zalo Web */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: `1px solid ${V.borderSub}`, borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <GlobalOutlined style={{ color: OK }} />
          <Text strong>{t('zsync.web', 'Cửa sổ Zalo Web')}</Text>
          {web?.exists && <Tag color={web.loggedIn ? 'green' : 'orange'}>{web.loggedIn ? t('zsync.webIn', 'đã đăng nhập') : t('zsync.webOut', 'chưa đăng nhập')}</Tag>}
          {web?.exists && !web.visible && <Tag>{t('zsync.webHidden', 'đang ẩn')}</Tag>}
        </div>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {t('zsync.webDesc2', 'Mở trang Zalo chính thức ngay trong Larkwave. ĐĂNG NHẬP RIÊNG trong cửa sổ này (quét QR trong cửa sổ), rồi mở đúng hội thoại, bấm Đồng ý đồng bộ trên điện thoại nếu được hỏi — Larkwave đọc được lịch sử hiển thị ở đó (kể cả chat 1-1 cũ). Giữ cửa sổ mở trong lúc dùng.')}
        </Text>
        <Space wrap>
          {!web?.exists || !web.visible ? (
            <Button type="primary" icon={<GlobalOutlined />} disabled={!ready} loading={busy === 'webOpen'} onClick={() => run('webOpen', () => call('zaloWebOpen', { show: true }))}>
              {t('zsync.webOpen', 'Mở cửa sổ Zalo Web')}
            </Button>
          ) : (
            <Button icon={<EyeInvisibleOutlined />} loading={busy === 'webHide'} onClick={() => run('webHide', () => call('zaloWebHide'))}>
              {t('zsync.webHideBtn', 'Ẩn cửa sổ')}
            </Button>
          )}
          {web?.exists && (
            <>
              <Button icon={<ReloadOutlined />} loading={busy === 'webReload'} onClick={() => run('webReload', () => call('zaloWebReload'))}>
                {t('zsync.webReload', 'Tải lại')}
              </Button>
              <Popconfirm
                title={t('zsync.webCloseTitle', 'Đóng cửa sổ Zalo Web?')}
                okText={t('zsync.webCloseOk', 'Đóng')}
                cancelText={t('zsync.cancel', 'Thôi')}
                onConfirm={() => run('webClose', () => call('zaloWebClose'))}
              >
                <Button size="small" type="text" danger loading={busy === 'webClose'}>
                  {t('zsync.webClose', 'Đóng hẳn')}
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
        {web?.exists && !web.loggedIn && (
          <Alert type="info" showIcon style={{ fontSize: 12.5 }} message={t('zsync.webLoginHint', 'Cửa sổ đang ở trang đăng nhập — quét QR / đăng nhập ngay trong cửa sổ đó. Nếu điện thoại hỏi "đồng bộ tin nhắn", bấm Đồng ý để có lịch sử cũ.')} />
        )}
        {web?.loggedIn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Alert
              type="success"
              showIcon
              style={{ fontSize: 12 }}
              message={t('zsync.unified', 'Đây là nơi đăng nhập Zalo DUY NHẤT. Larkwave dùng chung phiên này cho cả đọc lịch sử (cửa sổ) lẫn gửi tin / lấy nhóm từ máy chủ — không phải quét QR ở thanh bên nữa. Giữ cửa sổ này mở trong lúc dùng.')}
            />
            <Space wrap>
              <Button size="small" icon={<GlobalOutlined />} loading={busy === 'adopt'} onClick={() => run('adopt', () => call('zaloWebAdopt'), (r) => (r as { note?: string })?.note)}>
                {ready ? t('zsync.adoptAgain', 'Gộp lại phiên để gửi tin') : t('zsync.adopt', 'Bật gửi tin bằng phiên này')}
              </Button>
              {ready && <Tag color="green">{t('zsync.sendReady', 'gửi tin: sẵn sàng')}</Tag>}
            </Space>
          </div>
        )}
        <Alert
          type="info"
          showIcon
          style={{ fontSize: 11.5 }}
          message={t('zsync.oneSession2', 'Lưu ý: Zalo chỉ cho một phiên web một lúc. Hãy đăng nhập Zalo Ở ĐÂY (trong cửa sổ). Nếu bạn còn bấm "Kết nối Zalo (quét QR)" ở Kỹ năng hay mở chat.zalo.me nơi khác, phiên sẽ bị đẩy qua đẩy lại.')}
        />
      </div>

      {/* Lấy từ máy chủ — phụ: chỉ chạy khi phiên đã sẵn sàng (gộp từ cửa sổ Web, hoặc kết nối QR) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Space wrap>
          <Button size="small" icon={<CloudDownloadOutlined />} disabled={!ready} loading={busy === 'server'} onClick={() => run('server', () => call('zaloHistoryFetch'), (r) => (r as { note?: string })?.note)}>
            {t('zsync.server', 'Lấy thêm tin cũ từ máy chủ')}
          </Button>
          {!ready && <Text type="secondary" style={{ fontSize: 11.5 }}>{t('zsync.serverNeedLogin', '(bật sau khi bạn đăng nhập trong cửa sổ Zalo Web)')}</Text>}
        </Space>
        {ready && <Text type="secondary" style={{ fontSize: 11.5 }}>{t('zsync.serverHint', 'Lấy lịch sử NHÓM từ máy chủ Zalo. (Chat 1-1 cũ thường chỉ có qua cửa sổ Web.)')}</Text>}
      </div>

      {/* Cài đặt lưu tin */}
      {settings && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: `1px solid ${V.borderSub}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={settings.persist && !!st?.persistAvailable} disabled={!st?.persistAvailable} loading={busy === 'settings'} onChange={(on) => void saveSettings({ persist: on })} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{t('zsync.persist', 'Lưu tin trên máy (mã hoá)')}</div>
              <div style={{ fontSize: 12, color: V.textSub }}>
                {st?.persistAvailable
                  ? t('zsync.persistDesc', 'Tắt app mở lại vẫn còn tin đã đồng bộ. Tệp được mã hoá bằng kho khoá của máy, chỉ nằm trên máy này. Tắt = chỉ giữ trong lúc app mở.')
                  : t('zsync.persistNA', 'Máy này không có kho khoá để mã hoá — Larkwave không lưu tin nhắn dạng thường, tin chỉ giữ trong lúc app mở.')}
              </div>
            </div>
          </div>
          {settings.persist && st?.persistAvailable && (
            <Space wrap>
              <span style={{ fontSize: 12.5, color: V.textSub }}>{t('zsync.keep', 'Giữ tin')}</span>
              <Select
                size="small"
                style={{ width: 150 }}
                value={settings.retentionDays}
                onChange={(v) => void saveSettings({ retentionDays: v })}
                options={[0, 30, 90, 180, 365, 730].map((d) => ({ value: d, label: d ? `${d} ${t('zsync.days', 'ngày')}` : t('zsync.forever', 'tới khi tôi xoá') }))}
              />
              <span style={{ fontSize: 12.5, color: V.textSub }}>{t('zsync.perThread', 'Tối đa mỗi hội thoại')}</span>
              <Select
                size="small"
                style={{ width: 130 }}
                value={settings.perThread}
                onChange={(v) => void saveSettings({ perThread: v })}
                options={[1000, 5000, 20000].map((n) => ({ value: n, label: `${n.toLocaleString('vi-VN')} ${t('zsync.msgs', 'tin')}` }))}
              />
            </Space>
          )}
          <Space wrap>
            <Popconfirm
              title={t('zsync.clearTitle', 'Xoá mọi tin Zalo Larkwave đang giữ?')}
              description={t('zsync.clearDesc', 'Chỉ xoá bản trên máy này — tin trên Zalo không bị ảnh hưởng.')}
              okText={t('zsync.clearOk', 'Xoá')}
              cancelText={t('zsync.cancel', 'Thôi')}
              onConfirm={() => run('clear', () => call('zaloStoreClear'), () => t('zsync.cleared', 'Đã xoá tin đã lưu'))}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={busy === 'clear'} disabled={!accounts.some((a) => a.messages || a.storedBytes)}>
                {t('zsync.clear', 'Xoá tin đã lưu')}
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <ZaloSyncFaq />
    </div>
  );
}

/** Hỏi đáp ngay trong Cài đặt. */
export function ZaloSyncFaq() {
  const { t } = useI18n();
  const qa: [string, string, string][] = [
    ['few', t('zsync.q1', 'Vì sao trợ lý chỉ đọc được vài tin Zalo?'), t('zsync.a1', 'Larkwave đăng nhập Zalo như một thiết bị "Web". Thiết bị mới chỉ thấy tin đến từ lúc kết nối, cộng một ít tin gần đây máy chủ Zalo còn giữ. Lịch sử đầy đủ (nhất là chat 1-1) nằm trên điện thoại của bạn.')],
    ['server', t('zsync.q2', '"Lấy thêm tin cũ từ máy chủ" lấy được gì?'), t('zsync.a2', 'Lấy thêm những gì Zalo còn lưu trên máy chủ — nhóm thường được khá nhiều, chat 1-1 thường ít. Không cần điện thoại, bấm là chạy. Cần cũ hơn nữa thì dùng cửa sổ Zalo Web.')],
    ['web', t('zsync.q3', 'Cửa sổ Zalo Web dùng thế nào?'), t('zsync.a3b', 'Bấm "Mở cửa sổ Zalo Web" — nó mở trang Zalo chính thức. Lần đầu bạn QUÉT QR NGAY TRONG CỬA SỔ đó (đây là lần đăng nhập riêng của cửa sổ). Mở đúng hội thoại cần xem; nếu điện thoại hiện thông báo "đồng bộ tin nhắn", bấm Đồng ý trên điện thoại. Khi tin đã hiện trong cửa sổ, nhờ trợ lý đọc ("đọc hội thoại Zalo đang mở giúp tôi"). Giữ cửa sổ này mở trong lúc dùng.')],
    ['safe', t('zsync.q4', 'Có an toàn không? Tin lưu ở đâu?'), t('zsync.a4', 'Cửa sổ Zalo Web là trang Zalo chính thức chạy trên máy bạn, dùng phiên của bạn — Larkwave không tự gửi tin nhắn đi đâu. Chỉ khi bạn nhờ trợ lý đọc/tìm, phần tin đó mới được gửi cho mô hình AI đang chạy lượt đó (Claude, Gemini…; dùng gói Larkwave thì đi qua máy chủ Toolswave). Bật "Lưu tin trên máy" thì sổ tin mã hoá bằng kho khoá của máy và chỉ nằm trên máy này.')],
    ['kick', t('zsync.q5', 'Có làm văng Zalo đang dùng không?'), t('zsync.a5b', 'CÓ — nhưng chỉ phiên WEB. Zalo chỉ cho một phiên web đăng nhập cùng lúc, nên đăng nhập cửa sổ Zalo Web sẽ làm phần "Kết nối Zalo (quét QR)" ở Kỹ năng đăng xuất (và ngược lại). Đây là giới hạn của Zalo. Cách dùng: ĐỌC lịch sử cũ thì dùng cửa sổ; GỬI tin / nhận realtime thì dùng kết nối QR; cần cả hai thì chuyển qua lại. Zalo trên ĐIỆN THOẠI không bao giờ bị đăng xuất.')],
    ['ai', t('zsync.q6', 'Trợ lý dùng tin Zalo thế nào?'), t('zsync.a6', 'Hỏi tự nhiên trong Lark × Agents: "tóm tắt nhóm Kho tháng 9", "tìm tin nhắc tới đơn DH-12", "đọc hội thoại Zalo đang mở". Trợ lý chỉ đọc khi bạn hỏi, và chỉ trong cuộc trò chuyện của chính bạn — bot Lark trong nhóm hay người được chia sẻ không đọc được Zalo của bạn.')],
    ['off', t('zsync.q7', 'Tắt lưu hoặc xoá tin thì sao?'), t('zsync.a7', 'Tắt "Lưu tin trên máy" thì bản đã lưu bị xoá ngay; tin chỉ còn trong lúc app mở. "Xoá tin đã lưu" xoá sạch sổ tin của Larkwave. Tin trên Zalo (điện thoại, máy chủ) không bị ảnh hưởng. Đăng xuất Zalo trong Larkwave cũng xoá sổ tin của tài khoản đó.')],
  ];
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, margin: '4px 0 6px' }}>{t('zsync.faq', 'Hỏi đáp')}</div>
      <Collapse size="small" items={qa.map(([key, q, a]) => ({ key, label: q, children: <div style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.6 }}>{a}</div> }))} />
    </div>
  );
}
