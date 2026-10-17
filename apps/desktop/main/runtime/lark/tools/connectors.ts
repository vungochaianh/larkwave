import type { LarkToolDef } from './types';
import { str } from './types';
import { currentTurnFiles, type ConnectorAccess } from '../fileContext';

/**
 * Công cụ Zalo / Gmail — kết nối CÁ NHÂN của người dùng (tin nhắn riêng, hộp thư).
 *
 * Người dùng muốn (17/10/2026): "agent không được thao tác, chỉ cấu thành skills — giống
 * fbinbox_workspace". Bên Social Wave, AI không bao giờ cầm kênh; việc gửi đi qua bộ máy của app có
 * nhịp gửi, danh sách từ chối và sổ ghi. Ở đây làm đúng tinh thần đó bằng một CHỐT duy nhất
 * (connectorGate), áp cho mọi công cụ dưới:
 *
 *  1. Chỉ trong LƯỢT CỦA CHÍNH CHỦ MÁY: hội thoại của chủ máy (larkService.chat gắn `connectors` vào
 *     ngữ cảnh lượt), hoặc một LỊCH mà chủ máy tạo từ hội thoại của mình (quy tắc mang `connectorTools`,
 *     xem connectorGrantForSchedule). Lượt bot Lark trong nhóm (người lạ nhắn tới), lượt chia sẻ cho bạn
 *     bè, lịch tạo từ nơi khác: KHÔNG có ⇒ bị từ chối. Thiếu chốt này, người lạ nhắn bot "đọc tin Zalo
 *     của chủ máy" là đọc được.
 *  2. Chỉ khi lượt đó có một KỸ NĂNG nhắc ĐÚNG TÊN công cụ đó (kỹ năng dựng sẵn, hoặc kỹ năng người
 *     dùng tự soạn) — nạp qua lệnh "/", khớp từ khoá, hoặc `skill_get`. Mở theo TỪNG công cụ: kỹ năng
 *     "Đọc tin Zalo" không nhắc `zalo_send_text` nên không gửi được. Agent không tự nảy ra việc nhắn
 *     Zalo cho ai đó ngoài một quy trình người dùng đã duyệt.
 *  3. Gửi (`zalo_send_text`, `gmail_send`) là thao tác ghi như mọi thao tác khác: công tắc "Tự động" TẮT
 *     thì hỏi, BẬT thì chạy luôn; lịch thì theo quyền "Gửi tin" của quy tắc. Người dùng muốn (17/10/2026):
 *     "muốn gửi thế nào thì gửi, chỉ cần cảnh báo tài khoản Zalo" — bản 0.1.5 luôn hỏi + chặn 30 tin/giờ
 *     làm agent từ chối cả việc người dùng đã nói rõ. Dịch vụ chỉ giữ sàn nhịp gửi ngắn và trả `warning`
 *     khi gửi dày (zaloService / gmailService), không chặn.
 */

export type ConnectorKind = 'zalo' | 'gmail';

const kindOf = (tool: string): ConnectorKind => (tool.startsWith('gmail_') ? 'gmail' : 'zalo');

/** Công cụ Zalo/Gmail mà nội dung một kỹ năng dùng tới (đúng tên công cụ có thật). */
export function connectorUnlocksOf(body: string): string[] {
  const names = new Set<string>();
  for (const m of String(body || '').matchAll(/\b(?:zalo|gmail)_[a-z_]+\b/g)) if (KNOWN.has(m[0])) names.add(m[0]);
  return [...names];
}

/**
 * Công cụ Zalo/Gmail một LỊCH được dùng khi chạy — tính LÚC TẠO LỊCH, từ lượt đang tạo nó.
 *
 * Chỉ lượt có `connectors` (hội thoại của chính chủ máy) mới cấp được; lượt bot/chia sẻ/lịch khác ⇒ rỗng.
 * Cấp: công cụ prompt của lịch nhắc ĐÚNG TÊN, cộng các công cụ lượt đó đã mở (qua kỹ năng) CÙNG LOẠI với
 * thứ prompt nhắc tới (prompt nói "Zalo" thì chỉ mở công cụ Zalo) — để lượt chạy còn tra được nhóm/người.
 */
export function connectorGrantForSchedule(prompt: string, access: ConnectorAccess | undefined = currentTurnFiles()?.connectors): string[] {
  if (!access) return [];
  const named = connectorUnlocksOf(prompt);
  const kinds = new Set<ConnectorKind>(named.map(kindOf));
  if (/\bzalo\b/i.test(prompt)) kinds.add('zalo');
  if (/\bgmail\b/i.test(prompt)) kinds.add('gmail');
  const out = new Set(named);
  for (const t of access.tools) if (KNOWN.has(t) && kinds.has(kindOf(t))) out.add(t);
  return [...out];
}

/** Công cụ GỬI (tin/thư thật tới người thật). */
export const CONNECTOR_SEND_TOOLS = ['zalo_send_text', 'gmail_send'];

/** `skill_get` vừa nạp một kỹ năng giữa lượt ⇒ mở thêm công cụ nó dùng (chỉ khi lượt có quyền). */
export function noteSkillLoaded(id: string, body: string): void {
  const c = currentTurnFiles()?.connectors;
  if (!c) return;
  if (!c.skills.includes(id)) c.skills.push(id);
  for (const t of connectorUnlocksOf(body)) if (!c.tools.includes(t)) c.tools.push(t);
}

const LABEL: Record<ConnectorKind, string> = { zalo: 'Zalo', gmail: 'Gmail' };
const SKILL_HINT: Record<ConnectorKind, string> = {
  zalo: 'kỹ năng dựng sẵn "Đọc tin Zalo" (/zalo-doc-tin) hoặc "Gửi tin Zalo" (/zalo-gui-tin)',
  gmail: 'kỹ năng dựng sẵn "Đọc thư Gmail" (/gmail-doc-thu) hoặc "Gửi thư Gmail" (/gmail-gui-thu)',
};

/** Chốt chung — xem đầu tệp. Ném lỗi ⇒ kết quả lỗi về thẳng model, không chạm tới kết nối. */
export function connectorGate(tool: string, access: ConnectorAccess | undefined = currentTurnFiles()?.connectors): void {
  const kind = kindOf(tool);
  if (!access) {
    throw new Error(
      `${LABEL[kind]} chỉ dùng được trong cuộc trò chuyện của chính chủ máy, hoặc một lịch chủ máy tạo từ cuộc trò chuyện đó (schedule_agent_job, prompt nhắc đúng tên công cụ) — không chạy cho bot Lark trong nhóm hay lượt chia sẻ cho bạn bè.`,
    );
  }
  if (!access.tools.includes(tool)) {
    throw new Error(
      `Agent không tự thao tác ${LABEL[kind]}: \`${tool}\` chỉ chạy trong một KỸ NĂNG có dùng đúng công cụ này. Đọc kỹ năng phù hợp bằng skill_get rồi làm theo — ${SKILL_HINT[kind]}, hoặc kỹ năng người dùng tự soạn có nhắc \`${tool}\`. Không có kỹ năng phù hợp thì nói với người dùng.`,
    );
  }
}

/** Dịch vụ thật nạp lười (electron + zca-js/nodemailer/imapflow) — để tệp này nạp được trong test node. */
const zalo = async () => (await import('../../connectors/zalo/zaloService')).zaloService;
const gmail = async () => (await import('../../connectors/gmail/gmailService')).gmailService;

const account = { account: str('Tài khoản (bỏ trống = tài khoản đầu tiên đang kết nối).') };

export const connectorTools: LarkToolDef[] = [
  // ── Zalo ──────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'zalo_status',
    description: 'Xem tài khoản Zalo nào đang kết nối (chỉ dùng trong kỹ năng Zalo). Chưa kết nối ⇒ bảo người dùng mở Kỹ năng → Kết nối → Zalo và quét QR.',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    exec: async () => {
      connectorGate('zalo_status');
      const s = await (await zalo()).status();
      return { accounts: s.accounts.map((a) => ({ name: a.label, phone: a.phone, status: a.status, message: a.message })) };
    },
  },
  {
    name: 'zalo_list_chats',
    description:
      'Liệt kê hội thoại Zalo gần đây (người và nhóm), mới nhất trước, kèm tin gần nhất (chỉ dùng trong kỹ năng Zalo). `query` lọc theo tên/nội dung, không phân biệt dấu. Trả `threadId` để đọc bằng zalo_read_chat.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...account,
        query: str('Lọc theo tên hội thoại hoặc chữ trong tin gần nhất.'),
        limit: { type: 'number', description: 'Số hội thoại (mặc định 20, tối đa 100).' },
        groupsOnly: { type: 'boolean', description: 'Chỉ nhóm.' },
        usersOnly: { type: 'boolean', description: 'Chỉ chat 1-1.' },
      },
    },
    exec: async (input) => {
      connectorGate('zalo_list_chats');
      return (await zalo()).recent(input);
    },
  },
  {
    name: 'zalo_read_chat',
    description:
      'Đọc tin của MỘT hội thoại Zalo theo `threadId` (từ zalo_list_chats / zalo_list_groups / zalo_find_user), cũ → mới (chỉ dùng trong kỹ năng Zalo). Nhóm: lấy thêm lịch sử từ Zalo. Chat 1-1: chỉ có tin Zalo đã đồng bộ/đến từ lúc kết nối.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['threadId'],
      properties: { ...account, threadId: str('Id hội thoại.'), limit: { type: 'number', description: 'Số tin cuối (mặc định 50, tối đa 200).' } },
    },
    exec: async (input) => {
      connectorGate('zalo_read_chat');
      return (await zalo()).read({ account: input.account, threadId: String(input.threadId || ''), limit: input.limit });
    },
  },
  {
    name: 'zalo_list_groups',
    description: 'Liệt kê nhóm Zalo đang tham gia (id, tên, số thành viên) — `query` lọc theo tên (chỉ dùng trong kỹ năng Zalo).',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...account, query: str('Lọc theo tên nhóm.') } },
    exec: async (input) => {
      connectorGate('zalo_list_groups');
      return (await zalo()).groups(input);
    },
  },
  {
    name: 'zalo_list_friends',
    description: 'Tìm trong danh bạ bạn bè Zalo theo tên/số (chỉ dùng trong kỹ năng Zalo). Trả `userId` = threadId để đọc/gửi.',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...account, query: str('Tên hoặc số điện thoại.') } },
    exec: async (input) => {
      connectorGate('zalo_list_friends');
      return (await zalo()).friends(input);
    },
  },
  {
    name: 'zalo_find_user',
    description: 'Tìm người dùng Zalo theo SỐ ĐIỆN THOẠI (chỉ dùng trong kỹ năng Zalo). Trả `userId` = threadId của chat 1-1.',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, required: ['phone'], properties: { ...account, phone: str('Số điện thoại, vd 0912345678.') } },
    exec: async (input) => {
      connectorGate('zalo_find_user');
      return (await zalo()).findUser({ account: input.account, phone: String(input.phone || '') });
    },
  },
  {
    name: 'zalo_send_text',
    description:
      'GỬI một tin chữ Zalo vào một hội thoại (người hoặc nhóm) bằng tài khoản Zalo của người dùng — chỉ dùng trong kỹ năng Zalo. Thao tác ghi: công tắc "Tự động" bật thì chạy luôn, tắt thì app hỏi; lịch chạy theo quyền "Gửi tin". KHÔNG có giới hạn số tin — người dùng muốn gửi bao nhiêu thì gửi; kết quả có `warning` khi gửi dày (Zalo có thể khoá tài khoản gửi nhiều/gửi người lạ) → nói lại cảnh báo đó MỘT lần rồi làm tiếp. Đây là tin THẬT tới người thật.',
    gated: true,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['threadId', 'text'],
      properties: {
        ...account,
        threadId: str('Id hội thoại (userId của người, hoặc groupId của nhóm).'),
        text: str('Nội dung tin (≤2000 ký tự).'),
        isGroup: { type: 'boolean', description: 'true nếu threadId là nhóm (bỏ trống = tự đoán theo sổ tin).' },
        recipientName: str('Tên người/nhóm nhận — CHỈ để hiện trong hộp xác nhận cho người dùng đối chiếu.'),
      },
    },
    exec: async (input) => {
      connectorGate('zalo_send_text');
      return (await zalo()).send({ account: input.account, threadId: String(input.threadId || ''), text: String(input.text || ''), isGroup: input.isGroup });
    },
  },
  // ── Gmail ─────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'gmail_status',
    description: 'Xem tài khoản Gmail nào đã kết nối (chỉ dùng trong kỹ năng Gmail). Chưa có ⇒ bảo người dùng mở Kỹ năng → Kết nối → Gmail.',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    exec: async () => {
      connectorGate('gmail_status');
      return { accounts: (await gmail()).list().map((a) => ({ email: a.email, name: a.name })) };
    },
  },
  {
    name: 'gmail_search',
    description:
      'Tìm thư Gmail theo cú pháp ô tìm của Gmail (from:, to:, subject:, has:attachment, newer_than:7d, is:unread…), mới nhất trước (chỉ dùng trong kỹ năng Gmail). Trả `id` để đọc bằng gmail_read (cùng `mailbox`). KHÔNG đánh dấu đã đọc.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...account,
        query: str('Cú pháp tìm của Gmail. Bỏ trống = thư mới nhất.'),
        unreadOnly: { type: 'boolean', description: 'Chỉ thư chưa đọc.' },
        limit: { type: 'number', description: 'Số thư (mặc định 20, tối đa 50).' },
        mailbox: { type: 'string', enum: ['inbox', 'all'], description: '"inbox" (mặc định) hoặc "all" (Tất cả thư).' },
      },
    },
    exec: async (input) => {
      connectorGate('gmail_search');
      return (await gmail()).search(input);
    },
  },
  {
    name: 'gmail_read',
    description: 'Đọc nội dung MỘT thư Gmail theo `id` (từ gmail_search, cùng `mailbox`): người gửi, tiêu đề, chữ, danh sách tệp đính kèm (chỉ dùng trong kỹ năng Gmail). KHÔNG đánh dấu đã đọc.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { ...account, id: { type: 'number', description: 'Id thư từ gmail_search.' }, mailbox: { type: 'string', enum: ['inbox', 'all'] } },
    },
    exec: async (input) => {
      connectorGate('gmail_read');
      return (await gmail()).read({ account: input.account, id: Number(input.id), mailbox: input.mailbox });
    },
  },
  {
    name: 'gmail_send',
    description:
      'GỬI một thư chữ từ Gmail của người dùng — chỉ dùng trong kỹ năng Gmail. Thao tác ghi: công tắc "Tự động" bật thì chạy luôn, tắt thì app hỏi; lịch chạy theo quyền "Gửi tin". Tối đa 100 người nhận/thư; kết quả có `warning` khi gửi dày (Google có thể tạm khoá gửi) → nói lại MỘT lần. Đây là thư THẬT.',
    gated: true,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['to', 'subject', 'text'],
      properties: {
        ...account,
        to: str('Người nhận, nhiều địa chỉ cách nhau bằng dấu phẩy.'),
        cc: str('CC (tuỳ chọn).'),
        subject: str('Tiêu đề.'),
        text: str('Nội dung thư (chữ thuần).'),
      },
    },
    exec: async (input) => {
      connectorGate('gmail_send');
      return (await gmail()).send({ account: input.account, to: String(input.to || ''), cc: input.cc, subject: String(input.subject || ''), text: String(input.text || '') });
    },
  },
];

export const CONNECTOR_TOOL_NAMES = connectorTools.map((t) => t.name);
const KNOWN = new Set(CONNECTOR_TOOL_NAMES);
