'use client';
import { useEffect, useRef, useState } from 'react';
import { App, Button, Divider, Modal, Spin, Tag, Typography } from 'antd';
import { BankOutlined, CheckCircleFilled, CopyOutlined, FacebookFilled, LoadingOutlined } from '@ant-design/icons';
import { BRAND, V } from '../theme';
import { accountApi, type CreatePaymentResponse } from './api';

const { Text, Paragraph } = Typography;

const POLL_MS = 4000;
const FANPAGE_URL = 'https://web.facebook.com/toolswave.net';
const fmtVnd = (n: number) => (n <= 0 ? '0đ' : `${n.toLocaleString('vi-VN')}đ`);

function CopyRow({ label, value, display, highlight, big }: { label: string; value: string; display?: string; highlight?: boolean; big?: boolean }) {
  const { message } = App.useApp();
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); message.success(`Đã sao chép ${label.toLowerCase()}`); }
    catch { message.error('Không sao chép được'); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 12, border: highlight ? `1.5px solid ${BRAND}` : `1px solid ${V.border}`, background: highlight ? 'rgba(108,92,231,0.06)' : V.surfaceAlt }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: V.textSub }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: big ? 22 : 15, color: highlight ? BRAND : V.text, fontFamily: highlight ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, letterSpacing: highlight ? 1 : undefined, wordBreak: 'break-all' }}>
          {display ?? value}
        </div>
      </div>
      <Button icon={<CopyOutlined />} onClick={copy} type={highlight ? 'primary' : 'default'} size="small" style={{ flexShrink: 0 }}>Sao chép</Button>
    </div>
  );
}

/**
 * SePay bank-transfer checkout — native desktop port of the web CheckoutModal.
 * Shows the VietQR + bank/amount/memo and polls GET /payments/:id every 4s until
 * the webhook flips it to `paid`, then calls onActivated (refresh subscription).
 */
export function CheckoutModal({
  open, payment, planLabel, onClose, onActivated,
}: {
  open: boolean;
  payment: CreatePaymentResponse | null;
  planLabel?: string;
  onClose: () => void;
  onActivated?: () => void;
}) {
  const [paid, setPaid] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activatedRef = useRef(false);
  const paymentId = payment?.paymentId ?? null;

  useEffect(() => {
    if (open && paymentId) { setPaid(false); setImgLoaded(false); activatedRef.current = false; }
  }, [open, paymentId]);

  useEffect(() => {
    if (!open || !paymentId || paid) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await accountApi.paymentStatus(paymentId);
        if (cancelled) return;
        if (res.status === 'paid') {
          setPaid(true);
          if (!activatedRef.current) { activatedRef.current = true; onActivated?.(); }
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        }
      } catch { /* transient — keep polling */ }
    };
    timerRef.current = setInterval(check, POLL_MS);
    void check();
    return () => { cancelled = true; if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [open, paymentId, paid, onActivated]);

  const close = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    onClose();
  };

  return (
    <Modal open={open} onCancel={close} footer={null} width={480} maskClosable={false}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><BankOutlined style={{ color: BRAND }} />Thanh toán gói {payment?.planLabel ?? planLabel ?? ''}</span>}>
      {!payment ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 30, color: BRAND }} spin />} />
          <div style={{ marginTop: 14, color: V.textSub }}>Đang tạo đơn thanh toán…</div>
        </div>
      ) : paid ? (
        <div style={{ textAlign: 'center', padding: '16px 4px 8px' }}>
          <CheckCircleFilled style={{ fontSize: 56, color: '#16B98D' }} />
          <Paragraph style={{ fontSize: 18, fontWeight: 700, color: V.text, margin: '16px 0 4px' }}>Kích hoạt gói thành công!</Paragraph>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            Bạn đã được nâng cấp lên <Tag color="success" style={{ margin: 0 }}>{payment.planLabel}</Tag>. Cảm ơn bạn đã tin dùng Larkwave.
          </Paragraph>
          <Button type="primary" size="large" onClick={close}>Hoàn tất</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: 10, borderRadius: 16, background: V.surface, border: `1px solid ${V.border}`, boxShadow: '0 4px 16px rgba(17,24,39,0.06)' }}>
              <div style={{ position: 'relative', minWidth: 230, minHeight: imgLoaded ? undefined : 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {!imgLoaded && <Spin indicator={<LoadingOutlined style={{ fontSize: 26, color: BRAND }} spin />} />}
                <img src={payment.qrUrl} alt="VietQR thanh toán" loading="eager" onLoad={() => setImgLoaded(true)}
                  style={{ display: imgLoaded ? 'block' : 'none', width: 230, height: 'auto', maxWidth: '100%', borderRadius: 8 }} />
              </div>
            </div>
            <div style={{ marginTop: 6 }}><Text type="secondary" style={{ fontSize: 12.5 }}>Quét mã bằng app ngân hàng để chuyển nhanh</Text></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px', borderRadius: 12, background: V.surfaceAlt, border: `1px solid ${V.border}` }}>
              <div>
                <div style={{ fontSize: 12, color: V.textSub }}>Ngân hàng</div>
                <div style={{ fontWeight: 600, color: V.text }}>{payment.bank.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: V.textSub }}>Chủ tài khoản</div>
                <div style={{ fontWeight: 600, color: V.text }}>{payment.bank.holder}</div>
              </div>
            </div>
            <CopyRow label="Số tài khoản" value={payment.bank.account} />
            <CopyRow label="Số tiền" value={String(payment.amountVnd)} display={fmtVnd(payment.amountVnd)} big />
            <CopyRow label="Nội dung chuyển khoản" value={payment.transferContent} highlight />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#B45309', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 10, padding: '8px 12px' }}>
            <span>⚠️</span>
            <span>Vui lòng ghi <Text strong>ĐÚNG nội dung</Text> <Text strong style={{ color: BRAND }}>{payment.transferContent}</Text> để hệ thống kích hoạt tự động.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 0 2px' }}>
            <Spin indicator={<LoadingOutlined spin style={{ fontSize: 18 }} />} />
            <Text style={{ color: V.text, fontWeight: 500 }}>Đang chờ thanh toán…</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>App sẽ tự cập nhật ngay khi nhận được chuyển khoản.</Text>

          <Divider style={{ margin: '6px 0 0' }} />
          <div style={{ textAlign: 'center' }}>
            <a href={FANPAGE_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: V.textSub, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FacebookFilled style={{ color: '#1877F2' }} />Hoặc liên hệ fanpage nếu cần hỗ trợ
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
