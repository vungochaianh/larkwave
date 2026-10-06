'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntApp, Alert, Button, Card, Collapse, Empty, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
  ApartmentOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BulbOutlined,
  EditOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  HolderOutlined,
  LinkOutlined,
  LockOutlined,
  NodeIndexOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  RollbackOutlined,
  SortAscendingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { LarkExtractResult, LarkSkillRunResult, LarkSkillSet, RuntimeAdapter, SkillInfo } from '@larkwave/core';
import { V } from '../theme';

// Màu TRẠNG THÁI, tách hẳn khỏi màu thương hiệu: "đạt / phải chạy lại / hỏng" phải đọc được bằng
// màu mà không cần đọc chữ, và không được lẫn với màu nhấn của nút.
const OK = '#16B98D';
const WARN = '#F59E0B';
const ERR = '#EF4444';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const { Text, Paragraph } = Typography;

/**
 * "Bộ kỹ năng" — các kỹ năng dính nhau về DỮ LIỆU, chạy theo kiểu kiểm chéo liên tục.
 *
 * Vì sao màn hình này tồn tại: khi 5-7 kỹ năng cùng làm một việc, chúng không chạy theo 1→7. Có
 * lượt là 3→1→2. Trước đây cả bộ bị đổ vào một prompt và mô hình tự xoay xở, nên không ai biết
 * bước nào đã xong, bước nào chạy khi chưa đủ dữ liệu, hay kết quả bước sau có chỏi bước trước.
 * Ở đây mỗi kỹ năng chạy một lượt riêng, và sau MỖI lượt mọi ràng buộc đủ dữ liệu được tính lại.
 *
 * Ba trạng thái ràng buộc, và đừng gộp chúng lại:
 *   đạt — đã tính, đúng.          sai — đã tính, sai.
 *   chưa kiểm được — CHƯA tính. Hiện nó ra là cố ý: gộp vào "đạt" là nói dối người dùng.
 */
export function SkillSetsCard({ runtime, onSkillsChanged, onAskAI }: { runtime: RuntimeAdapter; onSkillsChanged?: () => void; onAskAI?: (prompt: string) => void }) {
  const { message } = AntApp.useApp();
  const [sets, setSets] = useState<LarkSkillSet[] | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  // Hướng dẫn có hộp RIÊNG. Trước đây nó đổ thẳng vào `log` — tức là chiếm chỗ ô kết quả chạy, và
  // bị xoá sạch ngay lần chạy sau. Người đang đọc cách khai báo thì thường chưa chạy được gì, nên
  // vừa đọc vừa mất là đúng lúc khó chịu nhất.
  const [helpOpen, setHelpOpen] = useState(false);
  const [result, setResult] = useState<LarkSkillRunResult | null>(null);
  const [extract, setExtract] = useState<LarkExtractResult | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setSets((await runtime.larkListSkillSets?.()) ?? []);
    } catch {
      setSets([]);
    }
  }, [runtime]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tiến trình bắn về từ tiến trình chính. Một lượt chạy bộ mất nhiều phút; không có dòng chảy
  // này thì người dùng chỉ thấy nút quay và không biết đang kẹt ở kỹ năng nào.
  useEffect(() => {
    const off = runtime.onLarkSkillSetEvent?.((raw) => {
      const e = raw as Record<string, unknown>;
      const line = describe(e);
      if (line) setLog((l) => [...l.slice(-200), line]);
    });
    return () => off?.();
  }, [runtime]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const run = async (s: LarkSkillSet, mode: 'ask' | 'build') => {
    setRunning(s.id);
    setLog([]);
    setResult(null);
    try {
      setResult(await runtime.larkRunSkillSet!(s.id, undefined, mode));
    } catch (e) {
      message.error((e as Error)?.message || 'Không chạy được bộ kỹ năng.');
    } finally {
      setRunning(null);
      // Nạp lại để lượt vừa chạy xuất hiện trong lịch sử ngay. Chạy cả khi lỗi: một lượt hỏng
      // giữa chừng vẫn được ghi, và đó chính là lượt đáng xem nhất.
      void load();
    }
  };

  const doExtract = async (s: LarkSkillSet, dryRun: boolean) => {
    setRunning(s.id);
    setLog([]);
    setResult(null);
    setExtract(null);
    try {
      const r = await runtime.larkExtractToTable!(s.id, dryRun);
      if (!r) return; // người dùng huỷ hộp chọn tệp — không phải lỗi
      setExtract(r);
      if (!dryRun) message.success(`Đã ghi ${r.written} dòng vào bảng "${r.table}".`);
    } catch (e) {
      message.error((e as Error)?.message || 'Không trích xuất được.');
    } finally {
      setRunning(null);
      void load();
    }
  };

  if (!sets) return null;
  // Chưa ai khai hợp đồng ⇒ không có bộ nào. Vẫn hiện thẻ kèm hướng dẫn, vì nếu ẩn hẳn thì người
  // dùng không có cách nào biết tính năng này tồn tại.
  const hasAny = sets.length > 0;


  return (
    <Card
      size="small"
      // Thẻ này nằm NGAY DƯỚI lưới thẻ kỹ năng nên cần khoảng hở trên; trước khi chuyển xuống đây
      // nó đứng đầu danh sách nên chỉ có lề dưới, và sau khi chuyển thì dính sát vào lưới.
      style={{ marginTop: 20, marginBottom: 14 }}
      title={
        <Space>
          <NodeIndexOutlined />
          <span>Bộ kỹ năng — kiểm chéo liên tục</span>
          {hasAny ? <Tag color="blue">{sets.length}</Tag> : null}
        </Space>
      }
      extra={
        <Tooltip title="Cách khai báo">
          <Button type="text" shape="circle" icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)} />
        </Tooltip>
      }
    >
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        Khi nhiều kỹ năng cùng làm một việc, chúng không chạy theo thứ tự bạn viết. Khai báo{' '}
        <Text code>needs</Text> / <Text code>produces</Text> / <Text code>checks</Text> trong SKILL.md thì{' '}
        <b>thứ tự tự suy ra từ dữ liệu</b>, và sau mỗi bước máy tính lại mọi ràng buộc — mâu thuẫn lộ ngay
        tại bước gây ra nó, không phải ở cuối.
      </Paragraph>

      {!hasAny ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span style={{ color: V.textSub }}>
              Chưa kỹ năng nào khai hợp đồng. Bấm dấu hỏi ở trên để xem cách viết.
            </span>
          }
        />
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {(sets ?? []).map((s) => (
            <SetRow
              key={s.id}
              s={s}
              busy={!!running}
              running={running === s.id}
              runtime={runtime}
              onAskAI={onAskAI}
              onRun={(mode) => void run(s, mode)}
              onExtract={(dry) => void doExtract(s, dry)}
              onChanged={() => {
                // Nạp lại CẢ hai: thẻ này VÀ lưới kỹ năng phía trên. Bật/tắt một kỹ năng mà lưới
                // vẫn hiện "Đang bật" thì người dùng không có cách nào biết thao tác đã ăn.
                void load();
                onSkillsChanged?.();
              }}
            />
          ))}
          <KeyWiring sets={sets ?? []} />
        </Space>
      )}

      {log.length ? (
        <div
          ref={logRef}
          style={{
            marginTop: 12,
            maxHeight: 220,
            overflowY: 'auto',
            background: V.codeBg,
            color: V.codeText,
            border: `1px solid ${V.codeBorder}`,
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          {log.join('\n')}
        </div>
      ) : null}

      {result ? <RunResult result={result} /> : null}
      {extract ? <ExtractResult r={extract} /> : null}

      <Modal
        open={helpOpen}
        onCancel={() => setHelpOpen(false)}
        footer={null}
        width={680}
        title="Cách khai hợp đồng cho kỹ năng"
      >
        <div style={{ fontSize: 12.5, color: V.textSub, marginBottom: 10, lineHeight: 1.6 }}>
          Khai xong thì <b>không cần đánh số bước</b> — thứ tự chạy tự suy ra từ dữ liệu, và sau mỗi bước
          máy tính lại mọi ràng buộc.
        </div>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 8,
            background: V.layer,
            border: `1px solid ${V.border}`,
            color: V.text,
            fontSize: 12,
            lineHeight: 1.6,
            // Hướng dẫn dài hơn màn hình thì cuộn TRONG hộp, để nút đóng luôn bấm được.
            maxHeight: '60vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {HELP.join('\n')}
        </pre>
        <div style={{ fontSize: 12, color: V.textFaint, marginTop: 10, lineHeight: 1.6 }}>
          Không muốn gõ tay: mở một kỹ năng ở dưới rồi bấm <b>AI đề xuất</b>, hoặc bảo thẳng trợ lý Lark
          &ldquo;tạo bộ kỹ năng …&rdquo; — nó tự khai giúp.
        </div>
      </Modal>
    </Card>
  );
}



/** Đổi chỗ hai phần tử, trả về mảng MỚI — state React không được sửa tại chỗ. */
function swap(ids: string[], a: number, b: number): string[] {
  const out = [...ids];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** Vòng tròn một bước trong lịch sử: màu nói ngay kết quả, bấm ra chi tiết. */
const DOT: Record<string, { c: string; label: string }> = {
  ok: { c: OK, label: 'Xong' },
  err: { c: ERR, label: 'Hỏng' },
  retry: { c: WARN, label: 'Phải chạy lại' },
  skip: { c: V.textFaint, label: 'Bỏ qua' },
};

/**
 * MỘT BỘ = MỘT HÀNG GỌN + hai ngăn mở ra.
 *
 * Trước đây mỗi bộ trải hết ra màn hình: chuỗi kỹ năng, cảnh báo, lịch sử — bốn bộ là phải cuộn rất
 * lâu mới nhìn hết. Nhìn lướt thì người dùng chỉ cần biết CÓ BAO NHIÊU BỘ và BỘ NÀO VỪA HỎNG; chi
 * tiết thì mở đúng ngăn cần xem.
 */
function SetRow({
  s,
  busy,
  running,
  runtime,
  onAskAI,
  onRun,
  onExtract,
  onChanged,
}: {
  s: LarkSkillSet;
  busy: boolean;
  running: boolean;
  runtime: RuntimeAdapter;
  onAskAI?: (prompt: string) => void;
  onRun: (mode: 'ask' | 'build') => void;
  onExtract: (dryRun: boolean) => void;
  onChanged: () => void;
}) {
  const { message } = AntApp.useApp();
  const [pane, setPane] = useState<'' | 'skills' | 'hist'>('');
  const [detail, setDetail] = useState<React.ReactNode>(null);
  /** Bản lưu của kỹ năng đang mở — nạp khi bấm, không nạp sẵn cả bộ (đa số lần không ai xem). */
  const [saves, setSaves] = useState<Record<string, { at: string; by: 'you' | 'ai'; what: string }[]>>({});
  const [openSaves, setOpenSaves] = useState<string | null>(null);
  /**
   * Chế độ SỬA. Vào chế độ này là TẮT mọi kỹ năng trong bộ.
   *
   * Vì sao phải tắt: lịch tự động có thể nổ bất cứ lúc nào, và chạy một bộ đang sửa dở là ghi dữ
   * liệu sai vào Base thật. Sửa xong mới bật lại.
   *
   * `wasOn` nhớ kỹ năng nào VỐN đang bật. Lưu xong bật lại đúng những cái đó — bật hết là tự ý bật
   * cả kỹ năng người dùng đã cố tình tắt từ trước.
   */
  const [editing, setEditing] = useState(false);
  const [wasOn, setWasOn] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Thứ tự đang kéo — chỉ tồn tại trong chế độ sửa, chưa ghi cho tới khi bấm Lưu. */
  const [order, setOrder] = useState<string[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  /** Kỹ năng ngoài bộ + khoá muốn nối. Nạp khi mở modal, không nạp sẵn. */
  const [allSkills, setAllSkills] = useState<SkillInfo[] | null>(null);
  const [linkTo, setLinkTo] = useState<string | undefined>();
  const [linkKeys, setLinkKeys] = useState<string[]>([]);

  const openLink = () => {
    setLinkOpen(true);
    setLinkTo(undefined);
    setLinkKeys([]);
    if (!allSkills) void runtime.listSkills?.().then(setAllSkills).catch(() => setAllSkills([]));
  };

  /**
   * NỐI THẬT: thêm khoá của bộ này vào `needs` của kỹ năng kia.
   *
   * Nối bằng KHOÁ chứ không bằng một danh sách thành viên — vì "cùng một bộ" trong động cơ CÓ NGHĨA
   * LÀ dùng chung khoá. Ghi một danh sách thành viên riêng là tạo ra sự thật thứ hai, và nó sẽ lệch
   * với khoá ngay lần sửa kỹ năng đầu tiên.
   *
   * GIỮ NGUYÊN produces/checks/target của kỹ năng kia: `contract` là thay thế toàn bộ, nên gửi
   * thiếu một trường là xoá mất nó.
   */
  const doLink = async () => {
    const target = (allSkills ?? []).find((x) => x.id === linkTo);
    if (!target || !linkKeys.length) return;
    setSaving(true);
    try {
      const cur = target.contract ?? {};
      await runtime.updateSkill!(target.id, {
        contract: {
          ...cur,
          needs: [...new Set([...(cur.needs ?? []), ...linkKeys])],
        },
      });
      message.success(`Đã nối "${target.name}" vào bộ qua ${linkKeys.join(', ')}.`);
      setLinkOpen(false);
      setAllSkills(null);
      onChanged();
    } catch (e) {
      message.error((e as Error)?.message || 'Không nối được.');
    } finally {
      setSaving(false);
    }
  };

  const enterEdit = async () => {
    const on = nodes.filter((n) => n.enabled).map((n) => n.id);
    setSaving(true);
    try {
      for (const id of on) await runtime.setSkillEnabled!(id, false);
      setWasOn(on);
      setEditing(true);
      onChanged();
    } catch (e) {
      message.error((e as Error)?.message || 'Không tắt được kỹ năng để sửa.');
    } finally {
      setSaving(false);
    }
  };

  /** Thoát chế độ sửa. `turnOn` = bật lại đúng những kỹ năng vốn đang bật. */
  const leaveEdit = async (turnOn: boolean) => {
    setSaving(true);
    try {
      // Ghi thứ tự TRƯỚC khi bật lại: bật xong mới sắp thì có một khoảnh khắc bộ đã sống mà thứ
      // tự còn cũ — đúng lúc một lịch tự động có thể nổ.
      if (order && runtime.reorderSkills) await runtime.reorderSkills(order);
      if (turnOn) for (const id of wasOn) await runtime.setSkillEnabled!(id, true);
      setEditing(false);
      setWasOn([]);
      setOrder(null);
      onChanged();
      message.success(turnOn ? 'Đã lưu và bật lại bộ.' : 'Đã lưu. Bộ vẫn đang tắt — bật lại khi cần.');
    } catch (e) {
      message.error((e as Error)?.message || 'Không bật lại được.');
    } finally {
      setSaving(false);
    }
  };

  const loadSaves = (id: string) => {
    if (openSaves === id) {
      setOpenSaves(null);
      return;
    }
    setOpenSaves(id);
    if (saves[id]) return;
    void runtime
      .skillSnapshots?.(id)
      .then((v) => setSaves((cur) => ({ ...cur, [id]: v })))
      .catch(() => setSaves((cur) => ({ ...cur, [id]: [] })));
  };

  const doRestore = async (id: string, at: string) => {
    try {
      await runtime.restoreSkill!(id, at);
      message.success('Đã khôi phục. Bản trước khi khôi phục cũng được lưu lại.');
      setSaves((cur) => ({ ...cur, [id]: [] }));
      setOpenSaves(null);
      onChanged();
    } catch (e) {
      message.error((e as Error)?.message || 'Không khôi phục được.');
    }
  };
  const runs = s.runs ?? [];
  const nodes = s.nodes ?? [];
  const last = runs[0];
  const lastBad = !!last && (last.failing.length > 0 || last.blocked.length > 0);

  const open = (p: 'skills' | 'hist') => {
    setDetail(null);
    setPane((cur) => (cur === p ? '' : p));
  };

  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 12, background: V.surface, overflow: 'hidden' }}>
      {/* Hàng gọn: tên + tiền tố khoá + bốn nút. Không gì khác. */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{s.members[s.members.length - 1] ?? s.name}</span>
            {s.ns ? (
              <Tag color="purple" style={{ marginInlineEnd: 0, fontFamily: MONO, fontSize: 11 }}>
                {s.ns}*
              </Tag>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: V.textFaint, marginTop: 2 }}>
            {nodes.length || s.members.length} kỹ năng
            {runs.length ? ` · ${runs.length} lượt đã chạy` : ' · chưa chạy lần nào'}
            {lastBad ? <span style={{ color: ERR }}> · lượt gần nhất chưa trọn bộ</span> : null}
          </div>
        </div>
        <Space.Compact>
          <Tooltip title="Đọc dữ liệu, tính toán, kiểm ràng buộc — KHÔNG ghi gì vào Base">
            <Button icon={<PlayCircleOutlined />} loading={running} disabled={busy} onClick={() => onRun('ask')}>
              Chạy thử
            </Button>
          </Tooltip>
          <Popconfirm
            title="Chạy thật — được ghi vào Base"
            description="Các thao tác ghi sẽ được TỰ DUYỆT, không hỏi lại từng cái. Nên chạy thử trước."
            okText="Chạy thật"
            cancelText="Thôi"
            onConfirm={() => onRun('build')}
          >
            <Button danger icon={<ThunderboltOutlined />} disabled={busy}>
              Chạy thật
            </Button>
          </Popconfirm>
        </Space.Compact>
        <Space.Compact>
          <Button
            icon={<HistoryOutlined />}
            type={pane === 'hist' ? 'primary' : 'default'}
            ghost={pane === 'hist'}
            onClick={() => open('hist')}
          >
            Lịch sử{runs.length ? ` (${runs.length})` : ''}
          </Button>
          <Button
            icon={<ApartmentOutlined />}
            type={pane === 'skills' ? 'primary' : 'default'}
            ghost={pane === 'skills'}
            onClick={() => open('skills')}
          >
            Skills ({nodes.length || s.members.length})
          </Button>
        </Space.Compact>
      </div>

      {pane === 'skills' ? (
        <div style={{ borderTop: `1px solid ${V.border}`, padding: '12px 14px', background: V.layer }}>
          {editing ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 10 }}
              message="Đang sửa — bộ này đã tắt"
              description="Lịch tự động sẽ không chạy nó cho tới khi bạn bật lại. Sửa xong chọn một trong hai nút bên dưới."
            />
          ) : null}
          <Space size={6} wrap style={{ marginBottom: 10 }}>
            {!editing ? (
              <>
                <Button size="small" icon={<EditOutlined />} loading={saving} onClick={() => void enterEdit()}>
                  Sửa bộ
                </Button>
                <Text type="secondary" style={{ fontSize: 11.5 }}>
                  Bấm để tắt bộ rồi sửa — tránh lịch tự động nổ giữa lúc sửa dở.
                </Text>
              </>
            ) : (
              <>
                <Button size="small" icon={<LinkOutlined />} onClick={openLink}>
                  Nối skill vào bộ
                </Button>
                <Button
                  size="small"
                  icon={<SortAscendingOutlined />}
                  type={order ? 'primary' : 'default'}
                  ghost={!!order}
                  onClick={() => setOrder(order ? null : nodes.map((n) => n.id))}
                >
                  {order ? 'Xong đổi thứ tự' : 'Đổi thứ tự'}
                </Button>
                <Tooltip title="Mở hội thoại mới với Trợ lý Lark, điền sẵn yêu cầu — bạn đọc lại rồi mới gửi">
                  <Button
                    size="small"
                    icon={<BulbOutlined />}
                    disabled={!onAskAI}
                    onClick={() =>
                      onAskAI?.(
                        [
                          `Rà lại bộ kỹ năng "${s.members.join(' → ')}" và thiết kế lại cho đúng.`,
                          '',
                          'Các kỹ năng trong bộ và khoá của chúng:',
                          ...nodes.map(
                            (n) =>
                              `- ${n.name} — cần: [${n.needs.join(', ') || 'không'}] → sinh ra: [${n.produces.join(', ')}]` +
                              (n.checks.length ? ` — ràng buộc: ${n.checks.join('; ')}` : ''),
                          ),
                          ...(s.issues.length ? ['', 'Vấn đề đang có:', ...s.issues.map((i) => `- ${i}`)] : []),
                          ...(last && (last.failing.length || last.blocked.length)
                            ? [
                                '',
                                'Lượt chạy gần nhất chưa trọn bộ:',
                                ...last.failing.map((f) => `- ràng buộc còn sai: ${f}`),
                                ...last.blocked.map((b) => `- không chạy được: ${b}`),
                              ]
                            : []),
                          '',
                          'Hãy gọi list_skills trước để dùng lại đúng tên khoá, rồi dùng update_skill / create_skill',
                          'để sửa. Nói rõ bạn định đổi gì trước khi đổi.',
                        ].join('\n'),
                      )
                    }
                  >
                    Nhờ AI thiết kế lại bộ
                  </Button>
                </Tooltip>
                <Button size="small" type="primary" loading={saving} onClick={() => void leaveEdit(true)}>
                  Lưu & bật lại
                </Button>
                <Button size="small" loading={saving} onClick={() => void leaveEdit(false)}>
                  Lưu, vẫn để tắt
                </Button>
              </>
            )}
          </Space>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {(order ? order.map((id) => nodes.find((x) => x.id === id)!).filter(Boolean) : nodes).map((n, i, arr) => {
              const forced = n.after.length > 0;
              return (
                <div
                  key={n.id}
                  style={{
                    border: `1px solid ${forced ? V.border : V.borderSub}`,
                    borderLeft: `3px solid ${forced ? WARN : V.borderSub}`,
                    borderRadius: 9,
                    padding: '8px 10px',
                    background: V.surface,
                  }}
                >
                  <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Tooltip title={forced ? 'Thứ tự bị khoá bởi dữ liệu — đổi cũng không ăn' : 'Tự do đổi chỗ'}>
                      <span style={{ color: forced ? WARN : V.textFaint, display: 'inline-flex' }}>
                        {forced ? <LockOutlined /> : <HolderOutlined />}
                      </span>
                    </Tooltip>
                    {order && !forced ? (
                      <Space.Compact size="small">
                        <Button
                          size="small"
                          icon={<ArrowUpOutlined />}
                          disabled={i === 0}
                          onClick={() => setOrder(swap(arr.map((x) => x.id), i, i - 1))}
                        />
                        <Button
                          size="small"
                          icon={<ArrowDownOutlined />}
                          disabled={i === arr.length - 1}
                          onClick={() => setOrder(swap(arr.map((x) => x.id), i, i + 1))}
                        />
                      </Space.Compact>
                    ) : null}
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: MONO,
                        fontSize: 11,
                        border: `1px solid ${V.borderSub}`,
                        color: V.textSub,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 160, fontSize: 13, fontWeight: 500, opacity: n.enabled ? 1 : 0.55 }}>
                      {n.name}
                      {!n.enabled ? (
                        <Tag style={{ marginLeft: 6, marginInlineEnd: 0 }} color="default">
                          đang tắt
                        </Tag>
                      ) : null}
                    </span>
                    <Space size={4} wrap>
                      {n.needs.slice(0, 1).map((k) => (
                        <Tag key={k} color="blue" style={{ marginInlineEnd: 0, fontFamily: MONO, fontSize: 10.5 }}>
                          <ArrowDownOutlined /> {k}
                        </Tag>
                      ))}
                      {n.produces.slice(0, 1).map((k) => (
                        <Tag key={k} color="green" style={{ marginInlineEnd: 0, fontFamily: MONO, fontSize: 10.5 }}>
                          <ArrowUpOutlined /> {k}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                  <div style={{ fontSize: 11.5, color: forced ? WARN : V.textFaint, marginTop: 4, paddingLeft: 31 }}>
                    {forced
                      ? `Thứ tự bị ép: cần khoá do ${n.after.join(', ')} sinh ra — kéo cũng không đổi được.`
                      : 'Tự do đổi chỗ: không cần khoá của ai, đứng đâu cũng ra kết quả như nhau.'}
                  </div>
                  {n.checks.length ? (
                    <div style={{ fontSize: 11.5, color: V.textSub, marginTop: 3, paddingLeft: 31, fontFamily: MONO, overflowWrap: 'anywhere' }}>
                      ràng buộc: {n.checks.join(' · ')}
                    </div>
                  ) : null}
                  {runtime.skillSnapshots ? (
                    <div style={{ paddingLeft: 27, marginTop: 4 }}>
                      <Button
                        type="link"
                        size="small"
                        icon={<RollbackOutlined />}
                        style={{ paddingInline: 0, height: 'auto', fontSize: 11.5 }}
                        onClick={() => loadSaves(n.id)}
                      >
                        {openSaves === n.id ? 'Ẩn bản lưu' : 'Bản lưu'}
                      </Button>
                      {openSaves === n.id ? (
                        <div style={{ marginTop: 4 }}>
                          {(saves[n.id] ?? []).length ? (
                            (saves[n.id] ?? []).map((v) => (
                              <div
                                key={v.at}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, padding: '3px 0' }}
                              >
                                <span style={{ fontFamily: MONO, color: V.textFaint }}>
                                  {new Date(v.at).toLocaleString('vi-VN')}
                                </span>
                                <Tag color={v.by === 'ai' ? 'purple' : 'default'} style={{ marginInlineEnd: 0 }}>
                                  {v.by === 'ai' ? 'AI sửa' : 'bạn sửa'}
                                </Tag>
                                <span style={{ color: V.textSub, flex: 1, minWidth: 120 }}>{v.what}</span>
                                <Popconfirm
                                  title="Khôi phục bản này?"
                                  description="Nội dung hiện tại sẽ được lưu lại trước, nên lùi nhầm vẫn tiến lại được."
                                  okText="Khôi phục"
                                  cancelText="Thôi"
                                  onConfirm={() => void doRestore(n.id, v.at)}
                                >
                                  <Button size="small" type="link" style={{ paddingInline: 0, height: 'auto', fontSize: 11.5 }}>
                                    Khôi phục
                                  </Button>
                                </Popconfirm>
                              </div>
                            ))
                          ) : (
                            <Text type="secondary" style={{ fontSize: 11.5 }}>
                              Chưa có bản lưu — kỹ năng này chưa bị sửa lần nào kể từ khi tạo.
                            </Text>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </Space>
          {s.target ? (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                Đọc tệp → ghi vào bảng <Text code>{s.target}</Text>:
              </Text>
              <Button size="small" icon={<FileSearchOutlined />} disabled={busy} onClick={() => onExtract(true)}>
                Chọn tệp & xem thử
              </Button>
              <Popconfirm
                title="Trích xuất rồi GHI vào bảng"
                description="Chỉ những dòng qua được mọi ràng buộc mới được ghi."
                okText="Ghi"
                cancelText="Thôi"
                onConfirm={() => onExtract(false)}
              >
                <Button size="small" danger disabled={busy}>
                  Chọn tệp & ghi
                </Button>
              </Popconfirm>
            </div>
          ) : null}
          {s.issues.length ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 10 }}
              message="Bộ này sẽ dừng giữa chừng"
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {s.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              }
            />
          ) : null}
        </div>
      ) : null}

      <Modal
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
        onOk={() => void doLink()}
        okText="Nối"
        cancelText="Thôi"
        okButtonProps={{ disabled: !linkTo || !linkKeys.length, loading: saving }}
        width={580}
        title="Nối một kỹ năng vào bộ này"
      >
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          Hai kỹ năng thuộc cùng một bộ khi chúng <b>dùng chung khoá</b> — không phải khi bạn xếp chúng
          cạnh nhau. Nối ở đây nghĩa là: cho kỹ năng kia <b>cần</b> một khoá mà bộ này sinh ra.
        </Paragraph>

        <Text style={{ fontSize: 12.5, display: 'block', margin: '10px 0 4px' }}>Kỹ năng muốn nối vào:</Text>
        <Select
          style={{ width: '100%' }}
          value={linkTo}
          onChange={(v) => setLinkTo(v)}
          loading={!allSkills}
          placeholder="Chọn một kỹ năng chưa thuộc bộ này"
          options={(allSkills ?? [])
            .filter((x) => !nodes.some((n) => n.id === x.id))
            .map((x) => ({ value: x.id, label: x.name }))}
        />

        <Text style={{ fontSize: 12.5, display: 'block', margin: '12px 0 4px' }}>
          Khoá nó sẽ nhận từ bộ này:
        </Text>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          value={linkKeys}
          onChange={setLinkKeys}
          placeholder="Chọn một hoặc vài khoá"
          options={(s.produces ?? []).map((k) => ({ value: k, label: k }))}
        />

        {linkTo ? (
          <Alert
            style={{ marginTop: 12 }}
            type="info"
            showIcon
            message="Sau khi nối"
            description={
              <div style={{ fontSize: 12.5 }}>
                Kỹ năng đó sẽ luôn chạy <b>sau</b> các bước sinh ra {linkKeys.length ? <code>{linkKeys.join(', ')}</code> : 'khoá đã chọn'} —
                vì chưa đủ khoá thì chưa chạy được. Nhớ sửa nội dung kỹ năng để nó <b>dùng</b> các khoá này,
                nếu không nó sẽ nhận khoá rồi bỏ qua.
                <div style={{ marginTop: 6, color: V.textFaint }}>
                  Hợp đồng cũ của nó (produces / ràng buộc) được giữ nguyên, và có bản lưu để lùi.
                </div>
              </div>
            }
          />
        ) : null}
      </Modal>

      {pane === 'hist' ? (
        <div style={{ borderTop: `1px solid ${V.border}`, padding: '12px 14px', background: V.layer }}>
          {runs.length ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {runs.map((r, ri) => (
                <div key={`${r.at}-${ri}`} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: V.textFaint, minWidth: 150 }}>
                    {new Date(r.at).toLocaleString('vi-VN')} · {Math.max(1, Math.round(r.ms / 1000))}s
                  </span>
                  <Tag color={r.mode === 'build' ? 'red' : 'default'} style={{ marginInlineEnd: 0 }}>
                    {r.mode === 'build' ? 'chạy thật' : 'chạy thử'}
                  </Tag>
                  <Space size={5} wrap>
                    {r.steps.map((st, si) => {
                      const kind = st.failed ? 'err' : st.skipped ? 'skip' : st.broke.length || st.attempt > 1 ? 'retry' : 'ok';
                      const d = DOT[kind];
                      return (
                        <Tooltip key={si} title={`${si + 1}. ${st.name} — ${d.label}`}>
                          <button
                            type="button"
                            onClick={() =>
                              setDetail(
                                <div style={{ marginTop: 4 }}>
                                  <Text strong style={{ fontSize: 13 }}>
                                    {si + 1}. {st.name}
                                  </Text>
                                  <div style={{ fontSize: 12.5, color: V.textSub, marginTop: 4 }}>
                                    Kết quả: <span style={{ color: d.c }}>{d.label}</span>
                                  </div>
                                  {st.produced.length ? (
                                    <div style={{ fontSize: 12.5, color: V.textSub, marginTop: 2, fontFamily: MONO, overflowWrap: 'anywhere' }}>
                                      Khoá sinh ra: {st.produced.join(', ')}
                                    </div>
                                  ) : null}
                                  {st.failed ? (
                                    <div style={{ fontSize: 12.5, color: ERR, marginTop: 2 }}>Vì sao: {st.failed}</div>
                                  ) : null}
                                  {st.broke.length ? (
                                    <div style={{ fontSize: 12.5, color: ERR, marginTop: 2 }}>
                                      Làm gãy: {st.broke.join('; ')} → bị bắt chạy lại
                                    </div>
                                  ) : null}
                                </div>,
                              )
                            }
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              border: `1.5px solid ${d.c}`,
                              background: `${d.c}1F`,
                              color: d.c,
                              fontFamily: MONO,
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'grid',
                              placeItems: 'center',
                              padding: 0,
                            }}
                          >
                            {si + 1}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </Space>
                  <Tag color={r.failing.length || r.blocked.length ? 'red' : 'green'} style={{ marginInlineEnd: 0, marginLeft: 'auto' }}>
                    {r.failing.length || r.blocked.length ? 'chưa trọn bộ' : 'xong'}
                  </Tag>
                </div>
              ))}
            </Space>
          ) : (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Chưa chạy lần nào. Chạy xong, chỗ này ghi lại <b>thứ tự thật</b> các kỹ năng đã chạy và bước nào
              hỏng vì sao.
            </Text>
          )}
          {detail}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Khoá đang treo và khoá chưa ai dùng — tính từ chính các bộ, không gõ tay.
 *
 * Đây là thứ trước nay hoàn toàn không có: muốn nối hai kỹ năng, người dùng phải tự nhớ tên khoá rồi
 * gõ lại cho khớp. Lệch một ký tự là hai kỹ năng không bao giờ gặp nhau, và KHÔNG có gì báo.
 */
function KeyWiring({ sets }: { sets: LarkSkillSet[] }) {
  const allIn = new Set<string>();
  const allOut = new Set<string>();
  const owner: Record<string, string> = {};
  for (const s of sets)
    for (const n of s.nodes ?? []) {
      for (const k of n.needs) allIn.add(k);
      for (const k of n.produces) {
        allOut.add(k);
        owner[k] = n.name;
      }
    }
  const free = [...allIn].filter((k) => !allOut.has(k));
  if (!free.length) return null;
  return (
    <Alert
      type="warning"
      showIcon
      message={`${free.length} khoá đang chờ người sinh ra`}
      description={
        <div>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}>
            Có kỹ năng CẦN nhưng chưa kỹ năng nào làm ra — bộ chứa nó sẽ dừng giữa chừng.
          </div>
          <Space size={4} wrap>
            {free.map((k) => (
              <Tag key={k} style={{ marginInlineEnd: 0, fontFamily: MONO, fontSize: 11 }}>
                {k}
              </Tag>
            ))}
          </Space>
        </div>
      }
    />
  );
}

function RunResult({ result }: { result: LarkSkillRunResult }) {
  const failing = result.checks.filter((c) => c.verdict === 'fail');
  const unknown = result.checks.filter((c) => c.verdict === 'unknown');
  const passing = result.checks.filter((c) => c.verdict === 'pass');
  return (
    <div style={{ marginTop: 12 }}>
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag color="green">{passing.length} đạt</Tag>
        <Tag color={failing.length ? 'red' : 'default'}>{failing.length} sai</Tag>
        {/* "Chưa kiểm được" phải hiện riêng — gộp vào "đạt" là nói dối người dùng. */}
        <Tag color={unknown.length ? 'orange' : 'default'}>{unknown.length} chưa kiểm được</Tag>
        <Text type="secondary">đã chạy: {result.ran.join(' → ') || '(không kỹ năng nào)'}</Text>
      </Space>

      {failing.length ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message="Còn mâu thuẫn chưa giải quyết"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {failing.map((c) => (
                <li key={`${c.owner}${c.raw}`}>
                  <Text code>{c.raw}</Text> — {c.reason} <Text type="secondary">({c.owner})</Text>
                </li>
              ))}
            </ul>
          }
        />
      ) : null}

      {result.blocked.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message="Có kỹ năng không chạy được"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {result.blocked.map((b) => (
                <li key={b.name}>
                  <b>{b.name}</b>:{' '}
                  {b.nobodyProduces.length
                    ? `thiếu ${b.nobodyProduces.join(', ')} — không kỹ năng nào trong bộ sinh ra, phải cung cấp từ ngoài`
                    : `chờ ${b.missing.join(', ')}`}
                </li>
              ))}
            </ul>
          }
        />
      ) : null}

      <Collapse
        size="small"
        items={[
          {
            key: 'facts',
            label: `Dữ liệu thu được (${Object.keys(result.facts).length} khoá)`,
            children: (
              <Table
                size="small"
                pagination={false}
                rowKey="k"
                columns={[
                  { title: 'Khoá', dataIndex: 'k', width: 200 },
                  { title: 'Giá trị', dataIndex: 'v' },
                ]}
                dataSource={Object.entries(result.facts).map(([k, v]) => ({ k, v: String(v) }))}
              />
            ),
          },
          {
            key: 'checks',
            label: `Tất cả ràng buộc (${result.checks.length})`,
            children: (
              <Table
                size="small"
                pagination={false}
                rowKey={(r) => `${r.owner}${r.raw}`}
                columns={[
                  {
                    title: '',
                    dataIndex: 'verdict',
                    width: 120,
                    render: (v: string) =>
                      v === 'pass' ? <Tag color="green">đạt</Tag> : v === 'fail' ? <Tag color="red">SAI</Tag> : <Tag color="orange">chưa kiểm</Tag>,
                  },
                  { title: 'Ràng buộc', dataIndex: 'raw', render: (t: string) => <Text code>{t}</Text> },
                  { title: 'Vì sao', dataIndex: 'reason' },
                  { title: 'Của kỹ năng', dataIndex: 'owner', width: 160 },
                ]}
                dataSource={result.checks}
              />
            ),
          },
        ]}
      />
    </div>
  );
}

function ExtractResult({ r }: { r: LarkExtractResult }) {
  const bad = r.rows.filter((x) => x.failing.length);
  const keys = [...new Set(r.rows.flatMap((x) => Object.keys(x.facts)))];
  return (
    <div style={{ marginTop: 12 }}>
      <Space wrap style={{ marginBottom: 8 }}>
        <Tag color="green">{r.wouldWrite} dòng sạch</Tag>
        <Tag color={bad.length ? 'red' : 'default'}>{bad.length} dòng bị chặn</Tag>
        <Text type="secondary">
          bảng đích: <Text code>{r.table}</Text>
          {r.base ? ` (Base ${r.base})` : ''} · {r.written ? `đã ghi ${r.written}` : 'chưa ghi (xem thử)'}
        </Text>
      </Space>

      {bad.length ? (
        // Đây là giá trị lớn nhất của cả tính năng: dòng sai bị CHẶN trước khi vào Base, và nói
        // rõ sai ở đâu để người dùng sửa chứng từ gốc thay vì đi dọn bảng sau.
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={`${bad.length} tệp không được ghi vì chưa qua ràng buộc`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {bad.map((x) => (
                <li key={x.file}>
                  <b>{x.file}</b>: {x.failing.join('; ')}
                  {x.blocked.length ? ` · kỹ năng dừng: ${x.blocked.join(', ')}` : ''}
                </li>
              ))}
            </ul>
          }
        />
      ) : null}

      <Table
        size="small"
        pagination={false}
        scroll={{ x: true }}
        rowKey="file"
        columns={[
          {
            title: 'Tệp',
            dataIndex: 'file',
            fixed: 'left' as const,
            render: (f: string, row: LarkExtractResult['rows'][number]) => (
              <Space size={6}>
                {row.failing.length ? <Tag color="red">chặn</Tag> : <Tag color="green">sạch</Tag>}
                <Text style={{ fontSize: 12.5 }}>{f}</Text>
              </Space>
            ),
          },
          ...keys.map((k) => ({
            title: k,
            dataIndex: k,
            render: (_: unknown, row: LarkExtractResult['rows'][number]) => String(row.facts[k] ?? '—'),
          })),
        ]}
        dataSource={r.rows}
      />
    </div>
  );
}

/** Một dòng nhật ký người đọc được từ sự kiện tiến trình. */
function describe(e: Record<string, unknown>): string {
  switch (e.type) {
    case 'plan':
      return `▸ chạy được ngay: ${(e.order as string[]).join(', ') || '(chưa cái nào — thiếu dữ liệu đầu vào)'}`;
    case 'skill_start':
      return `→ ${e.name}${(e.attempt as number) > 1 ? ` (làm lại lần ${e.attempt})` : ''}`;
    case 'skill_done':
      return `  ✓ xong, ra: ${(e.produced as string[]).join(', ') || '(không khoá nào)'}`;
    case 'checks':
      return (e.changed as { raw: string; verdict: string; reason: string }[])
        .map((c) => `  · ${c.raw} → ${c.verdict === 'pass' ? 'đạt' : c.verdict === 'fail' ? 'SAI' : 'chưa kiểm'} (${c.reason})`)
        .join('\n');
    case 'conflict':
      return `  ✗ mâu thuẫn${e.retryingSkill ? ` — chạy lại ${e.retryingSkill}` : ''}`;
    case 'blocked':
      return `■ dừng: ${e.detail}`;
    case 'note':
      return `  ! ${e.text}`;
    default:
      return '';
  }
}

const HELP = [
  'Khai trong phần đầu (frontmatter) của SKILL.md:',
  '',
  '---',
  'name: dinh-gia',
  'needs:    [gia_von, danh_muc]     # cần gì mới chạy được',
  'produces: [gia_ban]               # chạy xong ra gì',
  'checks:',
  '  - gia_ban >= gia_von            # máy TỰ TÍNH, sai là chặn',
  '  - "mô tả phải khớp danh_muc"    # AI phán, có ghi lý do',
  '---',
  '',
  'ĐỌC TỆP RỒI GHI VÀO BẢNG — khai thêm `target`:',
  '',
  '---',
  'name: doc-hoa-don',
  'produces: [so_hd, ngay, ncc, tong_tien]   # ĐÂY chính là "format" chốt từ đầu',
  'target:',
  '  base: Ke toan             # bỏ trống = Base đang dùng',
  '  table: Hoa don',
  '  map:                      # khoá → TÊN CỘT trong bảng',
  '    so_hd: So hoa don',
  '    ngay: Ngay',
  '    tong_tien: Tong tien',
  'checks:',
  '  - tong_tien >= 0',
  '---',
  '',
  'Đọc được: .xlsx .docx .pptx .pdf .png .jpg .csv .txt',
  'Mỗi tệp là MỘT lượt riêng và ra MỘT dòng.',
  'Dòng nào có ràng buộc SAI thì KHÔNG được ghi — đó là điểm chính.',
  'Khoá trích ra mà không khai trong `map` thì không ghi vào bảng.',
  '',
  'Vài luật đáng nhớ:',
  '  · Không cần đánh số bước. Kỹ năng nào đủ `needs` thì chạy.',
  '  · Mỗi khoá chỉ MỘT kỹ năng được sinh ra, nếu không kết quả đổi theo thứ tự.',
  '  · Kỹ năng phải kết thúc bằng khối ```facts liệt kê đúng các khoá đã khai.',
  '  · Ràng buộc viết bằng lời vẫn nhận, nhưng nó do AI phán nên yếu hơn loại máy tính được.',
  '  · Kỹ năng không khai gì thì chạy như cũ — không bị ảnh hưởng.',
];
