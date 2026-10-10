/**
 * Dựng lại LỊCH SỬ hội thoại dạng chữ từ các mục đã lưu (bong bóng chat, thẻ công cụ, thẻ tệp).
 *
 * Đây là trí nhớ DUY NHẤT xuyên lượt của runner không phải Claude (Codex/Gemini/Grok không có
 * `--resume`), và là đường lui của Claude khi không còn bản ghi phiên gốc ở đâu cả (xem
 * claudeSessions.rescueClaudeSession — đường đó được thử TRƯỚC). Vì là đường lui nên phải giữ
 * được đúng thứ quý nhất: không chỉ lời chat, mà cả những gì công cụ đã đọc/ghi (định danh, số
 * lượng, liên kết) và các tệp đã dựng — thiếu chúng thì model đọc lại từ đầu hoặc bịa.
 *
 * THUẦN (không electron, không fs) — larkService gọi vào, bài kiểm gọi thẳng.
 */

/** Hình tối thiểu của một mục đã lưu mà hàm này cần đọc (mục được lưu nguyên dạng renderer). */
export interface ChatItemLite {
  kind?: string;
  role?: string;
  text?: string;
  call?: { name?: string; input?: unknown; summary?: string; status?: string; error?: string; memo?: string };
  /** kind = 'file' */
  name?: string;
  path?: string;
  mime?: string;
  bytes?: number;
  preview?: { summary?: string } | null;
}

/** Ước lượng token thô: ~4 ký tự/token. Chỉ để chia ngân sách, không cần chính xác. */
export const approxTokens = (s: string): number => Math.ceil(s.length / 4);

/** Các khoá định danh luôn được giữ nguyên (tách ra TRƯỚC khi cắt phần tham số còn lại). */
const ID_KEYS = ['app_token', 'table_id', 'record_id', 'field_id', 'file_token', 'chat_id', 'folder_token', 'sheet_token', 'doc_token', 'workflow_id', 'path'];

function kb(bytes: number): string {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Một mục → một dòng lịch sử, hoặc null để bỏ qua. */
export function renderItemLine(it: ChatItemLite, opts: { msgCap?: number } = {}): string | null {
  const cap = opts.msgCap ?? 4000;
  if (it?.kind === 'msg' && typeof it.text === 'string' && it.text.trim()) {
    // Trần mỗi tin để một tin (vd tài liệu dán vào ngay tin đầu, luôn được ghim) không nuốt cả ngân sách.
    return `${it.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${it.text.trim().slice(0, cap)}`;
  }
  if (it?.kind === 'tool' && it.call?.name) {
    const c = it.call;
    let argStr = '';
    try {
      // Cắt thẳng JSON ở 300 ký tự sẽ nuốt mất ĐỊNH DANH khi tham số dài (filter/sort/field_names…):
      // mất app_token/table_id thì lượt sau không còn đường đọc lại bảng đó. Tách định danh ra trước.
      const inp = (c.input || {}) as Record<string, unknown>;
      const ids: Record<string, unknown> = {};
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inp)) (ID_KEYS.includes(k) ? ids : rest)[k] = v;
      const idStr = Object.keys(ids).length ? JSON.stringify(ids) : '';
      const restStr = Object.keys(rest).length ? JSON.stringify(rest).slice(0, 300) : '';
      argStr = idStr || restStr ? ` ${[idStr, restStr].filter(Boolean).join(' ')}` : '';
    } catch {
      argStr = '';
    }
    // "(lỗi)" trơ trọi là vô dụng ở lượt sau — giữ một đoạn lỗi thật.
    const res =
      c.status === 'error'
        ? ` → (lỗi: ${String(c.error || 'không rõ').slice(0, 200)})`
        : c.status === 'denied'
          ? ' → (người dùng từ chối)'
          : c.summary
            ? ` → ${String(c.summary).slice(0, 400)}`
            : '';
    // Bản tóm KẾT QUẢ (id, số lượng, liên kết, tên) do main rút lúc công cụ chạy xong — thứ mà chỉ
    // tham số đầu vào không cho biết (vd bản ghi vừa tạo có id gì, tệp nằm ở đâu, sheet ở link nào).
    const memo = c.memo && c.status !== 'error' ? ` {${String(c.memo).slice(0, 700)}}` : '';
    return `[Tool ${c.name}${argStr}]${res}${memo}`;
  }
  if (it?.kind === 'file' && typeof it.name === 'string' && it.name) {
    const size = typeof it.bytes === 'number' && it.bytes > 0 ? ` · ${kb(it.bytes)}` : '';
    const pv = it.preview?.summary ? ` · ${String(it.preview.summary).slice(0, 300)}` : '';
    const where = typeof it.path === 'string' && it.path ? ` · đường dẫn: ${it.path}` : '';
    return `[Tệp đã dựng cho người dùng: «${it.name}»${size}${pv}${where}]`;
  }
  return null;
}

/**
 * Lịch sử chữ trong ngân sách token (mới nhất trước). Khi phải bỏ phần cũ thì tin ĐẦU TIÊN của
 * người dùng (nhiệm vụ/phạm vi) vẫn được ghim lên đầu.
 */
export function buildTranscript(items: unknown[], budgetTokens = 9000): string {
  const msgCap = budgetTokens >= 30_000 ? 12_000 : 4000;
  const rendered = ((items || []) as ChatItemLite[])
    .map((it) => ({ it, line: renderItemLine(it, { msgCap }) }))
    .filter((x): x is { it: ChatItemLite; line: string } => !!x.line);
  if (!rendered.length) return '';
  const picked: string[] = [];
  let used = 0;
  let evicted = false;
  for (let i = rendered.length - 1; i >= 0; i--) {
    const t = approxTokens(rendered[i].line);
    if (used + t > budgetTokens) {
      evicted = true;
      break;
    }
    picked.push(rendered[i].line);
    used += t;
  }
  picked.reverse();
  if (evicted) {
    const firstUser = rendered.find((r) => r.it.kind === 'msg' && r.it.role === 'user');
    picked.unshift('… (đã lược bớt phần cũ hơn của hội thoại) …');
    if (firstUser && !picked.includes(firstUser.line)) picked.unshift(firstUser.line);
  }
  return picked.join('\n');
}

/**
 * Cùng cửa sổ như buildTranscript nhưng ở dạng tin có vai (đường API trực tiếp). Mục công cụ/tệp
 * gập vào thành dòng của trợ lý. Chuẩn hoá theo ràng buộc nhà cung cấp: bắt đầu bằng user, xen kẽ
 * user/assistant nghiêm ngặt, không kết thúc bằng user (lượt hiện tại sẽ được nối vào sau).
 */
export function buildApiHistory(items: unknown[], budgetTokens = 9000): { role: 'user' | 'assistant'; text: string }[] {
  const msgCap = budgetTokens >= 30_000 ? 12_000 : 4000;
  const msgs = ((items || []) as ChatItemLite[])
    .map((it) => {
      if (it?.kind === 'msg' && (it.role === 'user' || it.role === 'assistant') && typeof it.text === 'string' && it.text.trim()) {
        return { role: it.role as 'user' | 'assistant', text: it.text.trim().slice(0, msgCap) };
      }
      const line = it?.kind === 'tool' || it?.kind === 'file' ? renderItemLine(it) : null;
      return line ? { role: 'assistant' as const, text: line } : null;
    })
    .filter((x): x is { role: 'user' | 'assistant'; text: string } => !!x);
  const picked: { role: 'user' | 'assistant'; text: string }[] = [];
  let used = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = approxTokens(msgs[i].text);
    if (used + t > budgetTokens) break;
    picked.push(msgs[i]);
    used += t;
  }
  picked.reverse();
  const out: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const m of picked) {
    if (!out.length && m.role !== 'user') continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.text = `${prev.text}\n${m.text}`;
    else out.push({ role: m.role, text: m.text });
  }
  while (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}
