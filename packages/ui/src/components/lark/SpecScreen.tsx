'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Collapse, Empty, Input, Segmented, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  PartitionOutlined,
  ApartmentOutlined,
  SyncOutlined,
  BulbOutlined,
  DeploymentUnitOutlined,
  MessageOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DatabaseOutlined,
  NodeIndexOutlined,
  RocketOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { LarkSpecDoc, SpecBase, SpecStatus, SpecSource, SpecInsight, SpecWorkflow } from '@larkwave/core';
import { BRAND, BRAND_GRADIENT, V } from '../../theme';
import { useRuntime } from '../../RuntimeProvider';
import { ChatMarkdown } from '../ChatMarkdown';
import { useI18n } from '../../i18n';

const { Title, Text, Paragraph } = Typography;

/** Human relative time in Vietnamese (renderer — Date is fine here). */
function ago(iso?: string): string {
  if (!iso) return 'chưa rõ';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'chưa rõ';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'vừa xong';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ngày trước`;
  return new Date(t).toLocaleDateString('vi-VN');
}

function StatusTag({ status }: { status: SpecStatus }) {
  const { t: tr } = useI18n();
  if (status === 'verified') return <Tag color="success">{tr('chat.verified', 'đã kiểm chứng')}</Tag>;
  if (status === 'stale') return <Tag color="warning">{tr('chat.stale', 'cũ')}</Tag>;
  return <Tag>{tr('chat.unverified', 'chưa kiểm chứng')}</Tag>;
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11.5,
  color: V.textSub,
  background: V.chipBg,
  border: `1px solid ${V.border}`,
  borderRadius: 6,
  padding: '1px 7px',
};

function SourceChip({ source }: { source: SpecSource }) {
  const { t: tr } = useI18n();
  const label = source.tool === 'conversation' ? tr('chat.fromConversation', 'từ hội thoại') : source.tool;
  return (
    <Tooltip title={`${tr('chat.sourceLabel', 'Nguồn')}: ${label} · ${tr('chat.readAt', 'đọc')} ${ago(source.fetchedAt)}`}>
      <span style={chipStyle}>
        <ClockCircleOutlined /> {ago(source.fetchedAt)}
      </span>
    </Tooltip>
  );
}

/** A column chip (name + readable type). Soft-removed → struck-through + faded. */
function FieldChip({ name, uiType, removed }: { name: string; uiType?: string; removed?: boolean }) {
  return (
    <span
      style={{
        ...chipStyle,
        color: removed ? V.textFaint : V.text,
        textDecoration: removed ? 'line-through' : 'none',
        opacity: removed ? 0.6 : 1,
      }}
    >
      {name}
      {uiType ? <span style={{ color: V.textFaint }}>· {uiType}</span> : null}
    </span>
  );
}

/**
 * "Đặc tả hệ thống" — a living specification of the user's Lark workspace, built by RE-FETCHING
 * live structured data (never scraping the chat transcript) and merged by real Lark id. Shows
 * entities, workflows, relations + an AI/user insight layer, each with a trust status +
 * provenance. Sync produces a visible added/changed/removed diff.
 */
export function SpecScreen({ onOpenChat }: { onOpenChat?: () => void }) {
  const runtime = useRuntime();
  const { t: tr } = useI18n();
  const { message } = App.useApp();
  const [doc, setDoc] = useState<LarkSpecDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'entities' | 'workflows' | 'upgrade'>('entities');
  const [overviewDraft, setOverviewDraft] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = (await runtime.larkSpec?.()) ?? null;
        if (!alive) return;
        setDoc(d);
        setOverviewDraft(d?.overview.text ?? '');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [runtime]);

  const doSync = useCallback(async () => {
    if (syncing || !runtime.larkBuildSpec) return;
    setSyncing(true);
    try {
      const res = await runtime.larkBuildSpec();
      setDoc(res.doc);
      setOverviewDraft(res.doc.overview.text ?? '');
      const { added, changed, removed, basesFetched } = res.diff;
      const parts = [
        added ? `+${added} ${tr('chat.newSuffix', 'mới')}` : '',
        changed ? `${changed} ${tr('chat.updatedWord', 'cập nhật')}` : '',
        removed ? `${removed} ${tr('chat.removedWord', 'đã gỡ')}` : '',
      ].filter(Boolean);
      message.success(
        `${tr('chat.synced', 'Đã đồng bộ')} ${basesFetched} Base — ${parts.length ? parts.join(' · ') : tr('chat.noChanges', 'không có thay đổi')}.`,
      );
      if (res.failedBases.length)
        message.warning(`${res.failedBases.length} ${tr('chat.basesUnread', 'Base chưa đọc được (giữ nguyên bản cũ).')}`);
      // Push the merged spec to the account so it appears on other devices (best-effort).
      void runtime.larkBackupSync?.();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.syncFailed', 'Không đồng bộ được đặc tả.'));
    } finally {
      setSyncing(false);
    }
  }, [runtime, syncing, message, tr]);

  const onOverviewChange = useCallback(
    (text: string) => {
      setOverviewDraft(text);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setDoc((prev) => {
          const now = new Date().toISOString();
          const next: LarkSpecDoc = prev
            ? { ...prev, overview: { text, updatedAt: now } }
            : { v: 1, updatedAt: now, overview: { text, updatedAt: now }, bases: [], workflows: [], relations: [], insights: [], syncLog: [] };
          void runtime.larkSaveSpec?.(next).then(() => runtime.larkBackupSync?.());
          return next;
        });
      }, 800);
    },
    [runtime],
  );

  const dismissInsight = useCallback(
    (id: string) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next: LarkSpecDoc = {
          ...prev,
          insights: prev.insights.map((i) => (i.id === id ? { ...i, dismissed: true } : i)),
        };
        void runtime.larkSaveSpec?.(next).then(() => runtime.larkBackupSync?.());
        return next;
      });
    },
    [runtime],
  );

  const counts = useMemo(() => {
    const bases = (doc?.bases ?? []).filter((b) => !b.removed);
    const tables = bases.reduce((n, b) => n + b.tables.filter((t) => !t.removed).length, 0);
    const workflows = (doc?.workflows ?? []).filter((w) => !w.removed).length;
    return { bases: bases.length, tables, workflows };
  }, [doc]);

  const logicMissing = useMemo(
    () => (doc?.workflows ?? []).some((w) => !w.removed && w.logicMissing),
    [doc],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin />
      </div>
    );
  }

  const isEmpty = !doc || (doc.bases.length === 0 && doc.workflows.length === 0);

  return (
    <Space direction="vertical" size={18} style={{ width: '100%' }}>
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          rowGap: 12,
          padding: '18px 20px',
          borderRadius: 14,
          background: V.surface,
          border: `1px solid ${V.border}`,
        }}
      >
        <span
          style={{
            width: 48,
            height: 48,
            minWidth: 48,
            borderRadius: 13,
            background: BRAND_GRADIENT,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
          }}
        >
          <PartitionOutlined />
        </span>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Title level={4} style={{ margin: 0, color: V.text }}>
              {tr('chat.specTitle', 'Đặc tả hệ thống Lark')}
            </Title>
            {doc?.updatedAt && (
              <Text style={{ fontSize: 12.5, color: V.textSub }}>· {tr('chat.updatedAgo', 'cập nhật')} {ago(doc.updatedAt)}</Text>
            )}
          </div>
          {!isEmpty && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
              <Text style={{ fontSize: 12.5, color: V.textSub }}>
                <DatabaseOutlined /> {counts.bases} Base · {counts.tables} {tr('chat.tablesUnit', 'bảng')}
              </Text>
              <Text style={{ fontSize: 12.5, color: V.textSub }}>
                <NodeIndexOutlined /> {counts.workflows} workflow
              </Text>
            </div>
          )}
          {logicMissing && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#d48806' }}>
              <WarningOutlined /> {tr('chat.logicMissingWarn', 'Một số workflow chưa đọc được logic — vào Lark × Agents → Cài đặt → “Kết nối Lark web” để xem chi tiết trigger/điều kiện/hành động.')}
            </div>
          )}
        </div>
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncing} />}
          loading={syncing}
          onClick={doSync}
          style={{ background: BRAND_GRADIENT, border: 'none', fontWeight: 600 }}
        >
          {syncing ? tr('chat.syncing', 'Đang đồng bộ…') : tr('chat.syncSpec', 'Đồng bộ đặc tả')}
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState onOpenChat={onOpenChat} onSync={doSync} syncing={syncing} />
      ) : (
        <>
          {/* Tab strip scrolls itself on a phone (long VI labels) instead of widening the page. */}
          <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <Segmented
              value={tab}
              onChange={(v) => setTab(v as typeof tab)}
              options={[
                { label: tr('chat.entitiesRelations', 'Thực thể & quan hệ'), value: 'entities', icon: <ApartmentOutlined /> },
                { label: 'Workflow', value: 'workflows', icon: <PartitionOutlined /> },
                { label: tr('chat.overview', 'Tổng quan'), value: 'overview', icon: <BulbOutlined /> },
                { label: tr('chat.upgrade', 'Nâng cấp'), value: 'upgrade', icon: <RocketOutlined /> },
              ]}
            />
          </div>
          {tab === 'entities' && <EntitiesTab doc={doc!} />}
          {tab === 'workflows' && <WorkflowsTab doc={doc!} />}
          {tab === 'overview' && (
            <OverviewTab
              doc={doc!}
              draft={overviewDraft}
              onChange={onOverviewChange}
              onDismiss={dismissInsight}
              onOpenChat={onOpenChat}
            />
          )}
          {tab === 'upgrade' && <UpgradeTab onOpenChat={onOpenChat} />}
        </>
      )}
    </Space>
  );
}

// ── Empty state (reuse the pillar concept) ──────────────────────────────────
function EmptyState({
  onOpenChat,
  onSync,
  syncing,
}: {
  onOpenChat?: () => void;
  onSync: () => void;
  syncing: boolean;
}) {
  const { t: tr } = useI18n();
  const pillars = [
    { icon: <ApartmentOutlined />, title: tr('chat.entitiesRelations', 'Thực thể & quan hệ'), desc: tr('chat.pillar1Desc', 'Base, bảng, cột và liên kết — đọc trực tiếp từ Lark, có trạng thái kiểm chứng.') },
    { icon: <PartitionOutlined />, title: tr('chat.pillar2Title', 'Workflow & sơ đồ'), desc: tr('chat.pillar2Desc', 'Từng automation vẽ thành cây trigger → điều kiện → hành động, đúng như trong Lark.') },
    { icon: <SyncOutlined />, title: tr('chat.pillar3Title', 'Đồng bộ + khác biệt'), desc: tr('chat.pillar3Desc', 'Mỗi lần đồng bộ hiện rõ thêm/đổi/gỡ, khớp theo ID Lark nên không trùng lặp.') },
    { icon: <BulbOutlined />, title: tr('chat.pillar4Title', 'Huấn luyện agent'), desc: tr('chat.pillar4Desc', 'Đặc tả trở thành “trí nhớ hệ thống” để agent hiểu đúng cấu trúc (sắp có).') },
    { icon: <DeploymentUnitOutlined />, title: tr('chat.pillar5Title', 'Kết nối tổng để nâng cấp'), desc: tr('chat.pillar5Desc', 'Từ đặc tả, agent đề xuất + tạo nâng cấp cho hệ thống Lark (sắp có).') },
  ];
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card style={{ background: V.surface }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ maxWidth: 460, margin: '0 auto' }}>
              <Text style={{ color: V.text, fontWeight: 600 }}>{tr('chat.noSpecYet', 'Chưa có đặc tả nào')}</Text>
              <Paragraph style={{ color: V.textSub, fontSize: 13, margin: '6px 0 0' }}>
                {tr('chat.emptyDescPre', 'Bấm')} <b>{tr('chat.syncSpec', 'Đồng bộ đặc tả')}</b> {tr('chat.emptyDescPost', 'để đọc trực tiếp cấu trúc + workflow của các Base bạn đã kết nối, hoặc bắt đầu từ một cuộc trò chuyện trong Lark × Agents.')}
              </Paragraph>
            </div>
          }
        >
          <Space>
            <Button type="primary" icon={<SyncOutlined spin={syncing} />} loading={syncing} onClick={onSync}
              style={{ background: BRAND_GRADIENT, border: 'none', fontWeight: 600 }}>
              {tr('chat.syncSpec', 'Đồng bộ đặc tả')}
            </Button>
            {onOpenChat && (
              <Button icon={<MessageOutlined />} onClick={onOpenChat}>
                {tr('chat.openLarkAgents', 'Mở Lark × Agents')}
              </Button>
            )}
          </Space>
        </Empty>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {pillars.map((p) => (
          <Card key={p.title} size="small" style={{ background: V.surface }}>
            <div style={{ color: BRAND, fontSize: 19 }}>{p.icon}</div>
            <div style={{ fontWeight: 600, marginTop: 7, color: V.text }}>{p.title}</div>
            <Text style={{ fontSize: 12.5, color: V.textSub, lineHeight: 1.5 }}>{p.desc}</Text>
          </Card>
        ))}
      </div>
    </Space>
  );
}

// ── Entities tab ─────────────────────────────────────────────────────────────
function EntitiesTab({ doc }: { doc: LarkSpecDoc }) {
  const { t: tr } = useI18n();
  const items = doc.bases.map((base) => {
    const liveTables = base.tables;
    const tableName = new Map(base.tables.map((t) => [t.tableId, t.name]));
    const rels = doc.relations.filter((r) => tableName.has(r.fromTableId));
    return {
      key: base.appToken,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: V.text, textDecoration: base.removed ? 'line-through' : 'none' }}>
            <DatabaseOutlined style={{ color: BRAND }} /> {base.name}
          </span>
          <StatusTag status={base.status} />
          <Text style={{ fontSize: 12, color: V.textSub }}>{liveTables.filter((t) => !t.removed).length} {tr('chat.tablesUnit', 'bảng')}</Text>
          <SourceChip source={base.source} />
        </div>
      ),
      children: (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {liveTables.map((t) => (
            <div
              key={t.tableId}
              style={{
                border: `1px solid ${V.border}`,
                borderRadius: 10,
                padding: '10px 12px',
                background: V.surfaceAlt,
                opacity: t.removed ? 0.65 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                <span style={{ fontWeight: 600, color: V.text, textDecoration: t.removed ? 'line-through' : 'none' }}>
                  {t.name}
                </span>
                {typeof t.recordCount === 'number' && (
                  <Text style={{ fontSize: 12, color: V.textSub }}>{t.recordCount} {tr('chat.recordsUnit', 'bản ghi')}</Text>
                )}
                <StatusTag status={t.status} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {t.fields.map((f) => (
                  <FieldChip key={f.fieldId} name={f.name} uiType={f.uiType} removed={f.removed} />
                ))}
                {t.fields.length === 0 && <Text style={{ fontSize: 12, color: V.textFaint }}>{tr('chat.noColumnsRead', '(chưa đọc được cột)')}</Text>}
              </div>
            </div>
          ))}
          {rels.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <Text style={{ fontSize: 12, color: V.textSub, fontWeight: 600 }}>{tr('chat.relationsInferred', 'Quan hệ (suy ra)')}</Text>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {rels.map((r, i) => (
                  <span key={i} style={chipStyle}>
                    <NodeIndexOutlined /> «{tableName.get(r.fromTableId)}» —{r.kind}→ «{tableName.get(r.toTableId) ?? '?'}»
                  </span>
                ))}
              </div>
            </div>
          )}
        </Space>
      ),
    };
  });
  return (
    <Collapse
      defaultActiveKey={doc.bases.slice(0, 1).map((b) => b.appToken)}
      items={items}
      style={{ background: V.surface }}
    />
  );
}

// ── Workflows tab ────────────────────────────────────────────────────────────
/** One workflow card (base is shown by the group header, so it's omitted here). */
function WorkflowCard({ w }: { w: SpecWorkflow }) {
  const { t: tr } = useI18n();
  return (
    <Card size="small" style={{ background: V.surface, opacity: w.removed ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: V.text, textDecoration: w.removed ? 'line-through' : 'none' }}>
          {w.name}
        </span>
        {w.statusText && <Tag color={/bật/.test(w.statusText) ? 'green' : 'default'}>{w.statusText}</Tag>}
        <StatusTag status={w.status} />
        <SourceChip source={w.source} />
      </div>
      {w.logicTree ? (
        <ChatMarkdown content={w.logicTree} />
      ) : (
        <Text style={{ fontSize: 12.5, color: '#d48806' }}>
          <WarningOutlined /> {tr('chat.logicUnread', 'Chưa đọc được logic — Kết nối Lark web để xem chi tiết.')}
        </Text>
      )}
    </Card>
  );
}

function WorkflowsTab({ doc }: { doc: LarkSpecDoc }) {
  const { t: tr } = useI18n();
  const wfs = doc.workflows;
  if (wfs.length === 0)
    return (
      <Card style={{ background: V.surface }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr('chat.noWorkflowRead', 'Chưa đọc được workflow nào từ các Base.')} />
      </Card>
    );

  // Group workflows by Base (like the Entities tab), ordered to match doc.bases.
  const byBase = new Map<string, SpecWorkflow[]>();
  for (const w of wfs) {
    const arr = byBase.get(w.appToken) ?? [];
    arr.push(w);
    byBase.set(w.appToken, arr);
  }
  const baseByToken = new Map(doc.bases.map((b) => [b.appToken, b]));
  const orderedTokens = [
    ...doc.bases.map((b) => b.appToken).filter((t) => byBase.has(t)),
    ...[...byBase.keys()].filter((t) => !baseByToken.has(t)),
  ];

  const items = orderedTokens.map((token) => {
    const list = byBase.get(token) ?? [];
    const base = baseByToken.get(token);
    const activeCount = list.filter((w) => !w.removed).length;
    return {
      key: token,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: V.text }}>
            <DatabaseOutlined style={{ color: BRAND }} /> {base?.name || tr('chat.otherBase', 'Base khác')}
          </span>
          <Text style={{ fontSize: 12, color: V.textSub }}>{activeCount} workflow</Text>
          {base && <StatusTag status={base.status} />}
        </div>
      ),
      children: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {list.map((w) => (
            <WorkflowCard key={w.workflowId} w={w} />
          ))}
        </Space>
      ),
    };
  });

  return <Collapse defaultActiveKey={orderedTokens.slice(0, 1)} items={items} style={{ background: V.surface }} />;
}

// ── Overview tab (user prose + insight layer) ────────────────────────────────
function OverviewTab({
  doc,
  draft,
  onChange,
  onDismiss,
  onOpenChat,
}: {
  doc: LarkSpecDoc;
  draft: string;
  onChange: (t: string) => void;
  onDismiss: (id: string) => void;
  onOpenChat?: () => void;
}) {
  const { t: tr } = useI18n();
  const insights = doc.insights.filter((i) => !i.dismissed);
  const kindLabel: Record<SpecInsight['kind'], string> = {
    guide: tr('chat.insightGuide', 'Hướng dẫn'),
    rule: tr('chat.insightRule', 'Quy tắc'),
    purpose: tr('chat.insightPurpose', 'Mục đích'),
    note: tr('chat.insightNote', 'Ghi chú'),
  };
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card size="small" style={{ background: V.surface }} title={<span style={{ color: V.text }}>{tr('chat.systemDescTitle', 'Mô tả hệ thống (của bạn)')}</span>}>
        <Input.TextArea
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tr('chat.systemDescPlaceholder', 'Ghi vài dòng về hệ thống này: nó dùng để làm gì, các quy trình chính, quy ước… Nội dung này được lưu riêng và đồng bộ giữa các thiết bị.')}
          autoSize={{ minRows: 3, maxRows: 12 }}
          style={{ background: V.surfaceAlt }}
        />
      </Card>

      <Card
        size="small"
        style={{ background: V.surface }}
        title={<span style={{ color: V.text }}>{tr('chat.insightsFromChat', 'Ghi nhận từ hội thoại')} ({insights.length})</span>}
      >
        {insights.length === 0 ? (
          <div style={{ padding: '4px 0' }}>
            <Text style={{ fontSize: 12.5, color: V.textSub }}>
              {tr('chat.noInsights', 'Chưa có ghi nhận nào. Trong Lark × Agents, bạn có thể đưa một câu trả lời hữu ích (hướng dẫn, quy tắc…) vào đặc tả để agent ghi nhớ.')}{' '}
            </Text>
            {onOpenChat && (
              <Button type="link" size="small" onClick={onOpenChat} style={{ padding: 0 }}>
                {tr('chat.openLarkAgents', 'Mở Lark × Agents')}
              </Button>
            )}
          </div>
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {insights.map((i) => (
              <div
                key={i.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  border: `1px solid ${V.border}`,
                  borderRadius: 9,
                  padding: '8px 10px',
                  background: V.surfaceAlt,
                }}
              >
                <Tag color="purple" style={{ marginTop: 1 }}>{kindLabel[i.kind]}</Tag>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: V.text, fontSize: 13 }}>{i.text}</Text>
                  <div style={{ marginTop: 4 }}>
                    <SourceChip source={i.source} />
                  </div>
                </div>
                <Tooltip title={tr('chat.removeFromSpec', 'Gỡ khỏi đặc tả')}>
                  <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => onDismiss(i.id)} />
                </Tooltip>
              </div>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  );
}

// ── Upgrade tab (M4 teaser) ──────────────────────────────────────────────────
function UpgradeTab({ onOpenChat }: { onOpenChat?: () => void }) {
  const { t: tr } = useI18n();
  return (
    <Card style={{ background: V.surface }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RocketOutlined style={{ color: BRAND, fontSize: 20 }} />
          <Title level={5} style={{ margin: 0, color: V.text }}>
            {tr('chat.upgradeToolTitle', 'Trình nâng cấp hệ thống')}
          </Title>
          <Tag color="purple">{tr('chat.comingSoon', 'Sắp có')}</Tag>
        </div>
        <Paragraph style={{ color: V.textSub, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          {tr('chat.upgradeDesc1', 'Từ đặc tả này, agent sẽ so sánh')} <b>{tr('chat.upgradeDesc2', 'đặc tả với hiện trạng thật')}</b> {tr('chat.upgradeDesc3', 'trong Lark để đề xuất nâng cấp — thêm workflow còn thiếu, tối ưu bảng/cột, phát hiện quy trình trùng lặp — và có thể')} <b>{tr('chat.upgradeDesc4', 'tạo trực tiếp')}</b> {tr('chat.upgradeDesc5', 'qua Lark (có bước xác nhận). Trước tiên hãy đồng bộ đặc tả cho đầy đủ; phần nâng cấp sẽ mở khi hoàn thiện.')}
        </Paragraph>
        {onOpenChat && (
          <Button icon={<MessageOutlined />} onClick={onOpenChat} style={{ alignSelf: 'flex-start' }}>
            {tr('chat.openLarkAgents', 'Mở Lark × Agents')}
          </Button>
        )}
      </Space>
    </Card>
  );
}
