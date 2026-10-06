'use client';
import { useEffect, useState } from 'react';
import { App, Button, Card, Modal, Progress, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { AppstoreOutlined, ArrowRightOutlined, CheckOutlined, CreditCardOutlined, CrownOutlined, HistoryOutlined, ReloadOutlined, StarFilled } from '@ant-design/icons';
import { BRAND, BRAND_GRADIENT, CARD_SHADOW, V, OK, WARN, ERR, BLUE } from '../theme';
import { accountApi, formatDate, type CreatePaymentResponse, type MeSubscription, type Payment, type PlanCatalogEntry, type PlanId } from './api';
import { CheckoutModal } from './CheckoutModal';
import { SectionHeader } from '../kit';
import type { View } from '../components/HomeScreen';

const PLAN_ORDER: PlanId[] = ['free', 'starter', 'pro', 'enterprise'];
const rankOf = (p?: PlanId | null): number => Math.max(0, PLAN_ORDER.indexOf((p ?? 'free') as PlanId));

const { Title, Text, Link } = Typography;
const POPULAR_PLAN: PlanId = 'pro';
const PLAN_ACCENT: Record<string, string> = { free: V.textFaint, starter: BLUE, pro: BRAND, enterprise: OK };
const fmtVnd = (n: number) => (n <= 0 ? '0đ' : `${n.toLocaleString('vi-VN')}đ`);
/** A plan's monthly token budget → human copy ("X triệu token/tháng"). */
const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : Number(m.toFixed(1))} triệu token/tháng`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)} nghìn token/tháng`;
  return `${n.toLocaleString('vi-VN')} token/tháng`;
};

/**
 * Native desktop port (core) of the website's /pricing: current plan + monthly
 * usage, the plan catalogue, and payment history. Buying/upgrading opens the web
 * checkout in the browser (payments go through the web SePay bank-transfer flow).
 */
export function PricingView({ onNav }: { onNav?: (v: View) => void } = {}) {
  const { message } = App.useApp();
  const [sub, setSub] = useState<MeSubscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([accountApi.subscription(), accountApi.payments().catch(() => [])]);
      setSub(s);
      setPayments(p);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Native SePay bank-transfer checkout ──────────────────────────────────
  const { modal } = App.useApp();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payment, setPayment] = useState<CreatePaymentResponse | null>(null);
  const [checkoutLabel, setCheckoutLabel] = useState('');

  const choose = async (plan: PlanId) => {
    if (!sub) return;
    // Downgrade (to a lower tier) → switch directly, no payment.
    if (rankOf(plan) < rankOf(sub.plan)) {
      const label = sub.catalog.find((c) => c.id === plan)?.label ?? plan;
      modal.confirm({
        title: 'Đổi gói',
        content: `Chuyển sang gói ${label}? Bạn sẽ áp dụng quyền lợi gói mới (không hoàn tiền chu kỳ hiện tại).`,
        okText: 'Đồng ý', cancelText: 'Huỷ',
        onOk: async () => {
          try { const s = await accountApi.setPlan(plan); setSub(s); message.success(`Đã chuyển sang gói ${s.planLabel}.`); }
          catch (e) { message.error((e as Error).message); }
        },
      });
      return;
    }
    if (plan === 'free') return;
    // Upgrade → open the checkout immediately (loading), then create the intent.
    setCheckoutLabel(sub.catalog.find((c) => c.id === plan)?.label ?? '');
    setPayment(null);
    setCheckoutOpen(true);
    try {
      const res = await accountApi.createPayment(plan);
      setPayment(res);
    } catch (e) {
      setCheckoutOpen(false);
      message.error((e as Error).message);
    }
  };

  const paymentCols: ColumnsType<Payment> = [
    { title: 'Gói', dataIndex: 'planLabel', key: 'planLabel' },
    { title: 'Số tiền', dataIndex: 'amountVnd', key: 'amountVnd', render: (v: number) => fmtVnd(v) },
    { title: 'Mã', dataIndex: 'code', key: 'code', render: (v: string) => <Text code>{v}</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'paid' ? 'green' : 'gold'} bordered={false}>{s === 'paid' ? 'Đã thanh toán' : 'Đang chờ'}</Tag> },
    { title: 'Tạo lúc', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(v)}</Text> },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <CrownOutlined style={{ color: WARN, marginInlineEnd: 8 }} />
            Gói & Thanh toán
          </Title>
          <Text type="secondary">Chọn gói phù hợp. Thanh toán qua chuyển khoản ngân hàng (mở trên web).</Text>
        </div>
        <Space wrap size={8}>
          <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>Lịch sử thanh toán</Button>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Tải lại</Button>
        </Space>
      </div>

      {/* Current plan + usage */}
      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: 20 } }}>
        {loading || !sub ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : (
          <>
            <SectionHeader icon={<CrownOutlined />} color={BRAND} title="Gói hiện tại" />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Title level={4} style={{ margin: 0 }}>{sub.planLabel}</Title>
                  <Tag style={{ background: PLAN_ACCENT[sub.plan] ?? BRAND, color: '#fff', border: 'none' }}>{sub.plan.toUpperCase()}</Tag>
                </div>
                <div style={{ marginTop: 6 }}>
                  {onNav ? (
                    <Link onClick={() => onNav('apps')} style={{ fontSize: 12.5 }}>
                      {sub.liveApps}/{sub.maxLiveApps < 0 ? '∞' : sub.maxLiveApps} app đang chạy <ArrowRightOutlined style={{ fontSize: 10 }} />
                    </Link>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {sub.liveApps}/{sub.maxLiveApps < 0 ? '∞' : sub.maxLiveApps} app đang chạy
                    </Text>
                  )}
                </div>
              </div>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Tooltip title={sub.resetAt ? `Ngân sách token làm mới ${formatDate(sub.resetAt)}` : 'Ngân sách token theo gói'}>
                    <Text type="secondary" style={{ fontSize: 12.5, cursor: 'help' }}>Ngân sách token tháng này</Text>
                  </Tooltip>
                  <div style={{ flex: 1 }} />
                  {onNav && (
                    <Link onClick={() => onNav('home')} style={{ fontSize: 12 }}>
                      Xem ở Tổng quan <ArrowRightOutlined style={{ fontSize: 10 }} />
                    </Link>
                  )}
                </div>
                <Progress
                  percent={sub.unlimited ? 0 : Math.min(100, Math.round(sub.percentUsed))}
                  status={sub.percentUsed >= 100 && !sub.unlimited ? 'exception' : 'normal'}
                  strokeColor={sub.percentUsed >= 100 ? ERR : sub.percentUsed >= 80 ? WARN : { '0%': '#6C5CE7', '100%': '#A66BFF' }}
                  format={() => (sub.unlimited ? 'Không giới hạn' : `${Math.round(sub.percentUsed)}%`)}
                />
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Plan catalogue */}
      {loading || !sub ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <div>
          <SectionHeader icon={<AppstoreOutlined />} color={BRAND} title="Các gói" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, alignItems: 'stretch' }}>
            {sub.catalog.map((p) => (
              <PlanCard key={p.id} plan={p} current={p.id === sub.plan} currentRank={rankOf(sub.plan)} onChoose={() => void choose(p.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Payment history (in a modal) */}
      <Modal open={historyOpen} onCancel={() => setHistoryOpen(false)} title="Lịch sử thanh toán" footer={null} width={720} destroyOnHidden>
        <Table<Payment> rowKey="id" size="small" loading={loading} columns={paymentCols} dataSource={payments} pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: 'Chưa có giao dịch nào' }} />
      </Modal>

      <CheckoutModal
        open={checkoutOpen}
        payment={payment}
        planLabel={checkoutLabel}
        onClose={() => setCheckoutOpen(false)}
        onActivated={() => { void load(); }}
      />
    </Space>
  );
}

function PlanCard({ plan, current, currentRank, onChoose }: { plan: PlanCatalogEntry; current: boolean; currentRank: number; onChoose: () => void }) {
  const accent = PLAN_ACCENT[plan.id] ?? BRAND;
  const popular = plan.id === POPULAR_PLAN;
  const price = plan.discountedVnd != null && plan.discountedVnd < plan.priceVnd ? plan.discountedVnd : plan.priceVnd;
  // Label BY DIRECTION (choose() already handles up/down): current → disabled;
  // a higher-rank target is an upgrade, a lower-rank target a downgrade.
  const targetRank = rankOf(plan.id);
  const ctaLabel = current ? 'Gói hiện tại' : targetRank > currentRank ? 'Nâng cấp' : 'Chuyển xuống';
  return (
    <Card
      style={{ height: '100%', boxShadow: CARD_SHADOW, border: popular ? `1.5px solid ${accent}` : undefined, position: 'relative' }}
      styles={{ body: { padding: 18, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 } }}
    >
      {popular && (
        <div style={{ position: 'absolute', top: -1, right: 14, background: BRAND_GRADIENT, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: '0 0 8px 8px' }}>
          <StarFilled /> Phổ biến
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />
        <Title level={5} style={{ margin: 0 }}>{plan.label}</Title>
      </div>
      <div>
        <span style={{ fontSize: 24, fontWeight: 800, color: V.text }}>{fmtVnd(price)}</span>
        {price > 0 && <Text type="secondary" style={{ fontSize: 12.5 }}> /tháng</Text>}
        {plan.discountedVnd != null && plan.discountedVnd < plan.priceVnd && (
          <Text delete type="secondary" style={{ fontSize: 12.5, marginInlineStart: 8 }}>{fmtVnd(plan.priceVnd)}</Text>
        )}
      </div>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Text style={{ fontSize: 12.5 }}><CheckOutlined style={{ color: OK, marginInlineEnd: 6 }} />{plan.maxLiveApps < 0 ? 'Không giới hạn' : plan.maxLiveApps} app chạy cùng lúc</Text>
        {plan.fullStack && <Text style={{ fontSize: 12.5 }}><CheckOutlined style={{ color: OK, marginInlineEnd: 6 }} />Chạy full-stack trên server</Text>}
        {plan.monthlyTokens ? <Text style={{ fontSize: 12.5 }}><CheckOutlined style={{ color: OK, marginInlineEnd: 6 }} />{fmtTokens(plan.monthlyTokens)}</Text> : null}
      </Space>
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        {current ? (
          <Button block disabled>{ctaLabel}</Button>
        ) : (
          <Button block type={popular ? 'primary' : 'default'} icon={<CreditCardOutlined />} onClick={onChoose}>
            {ctaLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}
