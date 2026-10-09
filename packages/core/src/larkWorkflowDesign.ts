/**
 * Đọc một workflow Lark Base (schema `steps` của Open API v3) thành CÂY tiếng Việt cho người đọc.
 *
 * Dùng ở HAI chỗ, nên nằm ở core (thuần, không import gì):
 *  - hộp xác nhận ở Lark × Agents — người dùng duyệt THIẾT KẾ (trigger → bước → nhánh, bảng/cột)
 *    chứ không phải một khối JSON họ không đọc được;
 *  - kết quả tool ở main (`design_text`) — agent và người dùng nhìn cùng một bản mô tả.
 *
 * Hàm chỉ ĐỌC. Không kiểm hợp lệ (việc đó ở main: workflowV3.ts) — gặp dữ liệu lạ thì mô tả
 * những gì đọc được và đi tiếp, không bao giờ ném.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

export interface WorkflowDesignLine {
  /** Độ sâu thụt lề (0 = luồng chính). */
  depth: number;
  kind: 'trigger' | 'action' | 'branch' | 'loop' | 'edge' | 'note';
  text: string;
  stepId?: string;
}

export interface WorkflowDesignOptions {
  /** fieldId (fld…) → tên cột, để ref hiện «Tên cột» thay vì mã. */
  fieldNames?: Record<string, string>;
  /** id người dùng → tên hiển thị (người nhận). */
  userNames?: Record<string, string>;
}

const OP_VI: Record<string, string> = {
  is: '=',
  isNot: '≠',
  containsAny: 'chứa một trong',
  doesNotContainAny: 'không chứa',
  containsAll: 'chứa tất cả',
  isEmpty: 'trống',
  isNotEmpty: 'không trống',
  isGreater: '>',
  isGreaterEqual: '≥',
  isLess: '<',
  isLessEqual: '≤',
};

const RULE_VI: Record<string, string> = {
  NO_REPEAT: 'một lần',
  DAILY: 'hằng ngày',
  WEEKLY: 'hằng tuần',
  MONTHLY: 'hằng tháng',
  YEARLY: 'hằng năm',
  WORKDAY: 'các ngày làm việc',
  CUSTOM: 'tuỳ chỉnh',
};
const UNIT_VI: Record<string, string> = {
  SECOND: 'giây',
  MINUTE: 'phút',
  HOUR: 'giờ',
  DAY: 'ngày',
  WEEK: 'tuần',
  MONTH: 'tháng',
  YEAR: 'năm',
};

const cut = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const q = (s: unknown) => `«${String(s ?? '?')}»`;

function refText(v: string, o: WorkflowDesignOptions): string {
  const path = String(v || '').replace(/^\$\./, '');
  const segs = path.split('.');
  // Ref cột của bản ghi trigger ("$.trigger_1.fld…") → chỉ «Tên cột»: người duyệt không cần thấy mã bước.
  if (segs.length === 2 && o.fieldNames?.[segs[1]]) return q(o.fieldNames[segs[1]]);
  if (segs.length === 2 && segs[1] === 'recordLink') return '«link bản ghi»';
  const named = segs.map((s, i) => (i > 0 && o.fieldNames?.[s] ? q(o.fieldNames[s]) : s));
  return `[${named.join('.')}]`;
}

/** Một ValueInfo (hoặc mảng ValueInfo) → chữ ngắn. */
export function valueText(v: J, o: WorkflowDesignOptions = {}): string {
  if (v == null) return '';
  if (Array.isArray(v)) return cut(v.map((x) => valueText(x, o)).join(''), 120);
  if (typeof v !== 'object') return String(v);
  const t = v.value_type;
  const val = v.value;
  switch (t) {
    case 'text':
    case 'number':
    case 'boolean':
      return String(val ?? '');
    case 'date':
      return `ngày ${String(val ?? '')}`;
    case 'option':
      return `“${String(val?.name ?? val?.id ?? '')}”`;
    case 'user':
      return val?.id === 'me' && !val?.name ? '@bạn (người đang đăng nhập)' : `@${String(val?.name || o.userNames?.[val?.id] || val?.id || '')}`;
    case 'group':
      return `#${String(val?.name || val?.id || '')}`;
    case 'link':
      return valueText(val?.text, o) || valueText(val?.link, o);
    case 'ref':
      return refText(String(val ?? ''), o);
    default:
      return typeof val === 'string' ? val : '';
  }
}

function fieldCond(c: J, o: WorkflowDesignOptions): string {
  if (!c || typeof c !== 'object') return '';
  if (Array.isArray(c.conditions)) return groupText(c, o);
  const op = OP_VI[c.operator] ?? String(c.operator ?? '');
  const left = c.field_name != null ? q(c.field_name) : valueText(c.left_value, o);
  const right = valueText(c.value ?? c.right_value, o);
  if (!op) return `${left} = ${right}`;
  return right && c.operator !== 'isEmpty' && c.operator !== 'isNotEmpty' ? `${left} ${op} ${right}` : `${left} ${op}`;
}

function groupText(g: J, o: WorkflowDesignOptions): string {
  if (!g || typeof g !== 'object') return '';
  const items: J[] = Array.isArray(g.conditions) ? g.conditions : [];
  const joiner = String(g.conjunction || 'and').toLowerCase() === 'or' ? ' HOẶC ' : ' VÀ ';
  const parts = items.map((x) => fieldCond(x, o)).filter(Boolean);
  if (parts.length > 1 && joiner === ' HOẶC ') return parts.map((p) => (p.includes(' VÀ ') ? `(${p})` : p)).join(joiner);
  return parts.join(joiner);
}

/** condition_list của trigger: các nhóm nối bằng HOẶC, trong nhóm là VÀ. */
function condListText(list: J, o: WorkflowDesignOptions): string {
  if (!Array.isArray(list) || !list.length) return '';
  const parts = list.map((g) => groupText(g, o)).filter(Boolean);
  return parts.length > 1 ? parts.map((p) => `(${p})`).join(' HOẶC ') : parts[0] || '';
}

function fieldValuesText(fv: J, o: WorkflowDesignOptions): string {
  if (!Array.isArray(fv) || !fv.length) return '';
  return cut(fv.map((x: J) => `${q(x?.field_name)} = ${valueText(x?.value, o) || '∅'}`).join(', '), 160);
}

function recordScope(d: J, o: WorkflowDesignOptions): string {
  if (d?.ref_info?.step_id) return `bản ghi của bước ${d.ref_info.step_id}`;
  if (d?.filter_info) {
    const f = groupText(d.filter_info, o);
    return f ? `các bản ghi thoả ${f}` : 'các bản ghi (không lọc)';
  }
  return 'bản ghi';
}

/** Một bước → một câu tiếng Việt. */
export function stepText(s: J, o: WorkflowDesignOptions = {}): string {
  const d = s?.data && typeof s.data === 'object' ? s.data : {};
  const T = d.table_name != null ? q(d.table_name) : '';
  switch (s?.type) {
    case 'AddRecordTrigger': {
      const c = condListText(d.condition_list, o);
      return `KHI có bản ghi MỚI trong bảng ${T}${d.watched_field_name ? ` (theo dõi cột ${q(d.watched_field_name)})` : ''}${c ? `, nếu ${c}` : ''}`;
    }
    case 'SetRecordTrigger': {
      const w = Array.isArray(d.field_watch_info) ? d.field_watch_info.map((x: J) => fieldCond(x, o)).join(', ') : '';
      const c = condListText(d.condition_list, o);
      return `KHI bản ghi trong bảng ${T} được SỬA ở ${w || 'cột ?'}${c ? `, nếu ${c}` : ''}`;
    }
    case 'ChangeRecordTrigger':
      return `KHI bản ghi trong bảng ${T} được thêm/sửa và thoả: ${condListText(d.condition_list, o) || '?'}`;
    case 'TimerTrigger': {
      let r = RULE_VI[d.rule] ?? String(d.rule ?? '?');
      if (d.rule === 'CUSTOM') r = `mỗi ${d.interval ?? '?'} ${UNIT_VI[d.unit] ?? d.unit ?? ''}`;
      if (d.rule === 'WEEKLY' && Array.isArray(d.sub_unit)) r += ` (thứ ${d.sub_unit.map((n: number) => (n === 0 ? 'CN' : n + 1)).join(', ')})`;
      if (d.rule === 'MONTHLY' && Array.isArray(d.sub_unit)) r += ` (ngày ${d.sub_unit.join(', ')})`;
      return `THEO LỊCH: ${r}${d.start_time ? `, bắt đầu ${d.start_time}` : ''}${d.is_never_end === false && d.end_time ? `, tới ${d.end_time}` : ''}`;
    }
    case 'ReminderTrigger': {
      const off = Number(d.offset);
      const when = !off ? 'đúng ngày' : `${off < 0 ? 'trước' : 'sau'} ${Math.abs(off)} ${UNIT_VI[d.unit] ?? d.unit ?? ''}`;
      const hm = `${String(d.hour ?? 9).padStart(2, '0')}:${String(d.minute ?? 0).padStart(2, '0')}`;
      return `NHẮC theo ngày ở cột ${q(d.field_name)} (bảng ${T}): ${when}, lúc ${hm}`;
    }
    case 'ButtonTrigger':
      return d.button_type === 'buttonElement' ? 'KHI bấm nút trên trang/dashboard' : `KHI bấm nút trên bản ghi của bảng ${T}`;
    case 'LarkMessageTrigger': {
      const kw = Array.isArray(d.filter?.content_contains) && d.filter.content_contains.length ? `, chứa “${d.filter.content_contains.join('”/“')}”` : '';
      return `KHI nhận tin nhắn Lark (${d.receive_scene === 'chat' ? 'chat riêng' : 'nhóm'}${d.scope === 'at' ? ', khi @bot' : ''}) từ ${valueText(d.receiver, o) || '?'}${kw}`;
    }
    case 'AddRecordAction':
      return `Thêm bản ghi vào bảng ${T}: ${fieldValuesText(d.field_values, o) || '(chưa gán cột)'}`;
    case 'SetRecordAction':
      return `Cập nhật ${recordScope(d, o)} trong bảng ${T}: ${fieldValuesText(d.field_values, o) || '(chưa gán cột)'}`;
    case 'FindRecordAction': {
      const cols = Array.isArray(d.field_names) ? d.field_names.map(q).join(', ') : '';
      return `Tìm ${recordScope(d, o)} trong bảng ${T}${cols ? `, lấy cột ${cols}` : ''}`;
    }
    case 'HTTPClientAction':
      return `Gọi HTTP ${String(d.method || 'POST')} ${cut(valueText(d.url, o) || '?', 70)}`;
    case 'Delay':
      return `Chờ ${d.duration ?? '?'} phút`;
    case 'LarkMessageAction': {
      const to = d.send_to_everyone ? 'mọi người' : (Array.isArray(d.receiver) ? d.receiver.map((r: J) => valueText(r, o)).filter(Boolean).join(', ') : valueText(d.receiver, o)) || '?';
      const title = valueText(d.title, o);
      return `Gửi tin Lark tới ${to}: ${title ? `“${cut(title, 50)}” — ` : ''}${cut(valueText(d.content, o), 100)}`;
    }
    case 'GenerateAiTextAction':
      return `AI viết văn bản: “${cut(valueText(d.prompt, o), 100)}”`;
    case 'AIAnalysisAction': {
      const tabs = Array.isArray(d.analysis_table_names) && d.analysis_table_names.length ? d.analysis_table_names.map(q).join(', ') : 'mọi bảng';
      return `AI phân tích (${tabs}): “${cut(valueText(d.analysis_task, o), 100)}”`;
    }
    case 'IfElseBranch':
      return `NẾU ${groupText(d.condition, o) || '?'}`;
    case 'SwitchBranch':
      return `RẼ NHÁNH theo điều kiện (${Array.isArray(d.child_branch_list) ? d.child_branch_list.length : 0} nhánh${d.mode === 'parallel' ? ', chạy song song' : ''})`;
    case 'AIClassificationBranch':
      return `AI PHÂN LOẠI ${cut(valueText(d.content, o), 60)} thành: ${Array.isArray(d.classes) ? d.classes.map((c: J) => c?.name).join(' | ') : '?'}`;
    case 'Loop':
      return `LẶP qua từng mục của ${valueText(d.data, o) || '?'}${d.max_loop_times ? ` (tối đa ${d.max_loop_times} lần)` : ''}`;
    default:
      return `${String(s?.type ?? '?')}${s?.title ? ` — ${s.title}` : ''}`;
  }
}

function kindOf(type: string): WorkflowDesignLine['kind'] {
  if (/Trigger$/.test(type)) return 'trigger';
  if (type === 'Loop') return 'loop';
  if (/Branch$/.test(type)) return 'branch';
  return 'action';
}

function edgeLabel(step: J, link: J, i: number): string {
  const d = step?.data || {};
  const desc = link?.desc ? ` (${link.desc})` : '';
  switch (link?.kind) {
    case 'if_true':
      return `✔ ĐÚNG${desc} →`;
    case 'if_false':
      return `✗ NGƯỢC LẠI${desc} →`;
    case 'loop_start':
      return '↻ Mỗi vòng →';
    case 'case': {
      if (step?.type === 'SwitchBranch') {
        const b = Array.isArray(d.child_branch_list) ? d.child_branch_list[i] : null;
        if (b) {
          const c = groupText(b.condition, {});
          return `Nhánh “${b.name ?? link.desc ?? i + 1}”${c ? `: ${c}` : ''} →`;
        }
        return `Nhánh khác${desc} →`;
      }
      if (link.label === 'default') return 'Không khớp loại nào →';
      return `Loại “${link.desc ?? link.label ?? i + 1}” →`;
    }
    default:
      return `${String(link?.kind ?? '?')}${desc} →`;
  }
}

/**
 * Cả luồng → danh sách dòng có độ sâu. Đi từ trigger theo `next`; ở mỗi nhánh/vòng lặp đi vào từng
 * đường con cho tới khi gặp điểm hợp lưu (`next` của nút nhánh), rồi mới tiếp tục luồng chính.
 * Bước không nối vào luồng được liệt kê cuối cùng để người duyệt không bỏ sót.
 */
export function describeWorkflowSteps(steps: unknown, o: WorkflowDesignOptions = {}): WorkflowDesignLine[] {
  const list: J[] = Array.isArray(steps) ? steps.filter((s) => s && typeof s === 'object') : [];
  const byId = new Map<string, J>();
  for (const s of list) if (typeof s.id === 'string' && !byId.has(s.id)) byId.set(s.id, s);
  const out: WorkflowDesignLine[] = [];
  const seen = new Set<string>();
  const MAX = 400;

  const walk = (startId: string | null | undefined, depth: number, stopAt: string | null) => {
    let id = startId ?? null;
    while (id && id !== stopAt && out.length < MAX) {
      const s = byId.get(id);
      if (!s) {
        out.push({ depth, kind: 'note', text: `(bước “${id}” không tồn tại)` });
        return;
      }
      if (seen.has(id)) {
        out.push({ depth, kind: 'note', text: `↪ đi tiếp ở bước “${id}” (đã mô tả ở trên)` });
        return;
      }
      seen.add(id);
      out.push({ depth, kind: kindOf(String(s.type)), text: stepText(s, o), stepId: id });
      const links: J[] = Array.isArray(s.children?.links) ? s.children.links : [];
      if (links.length) {
        const merge = typeof s.next === 'string' ? s.next : null;
        links.forEach((l, i) => {
          out.push({ depth: depth + 1, kind: 'edge', text: edgeLabel(s, l, i) });
          walk(typeof l?.to === 'string' ? l.to : null, depth + 2, merge);
        });
      }
      id = typeof s.next === 'string' ? s.next : null;
    }
  };

  const trigger = list.find((s) => /Trigger$/.test(String(s.type))) ?? list[0];
  if (trigger?.id) walk(trigger.id, 0, null);
  const orphans = list.filter((s) => typeof s.id === 'string' && !seen.has(s.id));
  if (orphans.length) {
    out.push({ depth: 0, kind: 'note', text: '⚠ Bước không nối vào luồng:' });
    for (const s of orphans) {
      if (out.length >= MAX) break;
      seen.add(s.id);
      out.push({ depth: 1, kind: kindOf(String(s.type)), text: stepText(s, o), stepId: s.id });
    }
  }
  return out;
}

/** Bản chữ thuần (thụt lề 2 khoảng mỗi cấp) — cho kết quả tool và bản ghi. */
export function workflowDesignText(steps: unknown, o: WorkflowDesignOptions = {}): string {
  return describeWorkflowSteps(steps, o)
    .map((l) => `${'  '.repeat(l.depth)}${l.kind === 'edge' || l.kind === 'note' ? '' : '• '}${l.text}`)
    .join('\n');
}
