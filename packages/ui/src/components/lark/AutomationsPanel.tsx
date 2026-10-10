'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Checkbox, Empty, Input, InputNumber, List, Modal, Popconfirm, Segmented, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { ThunderboltOutlined, PlusOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { LarkAutoAction, LarkAutoCondition, LarkAutomation, LarkAutomationInput, LarkAutoSchedule, LarkBaseRef, LarkTableRef, RuntimeAdapter } from '@larkwave/core';
import { contractsFromFields, hasContract, relatedSet } from '@larkwave/core';
import type { SkillContract, SkillInfo } from '@larkwave/core';
import { useI18n } from '../../i18n';
import { V } from '../../theme';
import { HostedRunnerCard } from './HostedRunnerCard';
import { HowItWorks } from '../../kit';
import { AutomationFilesSection, RunReportView, type AutoFilesValue } from './AutomationFiles';
import { accountApi } from '../../account/api';

const { Text, Paragraph } = Typography;

const DAY_OPTS = [
  { label: 'CN', value: 0 },
  { label: 'T2', value: 1 },
  { label: 'T3', value: 2 },
  { label: 'T4', value: 3 },
  { label: 'T5', value: 4 },
  { label: 'T6', value: 5 },
  { label: 'T7', value: 6 },
];
const dayLabel = (d: number) => DAY_OPTS.find((o) => o.value === d)?.label ?? String(d);

type Op = LarkAutoCondition['op'];
const OP_LABEL: Record<Op, string> = {
  is: 'bằng',
  isNot: 'khác',
  contains: 'chứa',
  doesNotContain: 'không chứa',
  isEmpty: 'trống',
  isNotEmpty: 'không trống',
  isGreater: 'lớn hơn',
  isLess: 'nhỏ hơn',
};
const NO_VALUE = (op: Op) => op === 'isEmpty' || op === 'isNotEmpty';
const ACTION_LABEL: Record<LarkAutoAction['type'], string> = {
  send_message: 'Gửi tin nhắn',
  update_record: 'Cập nhật bản ghi',
  webhook: 'Gọi webhook',
  run_agent: 'Chạy AI agent',
  run_skill_set: 'Chạy bộ kỹ năng',
};

/** Flat form model (avoids editing a discriminated union in place). */
interface FormModel {
  id?: string;
  name: string;
  enabled: boolean;
  appToken: string;
  tableId: string;
  condField: string;
  condOp: Op;
  condValue: string;
  actionType: LarkAutoAction['type'];
  msgType: 'chat_id' | 'open_id' | 'user_id' | 'email';
  receiveId: string;
  msgText: string;
  updField: string;
  updValue: string;
  webhookUrl: string;
  agentPrompt: string;
  agentPostChatId: string;
  agentSave: boolean;
  /** Lịch được GHI dữ liệu không. Mặc định CÓ — đặt lịch là để nó làm việc đó. */
  agentWrite: boolean;
  agentNotify: boolean;
  /** Việc làm "Chạy bộ kỹ năng": một kỹ năng BẤT KỲ trong bộ — cả bộ suy ra bằng `relatedSet()`. */
  skillSetId: string;
  /** TÊN CỘT trong bảng → khoá hợp đồng. Dòng vừa kích hoạt đổ vào đây thành `seedFacts`. */
  skillSeed: Record<string, string>;
  skillWriteBack: 'target' | 'record' | 'none';
  /** Khoá hợp đồng → TÊN CỘT, dùng khi ghi ngược lại chính dòng đã kích hoạt. */
  skillWriteMap: Record<string, string>;
  intervalSec: number;
  fireExisting: boolean;
  triggerType: 'record' | 'schedule';
  schedMode: 'interval' | 'daily';
  atHour: number;
  atMinute: number;
  schedDays: number[];
  /** Thư mục/nguồn tệp + quyền khi chạy tự động + nơi chạy (việc "Chạy AI agent"). */
  files: AutoFilesValue;
  /** Quy tắc cũ chưa có mục quyền (đang giữ sự cho phép cũ). */
  legacyPerms: boolean;
  /** Id sinh sẵn cho quy tắc MỚI — để thêm tệp nguồn trước khi lưu lần đầu. */
  draftId?: string;
}

const FILES_DEFAULT: AutoFilesValue = { sources: [], onlyNewFiles: false, keepOutputs: 10, perms: {}, runOn: 'auto' };
const newDraftId = (): string => {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
};

/**
 * "Tự động hoá (Larkwave)" — a rule engine that works AROUND Lark's missing
 * create-automation API: it polls a Base table and, when a record matches the
 * condition, runs an action (send message / update record / call webhook).
 */
/**
 * Lịch sử thực thi của một quy tắc.
 *
 * `lastRunAt` + `runCount` chỉ trả lời "lần cuối là khi nào" — không đủ cho một lịch chạy tự động
 * không ai trông, nhất là khi nó được phép GHI dữ liệu. Cái người dùng cần khi mở ra rà là: lần
 * nào đã ghi, ghi mấy thao tác, và kết quả ra sao.
 */
function RunHistory({
  runs,
  tr,
  runtime,
}: {
  runs: NonNullable<LarkAutomation['runs']>;
  tr: (key: string, fallback: string) => string;
  runtime: RuntimeAdapter;
}) {
  const [open, setOpen] = useState(false);
  /** Lần chạy đang mở biên bản (đọc gì / ghi gì / đọc lại / bỏ qua / tệp kết quả). */
  const [detail, setDetail] = useState<string | null>(null);
  // Mới nhất lên đầu: đó là thứ người ta mở ra để xem.
  const list = [...runs].reverse();
  const shown = open ? list : list.slice(0, 3);
  return (
    <div style={{ marginTop: 4 }}>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        {shown.map((x, i) => (
          <div key={`${x.at}-${i}`}>
          <div style={{ fontSize: 10.5, color: V.textFaint, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ color: x.ok ? undefined : '#cf1322' }}>{x.ok ? '✓' : '✕'}</span>
            <span>{new Date(x.at).toLocaleString('vi-VN')}</span>
            <span>· {Math.round(x.ms / 1000)}s</span>
            {/* Số thao tác GHI là con số đáng chú ý nhất — tô đậm khi khác 0. */}
            {!!x.writes && (
              <span style={{ color: '#d46b08', fontWeight: 600 }}>
                · {x.writes} {tr('chat.writeOps', 'thao tác ghi')}
              </span>
            )}
            {!x.writes && !!x.tools && <span>· {x.tools} {tr('chat.toolCalls', 'lời gọi')}</span>}
            {x.mode === 'ask' && <span>· {tr('chat.readOnlyShort', 'chỉ đọc')}</span>}
            {x.summary && (
              <span style={{ opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                — {x.summary}
              </span>
            )}
            {!!x.report?.skipped?.length && <span style={{ color: '#d46b08' }}>· {x.report.skipped.length} bị bỏ qua</span>}
            {x.report && (
              <Button type="link" size="small" style={{ padding: 0, height: 16, fontSize: 10.5 }} onClick={() => setDetail((d) => (d === x.at ? null : x.at))}>
                {detail === x.at ? 'Ẩn biên bản' : 'Biên bản'}
              </Button>
            )}
          </div>
          {detail === x.at && x.report && <RunReportView report={x.report} runtime={runtime} />}
          </div>
        ))}
      </Space>
      {list.length > 3 && (
        <Button type="link" size="small" style={{ padding: 0, height: 18, fontSize: 10.5 }} onClick={() => setOpen((v) => !v)}>
          {open
            ? tr('chat.collapseRuns', 'Thu gọn')
            : `${tr('chat.moreRuns', 'Xem thêm')} ${list.length - 3} ${tr('chat.runsUnit', 'lần chạy')}`}
        </Button>
      )}
    </div>
  );
}

/**
 * `page`: dùng làm thân của màn "Tự động hoá" (đầu trang đã có tiêu đề + mô tả) → thẻ không lặp lại
 * tiêu đề, đoạn giới thiệu dài chuyển vào "Cách hoạt động". Trong modal Cài đặt Lark thì giữ nguyên.
 */
export function AutomationsPanel({ runtime, page = false }: { runtime: RuntimeAdapter; page?: boolean }) {
  const { t: tr } = useI18n();
  const { message } = App.useApp();
  const dayOptsT = [
    { label: tr('chat.daySun', 'CN'), value: 0 },
    { label: tr('chat.dayMon', 'T2'), value: 1 },
    { label: tr('chat.dayTue', 'T3'), value: 2 },
    { label: tr('chat.dayWed', 'T4'), value: 3 },
    { label: tr('chat.dayThu', 'T5'), value: 4 },
    { label: tr('chat.dayFri', 'T6'), value: 5 },
    { label: tr('chat.daySat', 'T7'), value: 6 },
  ];
  const dayLabelT = (d: number) => dayOptsT.find((o) => o.value === d)?.label ?? String(d);
  const opLabelT: Record<Op, string> = {
    is: tr('chat.opIs', 'bằng'),
    isNot: tr('chat.opIsNot', 'khác'),
    contains: tr('chat.opContains', 'chứa'),
    doesNotContain: tr('chat.opNotContains', 'không chứa'),
    isEmpty: tr('chat.opEmpty', 'trống'),
    isNotEmpty: tr('chat.opNotEmpty', 'không trống'),
    isGreater: tr('chat.opGreater', 'lớn hơn'),
    isLess: tr('chat.opLess', 'nhỏ hơn'),
  };
  const actionLabelT: Record<LarkAutoAction['type'], string> = {
    send_message: tr('chat.actSendMsg', 'Gửi tin nhắn'),
    update_record: tr('chat.actUpdateRecord', 'Cập nhật bản ghi'),
    webhook: tr('chat.actWebhook', 'Gọi webhook'),
    run_agent: tr('chat.actRunAgent', 'Chạy AI agent'),
    run_skill_set: tr('chat.actRunSkillSet', 'Chạy bộ kỹ năng'),
  };
  const [rules, setRules] = useState<LarkAutomation[]>([]);
  /** Kỹ năng CÓ hợp đồng — chỉ những cái này chạy theo bộ được. */
  const [skillSets, setSkillSets] = useState<SkillInfo[]>([]);
  const [bases, setBases] = useState<LarkBaseRef[]>([]);
  const [tables, setTables] = useState<LarkTableRef[]>([]);
  const [tablesBusy, setTablesBusy] = useState(false);
  const [form, setForm] = useState<FormModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  /** Đã bật "Để Larkwave chạy lịch hộ" — để cảnh báo việc cần phiên web/thư mục trên máy. */
  const [hostedOn, setHostedOn] = useState(false);
  useEffect(() => {
    accountApi
      .larkHostedStatus()
      .then((st) => setHostedOn(!!st?.enabled))
      .catch(() => setHostedOn(false));
  }, []);
  // Mục nào đang trùng mục khác (cùng câu lệnh + cùng nhịp)? Máy chủ nay tự gộp khi tạo, nhưng
  // những mục đã nhân bản từ trước vẫn còn tới khi người dùng cài bản mới — và họ cần THẤY để
  // xoá. Bỏ qua mục đầu tiên của mỗi nhóm: đó là mục thật, chỉ các bản sao mới bị đánh dấu.
  const dupIds = (() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const r of rules) {
      if (r.triggerType !== 'schedule' || r.action?.type !== 'run_agent') continue;
      const key = `${(r.action.prompt || '').trim()}::${JSON.stringify(r.schedule ?? null)}`;
      if (seen.has(key)) dup.add(r.id);
      else seen.add(key);
    }
    return dup;
  })();

  const supported = !!runtime.larkListAutomations;

  const refresh = useCallback(() => {
    runtime.larkListAutomations?.().then(setRules).catch(() => setRules([]));
  }, [runtime]);
  useEffect(() => {
    if (!supported) return;
    refresh();
    runtime.larkListBases?.().then(setBases).catch(() => setBases([]));
    // Chỉ kỹ năng ĐÃ BẬT và CÓ hợp đồng: kỹ năng tắt không được đồng bộ sang CLI nên chọn vào đây
    // là dựng một lịch chạy xong không ra gì, mà lý do thì nằm ở màn hình khác.
    runtime
      .listSkills?.()
      .then((list) => setSkillSets(list.filter((x) => x.enabled && !!x.contract && !x.builtin)))
      .catch(() => setSkillSets([]));
  }, [supported, refresh, runtime]);

  const loadTables = useCallback(
    (appToken: string) => {
      if (!appToken) {
        setTables([]);
        return;
      }
      setTablesBusy(true);
      runtime
        .larkListTables?.(appToken)
        .then((t) => setTables(t))
        .catch(() => setTables([]))
        .finally(() => setTablesBusy(false));
    },
    [runtime],
  );

  if (!supported) return null;

  const patch = (p: Partial<FormModel>) => setForm((f) => (f ? { ...f, ...p } : f));

  // ── Bộ kỹ năng: gom bằng ĐÚNG luật của động cơ ────────────────────────────────────────
  // `relatedSet` gom theo quan hệ dữ liệu thật (kể cả dây nối qua ràng buộc). Viết một vòng lặp
  // gom riêng ở đây là đẻ ra luật "cùng một bộ" thứ hai, và cái người dùng nhìn thấy sẽ lệch với
  // cái thực sự chạy.
  const allContracts: SkillContract[] = contractsFromFields(skillSets).filter(hasContract);
  const setOf = (id: string): SkillContract[] => (id ? relatedSet(allContracts, id) : []);
  /** Khoá cả bộ CẦN mà không kỹ năng nào trong bộ sinh ra — đúng những chỗ cần dữ liệu đầu vào. */
  const setNeeds = (id: string): string[] => {
    const set = setOf(id);
    const made = new Set(set.flatMap((c) => c.produces));
    return [...new Set(set.flatMap((c) => c.needs))].filter((k) => !made.has(k));
  };
  const setProduces = (id: string): string[] => [...new Set(setOf(id).flatMap((c) => c.produces))];
  /** `seedFrom` lưu CỘT→KHOÁ (đúng chiều động cơ đọc), còn form hiển thị theo khoá — tra ngược. */
  const colFor = (seed: Record<string, string>, key: string): string =>
    Object.entries(seed).find(([, k]) => k === key)?.[0] ?? '';
  const withCol = (seed: Record<string, string>, key: string, col: string): Record<string, string> => {
    const next = Object.fromEntries(Object.entries(seed).filter(([, k]) => k !== key));
    if (col.trim()) next[col.trim()] = key;
    return next;
  };

  const openNew = () => {
    const appToken = bases[0]?.appToken ?? '';
    setForm({
      name: '',
      enabled: true,
      appToken,
      tableId: '',
      condField: '',
      condOp: 'is',
      condValue: '',
      actionType: 'send_message',
      msgType: 'chat_id',
      receiveId: '',
      msgText: '',
      updField: '',
      updValue: '',
      webhookUrl: '',
      agentPrompt: '',
      agentPostChatId: '',
      agentSave: true,
      agentWrite: true,
      agentNotify: true,
      skillSetId: '',
      skillSeed: {},
      skillWriteBack: 'target',
      skillWriteMap: {},
      intervalSec: 60,
      fireExisting: false,
      triggerType: bases.length ? 'record' : 'schedule',
      schedMode: 'daily',
      atHour: 9,
      atMinute: 0,
      schedDays: [1, 2, 3, 4, 5],
      files: { ...FILES_DEFAULT },
      legacyPerms: false,
      draftId: newDraftId(),
    });
    loadTables(appToken);
  };

  const openEdit = (r: LarkAutomation) => {
    setForm({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      appToken: r.appToken,
      tableId: r.tableId,
      condField: r.condition?.field ?? '',
      condOp: r.condition?.op ?? 'is',
      condValue: r.condition?.value ?? '',
      actionType: r.action.type,
      msgType: r.action.type === 'send_message' ? r.action.receiveIdType : 'chat_id',
      receiveId: r.action.type === 'send_message' ? r.action.receiveId : '',
      msgText: r.action.type === 'send_message' ? r.action.text : '',
      updField: r.action.type === 'update_record' ? r.action.field : '',
      updValue: r.action.type === 'update_record' ? r.action.value : '',
      webhookUrl: r.action.type === 'webhook' ? r.action.url : '',
      agentPrompt: r.action.type === 'run_agent' ? r.action.prompt : '',
      agentPostChatId:
        r.action.type === 'run_agent' || r.action.type === 'run_skill_set' ? (r.action.postToChatId ?? '') : '',
      agentSave: r.action.type === 'run_agent' ? r.action.saveConversation !== false : true,
      agentWrite: r.action.type === 'run_agent' ? r.action.mode !== 'ask' : true,
      // `notify`/`postToChatId` dùng chung cho cả hai việc làm chạy-AI, nên đọc lại từ cả hai —
      // nếu không, mở sửa một quy tắc "chạy bộ kỹ năng" sẽ thấy các ô giao kết quả bị reset.
      agentNotify:
        r.action.type === 'run_agent' || r.action.type === 'run_skill_set' ? r.action.notify !== false : true,
      skillSetId: r.action.type === 'run_skill_set' ? r.action.skillId : '',
      skillSeed: r.action.type === 'run_skill_set' ? (r.action.seedFrom ?? {}) : {},
      skillWriteBack: r.action.type === 'run_skill_set' ? (r.action.writeBack ?? 'target') : 'target',
      skillWriteMap: r.action.type === 'run_skill_set' ? (r.action.writeMap ?? {}) : {},
      intervalSec: r.intervalSec,
      fireExisting: !!r.fireExisting,
      triggerType: r.triggerType === 'schedule' ? 'schedule' : 'record',
      schedMode: r.schedule?.mode ?? 'daily',
      atHour: r.schedule?.atHour ?? 9,
      atMinute: r.schedule?.atMinute ?? 0,
      schedDays: r.schedule?.days ?? [1, 2, 3, 4, 5],
      ...(() => {
        // Quy tắc cũ (chưa có mục quyền) ở chế độ thực thi: hiện ĐÚNG sự cho phép đang có hiệu lực.
        const legacy = !r.permissions && r.action.type === 'run_agent' && r.action.mode !== 'ask';
        return {
          legacyPerms: legacy,
          files: {
            sources: r.files?.sources ?? [],
            onlyNewFiles: !!r.files?.onlyNewFiles,
            keepOutputs: r.files?.keepOutputs ?? 10,
            perms: legacy ? { overwriteCells: true, replaceAttachments: true, sendMessages: true, deleteRecords: true } : { ...(r.permissions ?? {}) },
            runOn: r.runOn === 'desktop' ? 'desktop' : 'auto',
          } as AutoFilesValue,
        };
      })(),
    });
    loadTables(r.appToken);
  };

  const buildAction = (f: FormModel): LarkAutoAction | string => {
    if (f.actionType === 'send_message') {
      if (!f.receiveId.trim() || !f.msgText.trim()) return tr('chat.enterReceiverMsg', 'Nhập người/nhóm nhận và nội dung tin nhắn.');
      return { type: 'send_message', receiveIdType: f.msgType, receiveId: f.receiveId.trim(), text: f.msgText };
    }
    if (f.actionType === 'update_record') {
      if (!f.updField.trim()) return tr('chat.enterUpdateCol', 'Nhập tên cột cần cập nhật.');
      return { type: 'update_record', field: f.updField.trim(), value: f.updValue };
    }
    if (f.actionType === 'run_agent') {
      if (!f.agentPrompt.trim()) return tr('chat.enterAgentPrompt', 'Nhập câu lệnh cho AI agent (vd: PBTTCN…).');
      return {
        type: 'run_agent',
        prompt: f.agentPrompt.trim(),
        ...(f.agentPostChatId.trim() ? { postToChatId: f.agentPostChatId.trim() } : {}),
        saveConversation: f.agentSave,
        mode: f.agentWrite ? ('build' as const) : ('ask' as const),
        notify: f.agentNotify,
      };
    }
    if (f.actionType === 'run_skill_set') {
      if (!f.skillSetId) return tr('chat.pickSkillSet', 'Chọn một kỹ năng trong bộ cần chạy.');
      // Ghi ngược vào chính dòng đã kích hoạt mà chưa gán cột nào ⇒ lịch chạy xong không để lại gì.
      // Thà chặn ở đây còn hơn để người dùng phát hiện sau vài ngày lịch chạy vô ích.
      if (f.skillWriteBack === 'record' && !Object.keys(f.skillWriteMap).length)
        return tr('chat.needWriteMap', 'Chọn ít nhất một khoá để ghi ngược vào dòng đã kích hoạt.');
      return {
        type: 'run_skill_set',
        skillId: f.skillSetId,
        ...(Object.keys(f.skillSeed).length ? { seedFrom: f.skillSeed } : {}),
        writeBack: f.skillWriteBack,
        ...(f.skillWriteBack === 'record' ? { writeMap: f.skillWriteMap } : {}),
        ...(f.agentPostChatId.trim() ? { postToChatId: f.agentPostChatId.trim() } : {}),
        notify: f.agentNotify,
      };
    }
    if (!/^https?:\/\//i.test(f.webhookUrl.trim())) return tr('chat.enterWebhookUrl', 'Nhập URL webhook hợp lệ (http/https).');
    return { type: 'webhook', url: f.webhookUrl.trim() };
  };

  /** Phần tệp/quyền/nơi chạy — chỉ việc "Chạy AI agent" có. */
  const agentExtras = (f: FormModel): Partial<LarkAutomationInput> =>
    f.actionType === 'run_agent'
      ? {
          files: {
            sources: f.files.sources.filter((x) => x.url.trim()).map((x) => ({ ...x, url: x.url.trim(), ...(x.field ? { field: x.field.trim() } : {}) })),
            onlyNewFiles: f.files.onlyNewFiles,
            keepOutputs: f.files.keepOutputs,
          },
          permissions: f.files.perms,
          runOn: f.files.runOn,
        }
      : {};

  const buildInput = (f: FormModel): LarkAutomationInput | string => {
    // Time-schedule rule: no Base/table/condition — fire the action on a clock.
    if (f.triggerType === 'schedule') {
      if (f.actionType === 'update_record') return tr('chat.scheduleNoUpdate', 'Lịch theo giờ không dùng "Cập nhật bản ghi" — chọn Gửi tin nhắn hoặc Webhook.');
      const action = buildAction(f);
      if (typeof action === 'string') return action;
      const schedule: LarkAutoSchedule =
        f.schedMode === 'daily'
          ? { mode: 'daily', atHour: f.atHour, atMinute: f.atMinute, days: f.schedDays }
          : { mode: 'interval' };
      return {
        id: f.id ?? f.draftId,
        name: f.name.trim() || tr('chat.ruleDefault', 'Quy tắc'),
        enabled: f.enabled,
        appToken: '',
        tableId: '',
        action,
        intervalSec: Math.max(30, Math.floor(f.intervalSec || 60)),
        triggerType: 'schedule',
        schedule,
        ...agentExtras(f),
      };
    }
    if (!f.appToken) return tr('chat.selectBaseMsg', 'Chọn Base.');
    if (!f.tableId.trim()) return tr('chat.selectTableMsg', 'Chọn/nhập bảng (table).');
    const condition: LarkAutoCondition | undefined = f.condField.trim()
      ? { field: f.condField.trim(), op: f.condOp, value: NO_VALUE(f.condOp) ? undefined : f.condValue }
      : undefined;
    const action = buildAction(f);
    if (typeof action === 'string') return action;
    return {
      id: f.id ?? f.draftId,
      name: f.name.trim() || 'Quy tắc',
      enabled: f.enabled,
      appToken: f.appToken,
      tableId: f.tableId.trim(),
      condition,
      action,
      intervalSec: Math.max(30, Math.floor(f.intervalSec || 60)),
      fireExisting: f.fireExisting,
      triggerType: 'record',
      ...agentExtras(f),
    };
  };

  const save = async () => {
    if (!form) return;
    const input = buildInput(form);
    if (typeof input === 'string') {
      message.warning(input);
      return;
    }
    setBusy(true);
    try {
      setRules(await runtime.larkSaveAutomation!(input));
      setForm(null);
      message.success(tr('chat.ruleSaved', 'Đã lưu quy tắc.'));
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.ruleSaveFailed', 'Không lưu được quy tắc.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      setRules(await runtime.larkDeleteAutomation!(id));
    } catch {
      /* ignore */
    }
  };

  const toggle = async (id: string, on: boolean) => {
    try {
      setRules(await runtime.larkSetAutomationEnabled!(id, on));
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.pluginToggleFailed', 'Không đổi được trạng thái.'));
    }
  };

  const runNow = async (id: string) => {
    setRunningId(id);
    try {
      const r = await runtime.larkRunAutomation!(id);
      if (r.error) message.error(`${tr('chat.errorColon', 'Lỗi')}: ${r.error}`);
      else message.success(`${tr('chat.matched', 'Khớp')} ${r.matched} ${tr('chat.recordsUnit', 'bản ghi')} · ${tr('chat.ranAction', 'chạy hành động')} ${r.fired} ${tr('chat.timesUnit', 'lần')}.`);
      refresh();
    } catch (e) {
      message.error((e as Error)?.message || tr('chat.testRunFailed', 'Chạy thử thất bại.'));
    } finally {
      setRunningId(null);
    }
  };

  const baseName = (appToken: string) => bases.find((b) => b.appToken === appToken)?.name || appToken;

  return (
    <>
    {/* Đặt NGAY TRÊN danh sách lịch có chủ ý: câu hỏi "sao tắt app là lịch chết" nảy ra đúng ở
        đây, nên câu trả lời phải nằm đúng ở đây — không phải trong trang Cài đặt nào đó. */}
    <HostedRunnerCard runtime={runtime} />
    <Card
      size="small"
      title={
        page ? (
          <span style={{ fontWeight: 600 }}>
            <ThunderboltOutlined /> {tr('chat.rulesCount', 'Quy tắc')} <span style={{ color: V.textFaint, fontWeight: 500 }}>({rules.length})</span>
          </span>
        ) : (
          <span>
            <ThunderboltOutlined /> {tr('chat.automationsTitle', 'Tự động hoá (Larkwave)')}
          </span>
        )
      }
      // KHÔNG khoá theo số Base: lịch theo giờ không cần Base nào cả. Khoá cả nút ở đây khiến
      // đường DUY NHẤT để có một lịch là nhắn cho agent trong khung trò chuyện — mà đó đúng là
      // đường đẻ ra các mục trùng. Chỉ kiểu "theo bảng Base" mới cần Base, và nó được khoá riêng
      // ở ô chọn kiểu kích hoạt bên dưới.
      extra={
        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openNew}>
          {tr('chat.addRule', 'Thêm quy tắc')}
        </Button>
      }
    >
      {page ? (
        <HowItWorks style={{ marginBottom: 10 }}>
          {tr('chat.automationsIntro', 'Lark không cho tạo automation bằng API — nên Larkwave tự chạy: định kỳ kiểm tra bảng, khi bản ghi khớp điều kiện thì gửi tin nhắn / cập nhật bản ghi / gọi webhook. Chạy khi app đang mở.')}
        </HowItWorks>
      ) : (
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 0 }}>
          {tr('chat.automationsIntro', 'Lark không cho tạo automation bằng API — nên Larkwave tự chạy: định kỳ kiểm tra bảng, khi bản ghi khớp điều kiện thì gửi tin nhắn / cập nhật bản ghi / gọi webhook. Chạy khi app đang mở.')}
        </Paragraph>
      )}

      {bases.length === 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={tr(
            'chat.noBaseYetHint',
            'Chưa có Base — bạn vẫn tạo được lịch theo giờ (chạy một câu lệnh cho AI). Muốn quy tắc chạy theo bảng dữ liệu thì thêm Base ở mục Base trước.',
          )}
        />
      )}

      {rules.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr('chat.noRules', 'Chưa có quy tắc tự động hoá')} />
      ) : (
        <List
          size="small"
          dataSource={rules}
          renderItem={(r) => (
            <List.Item
              actions={[
                <Tooltip key="run" title={tr('chat.testRunNow', 'Chạy thử ngay')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    loading={runningId === r.id}
                    onClick={() => runNow(r.id)}
                  />
                </Tooltip>,
                <Button key="edit" type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />,
                <Popconfirm key="del" title={tr('chat.deleteRule', 'Xoá quy tắc này?')} okText={tr('chat.delete', 'Xoá')} cancelText={tr('chat.cancel', 'Huỷ')} onConfirm={() => remove(r.id)}>
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8}>
                    <Switch size="small" checked={r.enabled} onChange={(on) => toggle(r.id, on)} />
                    <Text style={{ fontSize: 13 }}>{r.name}</Text>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <Space size={[4, 4]} wrap>
                      {r.triggerType === 'schedule' ? (
                        <Tag color="gold" style={{ margin: 0 }}>
                          {r.schedule?.mode === 'daily'
                            ? `⏰ ${String(r.schedule.atHour ?? 9).padStart(2, '0')}:${String(r.schedule.atMinute ?? 0).padStart(2, '0')} · ${
                                r.schedule.days && r.schedule.days.length ? r.schedule.days.map(dayLabelT).join(' ') : tr('chat.everyDay', 'mỗi ngày')
                              }`
                            : `⏰ ${tr('chat.every', 'mỗi')} ${r.intervalSec}s`}
                        </Tag>
                      ) : (
                        <>
                          <Tag color="purple" style={{ margin: 0 }}>
                            {baseName(r.appToken)}
                          </Tag>
                          {r.condition ? (
                            <Tag style={{ margin: 0 }}>
                              {r.condition.field} {opLabelT[r.condition.op]}
                              {NO_VALUE(r.condition.op) ? '' : ` "${r.condition.value ?? ''}"`}
                            </Tag>
                          ) : (
                            <Tag style={{ margin: 0 }}>{tr('chat.everyNewRecord', 'mọi bản ghi mới')}</Tag>
                          )}
                          <Tag style={{ margin: 0 }}>{tr('chat.every', 'mỗi')} {r.intervalSec}s</Tag>
                        </>
                      )}
                      <Tag color="geekblue" style={{ margin: 0 }}>
                        → {actionLabelT[r.action.type]}
                      </Tag>
                      {dupIds.has(r.id) && (
                        <Tag color="red" style={{ margin: 0 }}>
                          {tr('chat.ruleDuplicate', 'Trùng')}
                        </Tag>
                      )}
                    </Space>
                    {/* Nội dung lịch chạy AI. Không có dòng này thì hai mục trùng nhìn y hệt nhau —
                        tên của lịch do agent tạo chỉ là 40 ký tự đầu của câu lệnh, cắt cụt không
                        dấu hiệu — nên người dùng không có cách nào biết xoá mục nào. */}
                    {r.action.type === 'run_agent' && (
                      <Text
                        type="secondary"
                        ellipsis={{ tooltip: r.action.prompt }}
                        style={{ fontSize: 11, display: 'block', fontStyle: 'italic' }}
                      >
                        “{r.action.prompt}”
                      </Text>
                    )}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {r.lastError ? (
                        <span style={{ color: '#cf1322' }}>{tr('chat.errorColon', 'Lỗi')}: {r.lastError}</span>
                      ) : r.lastRunAt ? (
                        `${tr('chat.lastRun', 'Chạy lần cuối')}: ${new Date(r.lastRunAt).toLocaleString('vi-VN')} · ${r.runCount ?? 0} ${tr('chat.timesUnit', 'lần')}`
                      ) : (
                        tr('chat.notRun', 'Chưa chạy')
                      )}
                    </Text>
                    {!!r.runs?.length && <RunHistory runs={r.runs} tr={tr} runtime={runtime} />}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      <Modal
        open={!!form}
        onCancel={() => setForm(null)}
        onOk={save}
        okText={tr('chat.save', 'Lưu')}
        cancelText={tr('chat.cancel', 'Huỷ')}
        confirmLoading={busy}
        title={form?.id ? tr('chat.editRule', 'Sửa quy tắc') : tr('chat.newRule', 'Quy tắc tự động hoá mới')}
        width={560}
        styles={{ body: { maxHeight: '68vh', overflowY: 'auto' } }}
      >
        {form && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong style={{ fontSize: 12 }}>{tr('chat.ruleName', 'Tên quy tắc')}</Text>
              <Input value={form.name} placeholder={tr('chat.ruleNamePlaceholder', 'vd "Nhắc đơn quá hạn"')} onChange={(e) => patch({ name: e.target.value })} />
            </div>

            <div>
              <Text strong style={{ fontSize: 12 }}>{tr('chat.triggerWhen', 'Kích hoạt khi')}</Text>
              <Segmented
                block
                style={{ marginTop: 4 }}
                value={form.triggerType}
                onChange={(v) => patch({ triggerType: v as FormModel['triggerType'], actionType: v === 'schedule' && form.actionType === 'update_record' ? 'send_message' : form.actionType })}
                options={[
                  {
                    value: 'record',
                    label: tr('chat.triggerRecord', 'Bản ghi trong Base khớp điều kiện'),
                    // Chỉ kiểu này mới cần Base — khoá đúng nó, thay vì khoá cả màn hình.
                    disabled: bases.length === 0,
                  },
                  { value: 'schedule', label: tr('chat.triggerSchedule', 'Theo lịch giờ') },
                ]}
              />
            </div>

            {form.triggerType === 'record' && (
              <>
                <Space size={8} style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 12 }}>Base</Text>
                    <Select
                      style={{ width: '100%' }}
                      value={form.appToken || undefined}
                      placeholder={tr('chat.selectBase', 'Chọn Base')}
                      onChange={(v) => {
                        patch({ appToken: v, tableId: '' });
                        loadTables(v);
                      }}
                      options={bases.map((b) => ({ value: b.appToken, label: b.name }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 12 }}>{tr('chat.tableLabel', 'Bảng')}</Text>
                    <Select
                      style={{ width: '100%' }}
                      value={form.tableId || undefined}
                      placeholder={tablesBusy ? tr('chat.loading', 'Đang tải…') : tr('chat.selectTable', 'Chọn bảng')}
                      loading={tablesBusy}
                      showSearch
                      optionFilterProp="label"
                      onChange={(v) => patch({ tableId: v })}
                      options={tables.map((t) => ({ value: t.tableId, label: t.name }))}
                      notFoundContent={tablesBusy ? tr('chat.loading', 'Đang tải…') : tr('chat.noTables', 'Không có bảng')}
                    />
                  </div>
                </Space>

                <div>
                  <Text strong style={{ fontSize: 12 }}>{tr('chat.conditionLabel', 'Điều kiện (tuỳ chọn — bỏ trống = mọi bản ghi mới)')}</Text>
                  <Space size={6} style={{ width: '100%', marginTop: 4 }} styles={{ item: { flex: 1 } }}>
                    <Input placeholder={tr('chat.columnName', 'Tên cột')} value={form.condField} onChange={(e) => patch({ condField: e.target.value })} />
                    <Select
                      style={{ minWidth: 120 }}
                      value={form.condOp}
                      onChange={(v) => patch({ condOp: v as Op })}
                      options={(Object.keys(OP_LABEL) as Op[]).map((op) => ({ value: op, label: opLabelT[op] }))}
                    />
                    <Input
                      placeholder={tr('chat.value', 'Giá trị')}
                      value={form.condValue}
                      disabled={NO_VALUE(form.condOp)}
                      onChange={(e) => patch({ condValue: e.target.value })}
                    />
                  </Space>
                </div>
              </>
            )}

            {form.triggerType === 'schedule' && (
              <div>
                <Text strong style={{ fontSize: 12 }}>{tr('chat.scheduleLabel', 'Lịch chạy')}</Text>
                <Segmented
                  style={{ marginTop: 4, marginBottom: 8 }}
                  value={form.schedMode}
                  onChange={(v) => patch({ schedMode: v as FormModel['schedMode'] })}
                  options={[
                    { value: 'daily', label: tr('chat.daily', 'Hằng ngày (giờ cố định)') },
                    { value: 'interval', label: tr('chat.repeatEveryN', 'Lặp mỗi N giây') },
                  ]}
                />
                {form.schedMode === 'daily' && (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8}>
                      <span>
                        <Text style={{ fontSize: 12 }}>{tr('chat.hour', 'Giờ')} </Text>
                        <InputNumber min={0} max={23} value={form.atHour} onChange={(v) => patch({ atHour: Math.min(23, Math.max(0, Number(v) || 0)) })} />
                      </span>
                      <span>
                        <Text style={{ fontSize: 12 }}>{tr('chat.minute', 'Phút')} </Text>
                        <InputNumber min={0} max={59} value={form.atMinute} onChange={(v) => patch({ atMinute: Math.min(59, Math.max(0, Number(v) || 0)) })} />
                      </span>
                    </Space>
                    <div>
                      <Text style={{ fontSize: 12 }}>{tr('chat.activeDays', 'Ngày hoạt động (bỏ trống = mọi ngày)')}</Text>
                      <div style={{ marginTop: 4 }}>
                        <Checkbox.Group value={form.schedDays} onChange={(v) => patch({ schedDays: v as number[] })} options={dayOptsT} />
                      </div>
                    </div>
                  </Space>
                )}
              </div>
            )}

            <div>
              <Text strong style={{ fontSize: 12 }}>{tr('chat.action', 'Hành động')}</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={form.actionType}
                onChange={(v) => patch({ actionType: v as LarkAutoAction['type'] })}
                options={(Object.keys(ACTION_LABEL) as LarkAutoAction['type'][])
                  .filter((t) => form.triggerType !== 'schedule' || t !== 'update_record')
                  // Giao diện được code-push ĐỘC LẬP với bản cài: một người ở lõi cũ vẫn nhận màn
                  // hình mới này. Không lọc ở đây thì họ tạo được một lịch "chạy bộ kỹ năng" mà lõi
                  // của họ không có nhánh để chạy — và lỗi chỉ lộ ra lúc lịch nổ, trong một việc
                  // không ai ngồi trông. `supportsSkillContracts` là cờ preload nên nó tắt đúng
                  // trên lõi cũ.
                  .filter((t) => t !== 'run_skill_set' || !!runtime.supportsSkillContracts)
                  .map((t) => ({ value: t, label: actionLabelT[t] }))}
              />
              {form.actionType === 'send_message' && (
                <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 6 }}>
                  <Space size={6} style={{ width: '100%' }} styles={{ item: { flex: 1 } }}>
                    <Select
                      style={{ minWidth: 130 }}
                      value={form.msgType}
                      onChange={(v) => patch({ msgType: v as FormModel['msgType'] })}
                      options={[
                        { value: 'chat_id', label: tr('chat.groupChatId', 'Nhóm (chat_id)') },
                        { value: 'open_id', label: 'open_id' },
                        { value: 'user_id', label: 'user_id' },
                        { value: 'email', label: 'email' },
                      ]}
                    />
                    <Input placeholder={tr('chat.receiverId', 'Định danh người/nhóm nhận')} value={form.receiveId} onChange={(e) => patch({ receiveId: e.target.value })} />
                  </Space>
                  <Input.TextArea
                    placeholder={tr('chat.msgContentPlaceholder', 'Nội dung — chèn cột bằng {Tên cột}, vd "Đơn {Mã đơn} đã quá hạn"')}
                    value={form.msgText}
                    onChange={(e) => patch({ msgText: e.target.value })}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                  />
                </Space>
              )}
              {form.actionType === 'update_record' && (
                <Space size={6} style={{ width: '100%', marginTop: 6 }} styles={{ item: { flex: 1 } }}>
                  <Input placeholder={tr('chat.setColName', 'Tên cột cần đặt')} value={form.updField} onChange={(e) => patch({ updField: e.target.value })} />
                  <Input placeholder={tr('chat.newValuePlaceholder', 'Giá trị mới (dùng được {Cột})')} value={form.updValue} onChange={(e) => patch({ updValue: e.target.value })} />
                </Space>
              )}
              {form.actionType === 'webhook' && (
                <Input style={{ marginTop: 6 }} placeholder={tr('chat.webhookPlaceholder', 'https://… (Larkwave POST bản ghi tới đây)')} value={form.webhookUrl} onChange={(e) => patch({ webhookUrl: e.target.value })} />
              )}
              {form.actionType === 'run_skill_set' && (
                <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 6 }}>
                  {skillSets.length === 0 ? (
                    <Alert
                      type="info"
                      showIcon
                      message={tr('chat.noSkillSets', 'Chưa kỹ năng nào khai hợp đồng')}
                      description={tr(
                        'chat.noSkillSetsHint',
                        'Mở màn hình Kỹ năng, sửa một kỹ năng và khai phần "Cần có trước / Sinh ra" — hoặc bấm "AI đề xuất" để nó điền giúp.',
                      )}
                    />
                  ) : (
                    <>
                      <Select
                        style={{ width: '100%' }}
                        value={form.skillSetId || undefined}
                        onChange={(v) => patch({ skillSetId: v, skillSeed: {}, skillWriteMap: {} })}
                        placeholder={tr('chat.pickSkillSetPh', 'Chọn một kỹ năng trong bộ — cả bộ tự suy ra theo dữ liệu')}
                        options={skillSets.map((x) => ({ value: x.id, label: x.name }))}
                      />
                      {!!form.skillSetId && (
                        <Text type="secondary" style={{ fontSize: 11.5 }}>
                          {tr('chat.setIs', 'Bộ này gồm: ')}
                          {setOf(form.skillSetId).map((c) => c.name).join(' · ')}
                        </Text>
                      )}
                      {form.triggerType === 'record' && !!setNeeds(form.skillSetId).length && (
                        <>
                          <Text style={{ fontSize: 12 }}>
                            {tr('chat.seedFrom', 'Lấy dữ liệu đầu vào từ dòng vừa kích hoạt:')}
                          </Text>
                          {setNeeds(form.skillSetId).map((k) => (
                            <Space.Compact key={k} style={{ width: '100%' }}>
                              <Input style={{ width: '45%' }} value={k} disabled />
                              <Input
                                style={{ width: '55%' }}
                                value={colFor(form.skillSeed, k)}
                                onChange={(e) => patch({ skillSeed: withCol(form.skillSeed, k, e.target.value) })}
                                placeholder={tr('chat.colNameOptional', 'tên cột — để trống thì kỹ năng tự tính')}
                              />
                            </Space.Compact>
                          ))}
                        </>
                      )}
                      <Select
                        style={{ width: '100%' }}
                        value={form.skillWriteBack}
                        onChange={(v) => patch({ skillWriteBack: v as FormModel['skillWriteBack'] })}
                        options={[
                          { value: 'target', label: tr('chat.wbTarget', 'Ghi vào bảng khai trong SKILL.md (target:)') },
                          { value: 'record', label: tr('chat.wbRecord', 'Cập nhật lại chính dòng đã kích hoạt') },
                          { value: 'none', label: tr('chat.wbNone', 'Không ghi — chỉ báo cáo') },
                        ]}
                      />
                      {form.skillWriteBack === 'record' && (
                        <>
                          <Text type="secondary" style={{ fontSize: 11.5 }}>
                            {tr('chat.writeMapHint', 'Khoá nào ghi vào cột nào. Để trống = không ghi khoá đó.')}
                          </Text>
                          {setProduces(form.skillSetId).map((k) => (
                            <Space.Compact key={k} style={{ width: '100%' }}>
                              <Input style={{ width: '45%' }} value={k} disabled />
                              <Input
                                style={{ width: '55%' }}
                                value={form.skillWriteMap[k] ?? ''}
                                onChange={(e) => {
                                  const m = { ...form.skillWriteMap };
                                  if (e.target.value.trim()) m[k] = e.target.value;
                                  else delete m[k];
                                  patch({ skillWriteMap: m });
                                }}
                                placeholder={tr('chat.colName', 'tên cột')}
                              />
                            </Space.Compact>
                          ))}
                        </>
                      )}
                      <Input
                        placeholder={tr('chat.agentPostChat', 'Gửi báo cáo vào nhóm Lark (chat_id) — để trống nếu không gửi')}
                        value={form.agentPostChatId}
                        onChange={(e) => patch({ agentPostChatId: e.target.value })}
                      />
                      <Checkbox checked={form.agentNotify} onChange={(e) => patch({ agentNotify: e.target.checked })}>
                        {tr('chat.agentNotify', 'Thông báo desktop')}
                      </Checkbox>
                      <Alert
                        type="info"
                        showIcon
                        message={tr(
                          'chat.skillSetSafety',
                          'Ràng buộc còn sai đến cuối thì KHÔNG ghi dòng nào — lịch sử chạy sẽ nói rõ sai cái gì. Khoá đã có sẵn trong dòng thì kỹ năng tương ứng được bỏ qua, không ghi đè.',
                        )}
                      />
                    </>
                  )}
                </Space>
              )}
              {form.actionType === 'run_agent' && (
                <Space direction="vertical" size={6} style={{ width: '100%', marginTop: 6 }}>
                  <Input.TextArea
                    placeholder={tr('chat.agentPromptPlaceholder', 'Câu lệnh cho AI agent, vd: "PBTTCN" — đối chiếu công nợ & báo cáo')}
                    value={form.agentPrompt}
                    onChange={(e) => patch({ agentPrompt: e.target.value })}
                    autoSize={{ minRows: 2, maxRows: 6 }}
                  />
                  <Input
                    placeholder={tr('chat.agentPostChat', 'Gửi báo cáo vào nhóm Lark (chat_id) — để trống nếu không gửi')}
                    value={form.agentPostChatId}
                    onChange={(e) => patch({ agentPostChatId: e.target.value })}
                  />
                  <Space size={16} wrap>
                    <Checkbox checked={form.agentWrite} onChange={(e) => patch({ agentWrite: e.target.checked })}>
                      {tr('chat.agentWrite', 'Cho phép ghi dữ liệu (thực thi)')}
                    </Checkbox>
                    <Checkbox checked={form.agentSave} onChange={(e) => patch({ agentSave: e.target.checked })}>
                      {tr('chat.agentSaveConv', 'Lưu vào hội thoại')}
                    </Checkbox>
                    <Checkbox checked={form.agentNotify} onChange={(e) => patch({ agentNotify: e.target.checked })}>
                      {tr('chat.agentNotify', 'Thông báo desktop')}
                    </Checkbox>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {form.agentWrite
                      ? tr(
                          'chat.agentWriteHint',
                          'Lịch chạy ở chế độ THỰC THI: thao tác cộng thêm (thêm bản ghi, đính tệp ghi thêm, tải lên Drive…) chạy ngay; ghi đè / thay tệp / gửi / xoá chỉ chạy khi được bật ở "Quyền khi chạy tự động" bên dưới. Mỗi lần chạy có biên bản (đọc gì, ghi gì, đọc lại, bị bỏ qua) trong lịch sử.',
                        )
                      : tr('chat.agentReadHint', 'Lịch chỉ ĐỌC: agent đọc dữ liệu và báo cáo, không thay đổi gì trong Lark.')}
                  </Text>
                  <AutomationFilesSection
                    runtime={runtime}
                    ruleId={form.id ?? form.draftId ?? ''}
                    value={form.files}
                    onChange={(files) => patch({ files, legacyPerms: form.legacyPerms && JSON.stringify(files.perms) === JSON.stringify(form.files.perms) })}
                    legacy={form.legacyPerms}
                    hostedOn={hostedOn}
                    prompt={form.agentPrompt}
                    writeMode={form.agentWrite}
                  />
                </Space>
              )}
            </div>

            <Space size={16} wrap>
              {(form.triggerType === 'record' || form.schedMode === 'interval') && (
                <span>
                  <Text strong style={{ fontSize: 12 }}>
                    {form.triggerType === 'schedule' ? tr('chat.runEverySec', 'Chạy mỗi (giây)') : tr('chat.checkCycleSec', 'Chu kỳ kiểm tra (giây)')}
                  </Text>{' '}
                  <InputNumber min={30} value={form.intervalSec} onChange={(v) => patch({ intervalSec: Number(v) || 60 })} />
                </span>
              )}
              <span>
                <Switch size="small" checked={form.enabled} onChange={(on) => patch({ enabled: on })} /> <Text style={{ fontSize: 12 }}>{tr('chat.onLabel', 'Bật')}</Text>
              </span>
              {form.triggerType === 'record' && (
                <span>
                  <Switch size="small" checked={form.fireExisting} onChange={(on) => patch({ fireExisting: on })} />{' '}
                  <Tooltip title={tr('chat.fireExistingTip', 'Bật: chạy cho cả bản ghi ĐANG khớp. Tắt: chỉ chạy cho bản ghi khớp SAU khi tạo quy tắc.')}>
                    <Text style={{ fontSize: 12 }}>{tr('chat.applyExisting', 'Áp dụng cả bản ghi hiện có')}</Text>
                  </Tooltip>
                </span>
              )}
            </Space>
          </Space>
        )}
      </Modal>
    </Card>
    </>
  );
}
