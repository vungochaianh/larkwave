'use client';
import { useState, type ReactNode } from 'react';
import { Button, Tag, Popover, QRCode } from 'antd';
import { CloudServerOutlined, LoginOutlined, MobileOutlined, DownOutlined, RightOutlined, InfoCircleOutlined, DatabaseOutlined, WarningOutlined, ReloadOutlined } from '@ant-design/icons';
import type { CmsSyncJob, CmsKeeperStatus } from '@larkwave/core';
import { V, BRAND, BRAND_GRADIENT, CARD_SHADOW } from '../../theme';
import { useI18n } from '../../i18n';

const OK = '#16B98D';
const WARN = '#F59E0B';
const ERR = '#EF4444';

function jobErrored(j: CmsSyncJob): boolean {
  const s = [j.lastSyncStatus, j.lastStatus].map((x) => (typeof x === 'string' ? x.toLowerCase() : '')).join(' ');
  return s.includes('error') || s.includes('fail') || !!j.lastSyncError || !!j.lastError;
}
function hostKey(j: CmsSyncJob): string {
  return (j.connector?.hostId || j.connector?.domain || 'unknown').trim() || 'unknown';
}
function shortHost(h: string): string {
  if (h === 'unknown') return 'chưa rõ host';
  return h.length > 14 ? '…' + h.slice(-12) : h;
}

/**
 * Transparent "how the VM keeps the Lark session" panel. Explains the CURRENT single-session model
 * (one Lark account → one VM session → pushed to every job) and, crucially for users with MULTIPLE
 * Lark accounts, groups jobs by their source host so the account/session mapping is visible — plus
 * an honest note on the multi-account limitation + what's coming.
 */
export function LarkSessionsPanel({
  jobs,
  keeper,
  webConnected,
  webHost,
  connecting,
  onRelogin,
  onRefresh,
  refreshing,
  openExternal,
  compact = false,
}: {
  jobs: CmsSyncJob[];
  keeper: CmsKeeperStatus | null;
  webConnected: boolean;
  webHost?: string;
  connecting?: boolean;
  onRelogin: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  openExternal?: (url: string) => void;
  /**
   * Màn Đồng bộ Bitable đã có nút Đăng nhập/Làm mới ở đầu trang và một "Cách hoạt động" chung →
   * thẻ này bỏ các phần lặp: nút đăng nhập, nút làm mới (trừ khi có job lỗi — lúc đó nó là nút SỬA),
   * ghi chú "VM là tuỳ chọn" và phần giải thích (đã nằm trong <LarkSessionsHowItWorks/>).
   */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const erroredCount = jobs.filter(jobErrored).length;
  const fixMode = erroredCount > 0 && webConnected; // errored jobs + app connected → "Làm mới" is the fix

  // Group jobs by their source host (≈ Lark account/source). Multiple groups = jobs span
  // multiple Lark accounts → today only one of them (the logged-in account) can sync.
  const groups = new Map<string, { total: number; enabled: number; errored: number; hostType?: string }>();
  for (const j of jobs) {
    const k = hostKey(j);
    const g = groups.get(k) || { total: 0, enabled: 0, errored: 0, hostType: j.connector?.hostType };
    g.total++;
    if (j.enabled !== false) g.enabled++;
    if (jobErrored(j)) g.errored++;
    groups.set(k, g);
  }
  const groupList = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);
  const multi = groupList.length > 1;

  // VM status line.
  const vm: { color: string; text: string } = !keeper?.present
    ? { color: V.textFaint, text: t('chat.vmNone', 'Chưa có máy VM giữ phiên') }
    : !keeper.online
      ? { color: ERR, text: t('chat.vmOffline', 'Máy VM ngoại tuyến') }
      : keeper.loggedIn
        ? { color: OK, text: t('chat.vmHolding', 'Máy VM đang giữ phiên (đã đăng nhập)') }
        : { color: WARN, text: t('chat.vmExpired', 'Máy VM online nhưng phiên Lark đã hết hạn') };

  const stat = (icon: ReactNode, color: string, label: string, value: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ color, fontSize: 14, display: 'inline-flex' }}>{icon}</span>
      <span style={{ color: V.textSub }}>{label}</span>
      <span style={{ fontWeight: 700, color: V.text }}>{value}</span>
    </div>
  );

  return (
    <div style={{ background: V.surface, border: `1px solid ${V.border}`, borderRadius: 14, boxShadow: CARD_SHADOW, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', color: BRAND, background: `${BRAND}1f`, fontSize: 15 }}><CloudServerOutlined /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{t('chat.vmSessionTitle', 'Phiên đăng nhập Lark trên VM')}</div>
          <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: vm.color, display: 'inline-block' }} />
            <span style={{ color: V.textSub }}>{vm.text}</span>
          </div>
        </div>
        <Tag color={webConnected ? 'green' : 'red'} style={{ margin: 0 }}>{webConnected ? t('chat.appConnectedLark', 'App: đã kết nối Lark') : t('chat.appNotConnected', 'App: chưa kết nối')}</Tag>
      </div>

      {/* Mapping: which host/account each job uses */}
      <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 18 }}>
        {stat(<DatabaseOutlined />, BRAND, t('chat.totalJobs', 'Tổng job'), jobs.length)}
        {stat(<CloudServerOutlined />, multi ? WARN : OK, t('chat.sourceHosts', 'Tài khoản/host nguồn'), groupList.length)}
        {stat(<WarningOutlined />, ERR, t('chat.sessionErrorJobs', 'Job lỗi session'), jobs.filter(jobErrored).length)}
      </div>

      {groupList.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groupList.map(([host, g]) => (
            <div key={host} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: V.surfaceAlt }}>
              <DatabaseOutlined style={{ color: V.textFaint }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.hostType ? `${g.hostType} · ` : ''}{shortHost(host)}
                </div>
                <div style={{ fontSize: 11.5, color: V.textFaint }}>{g.total} job · {g.enabled} {t('chat.enabledUnit', 'đang bật')}{g.errored ? ` · ${g.errored} ${t('chat.errorsUnit', 'lỗi')}` : ''}</div>
              </div>
              {g.errored > 0 && <Tag color="error" style={{ margin: 0 }}>{t('chat.sessionError', 'lỗi session')}</Tag>}
            </div>
          ))}
        </div>
      )}

      {/* Honest multi-account explainer */}
      {multi && (
        <div style={{ marginTop: 12, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: `${WARN}14`, border: `1px solid ${WARN}44` }}>
          <WarningOutlined style={{ color: WARN, fontSize: 15, flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.55 }}>
            Các job đang thuộc <b>{groupList.length} host/tài khoản Lark khác nhau</b>, nhưng hệ thống hiện chỉ giữ <b>MỘT phiên</b> (tài khoản đang đăng nhập). Chỉ job thuộc tài khoản đó đồng bộ được; job của tài khoản khác sẽ <b>lỗi session</b> cho tới khi bạn đăng nhập đúng tài khoản đó rồi bơm lại phiên. <b>Đa-tài-khoản song song</b> (mỗi tài khoản một phiên riêng trên VM, tự bơm đúng job) đang được phát triển.
          </div>
        </div>
      )}

      {/* VM is OPTIONAL — clear up the "clicking login should make a VM appear" confusion. */}
      {!keeper?.present && !compact && (
        <div style={{ marginTop: 12, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: V.surfaceAlt, border: `1px solid ${V.border}` }}>
          <InfoCircleOutlined style={{ color: BRAND, fontSize: 15, flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.55 }}>
            <b>Máy VM là TUỲ CHỌN — hiện chưa cài.</b> Ngay bây giờ chính <b>App này đang giữ phiên Lark</b> và bơm cho các job (mỗi khi App mở). Máy VM (<code>tw-cms-keeper</code>) chỉ cần khi bạn muốn đồng bộ <b>24/7 kể cả lúc TẮT App</b> — và nó là một chương trình cài trên <b>máy chủ riêng</b>, <b>không</b> tự hiện ra khi bấm “Đăng nhập”. Nút “Đăng nhập Lark web” dưới đây là đăng nhập cho <b>App</b>, không phải tạo VM.
          </div>
        </div>
      )}

      {/* Errored jobs → tell the user EXACTLY what fixes them (refresh, not endless re-login). */}
      {erroredCount > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: `${WARN}14`, border: `1px solid ${WARN}44` }}>
          <WarningOutlined style={{ color: WARN, fontSize: 15, flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.55 }}>
            <b>{erroredCount} job lỗi session.</b> {webConnected ? <>Bấm <b>“Làm mới session”</b> (nút bên dưới) để bơm phiên mới từ App — sẽ tự bật lại job đã tắt vì hết phiên.</> : <>App đang <b>chưa kết nối</b> Lark — bấm <b>“Đăng nhập Lark web”</b> trước, rồi “Làm mới session”.</>} Nếu <b>vẫn lỗi sau khi làm mới</b> thì KHÔNG phải do phiên, mà là <b>lỗi cần sửa tay</b> (mất quyền vào Base, hoặc bảng/cột đã đổi/xoá) — mở job đó xem chi tiết lỗi.
          </div>
        </div>
      )}

      {/* How it works (collapsible) */}
      {!compact && (<>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ marginTop: 12, border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: BRAND, fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <InfoCircleOutlined /> {t('chat.howItWorks', 'Cách hoạt động')} {open ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
      </button>
      {open && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: V.textSub, lineHeight: 1.6, background: V.surfaceAlt, borderRadius: 10, padding: '10px 12px' }}>
          <LarkSessionsHowItWorks />
        </div>
      )}
      </>)}

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {onRefresh && (!compact || erroredCount > 0) && (
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            loading={refreshing}
            onClick={onRefresh}
            type={fixMode ? 'primary' : 'default'}
            style={fixMode ? { background: BRAND_GRADIENT, border: 'none', fontWeight: 600 } : undefined}
          >
            {erroredCount > 0 ? `${t('chat.refreshSession', 'Làm mới session')} (${t('chat.fixVerb', 'sửa')} ${erroredCount} ${t('chat.errorsUnit', 'lỗi')})` : `${t('chat.refreshSession', 'Làm mới session')} (${t('chat.all', 'tất cả')})`}
          </Button>
        )}
        {!compact && (
        <Button
          icon={<LoginOutlined />}
          loading={connecting}
          onClick={onRelogin}
          type={fixMode ? 'default' : 'primary'}
          style={fixMode ? undefined : { background: BRAND_GRADIENT, border: 'none', fontWeight: 600 }}
        >
          {webConnected ? t('chat.reloginLarkWeb', 'Đăng nhập lại Lark web') : t('chat.loginLarkWeb', 'Đăng nhập Lark web')}
        </Button>
        )}
        {keeper?.online && !keeper.loggedIn && keeper.reloginUrl && (
          <Popover
            trigger="click"
            placement="bottomRight"
            title={t('chat.reloginVmPhone', 'Đăng nhập lại VM từ điện thoại')}
            content={
              <div style={{ width: 220, textAlign: 'center' }}>
                <div style={{ background: '#fff', padding: 10, borderRadius: 12, display: 'inline-block', lineHeight: 0 }}>
                  <QRCode value={keeper.reloginUrl} size={160} bordered={false} />
                </div>
                <div style={{ fontSize: 12, color: V.textSub, marginTop: 8 }}>{t('chat.scanPhoneRelogin', 'Quét bằng điện thoại để đăng nhập lại phiên Lark cho máy VM.')}</div>
              </div>
            }
          >
            <Button icon={<MobileOutlined />}>{t('chat.scanQrRelogin', 'Quét QR đăng nhập lại (VM)')}</Button>
          </Popover>
        )}
      </div>
    </div>
  );
}

/** Bốn bước "phiên Lark được giữ và bơm cho job thế nào" — dùng chung cho thẻ này và "Cách hoạt động" của màn. */
export function LarkSessionsHowItWorks() {
  return (
    <>
      <div>1. App/máy VM giữ <b>một phiên Lark web</b> (cookies + csrf) của tài khoản đang đăng nhập, tự làm mới định kỳ.</div>
      <div>2. Ai bơm phiên cho job? <b>Nếu đã cài máy VM (tw-cms-keeper)</b> → nó giữ phiên sống <b>24/7</b> và bơm cookies/csrf mới vào mọi job (mỗi 30 phút + khi lỗi), chạy cả khi bạn tắt App. <b>Chưa cài VM</b> (như hiện tại) → chính <b>App này</b> bơm, nhưng chỉ khi App đang mở.</div>
      <div>3. Job lỗi vì hết phiên → bấm <b>“Làm mới session”</b> để bơm phiên hiện tại của App cho mọi job (tự bật lại job đã tắt). Nếu App chưa đăng nhập Lark → bấm <b>“Đăng nhập Lark web”</b> trước.</div>
      <div>4. <b>Nhiều tài khoản Lark:</b> hiện chỉ 1 phiên/1 tài khoản. Bản đa-tài-khoản sẽ cho mỗi tài khoản một phiên riêng + gắn từng job vào đúng tài khoản.</div>
    </>
  );
}
