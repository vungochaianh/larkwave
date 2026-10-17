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

/**
 * Mốc thời gian từ agent → ms. Nhận ISO đầy đủ, hoặc "YYYY-MM-DD" (hiểu theo giờ Việt Nam, đầu ngày).
 * Sai dạng ⇒ NÉM, để agent biết chứ không lặng lẽ bỏ điều kiện lọc.
 */
export function parseWhen(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim();
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00+07:00`) : Date.parse(s);
  if (!Number.isFinite(ms)) throw new Error(`${label} không đúng dạng ngày (dùng YYYY-MM-DD hoặc ISO, vd 2026-09-01).`);
  return ms;
}

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
      'Đọc tin của MỘT hội thoại Zalo theo `threadId` (từ zalo_list_chats / zalo_list_groups / zalo_find_user), cũ → mới (chỉ dùng trong kỹ năng Zalo). Nhóm: tự lấy thêm lịch sử từ kho tin cloud của Zalo. Đọc lùi về quá khứ: gọi lại với `before` = `olderBefore` của lần trước. Thiếu tin cũ ⇒ zalo_sync.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['threadId'],
      properties: {
        ...account,
        threadId: str('Id hội thoại.'),
        limit: { type: 'number', description: 'Số tin cuối (mặc định 50, tối đa 200).' },
        since: str('Chỉ tin TỪ thời điểm này (YYYY-MM-DD theo giờ VN, hoặc ISO).'),
        before: str('Chỉ tin TRƯỚC thời điểm này (YYYY-MM-DD hoặc ISO) — để đọc lùi theo trang.'),
      },
    },
    exec: async (input) => {
      connectorGate('zalo_read_chat');
      return (await zalo()).read({ account: input.account, threadId: String(input.threadId || ''), limit: input.limit, since: parseWhen(input.since, 'since'), before: parseWhen(input.before, 'before') });
    },
  },
  {
    name: 'zalo_search_messages',
    description:
      'TÌM tin Zalo theo chữ (không phân biệt dấu, mọi từ đều phải có) và/hoặc khoảng thời gian — trong một hội thoại (`threadId`) hoặc mọi hội thoại — gồm cả tin đã đồng bộ từ điện thoại (chỉ dùng trong kỹ năng Zalo). Mới nhất trước. Dùng để trả lời câu hỏi kiểu "ai nhắc tới đơn DH-12", "tháng 9 nhóm X bàn gì về giá".',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...account,
        query: str('Từ khoá (bỏ trống = mọi tin trong khoảng thời gian).'),
        threadId: str('Chỉ tìm trong hội thoại này (bỏ trống = mọi hội thoại).'),
        since: str('Từ thời điểm (YYYY-MM-DD hoặc ISO).'),
        before: str('Trước thời điểm (YYYY-MM-DD hoặc ISO).'),
        limit: { type: 'number', description: 'Số kết quả (mặc định 30, tối đa 200).' },
      },
    },
    exec: async (input) => {
      connectorGate('zalo_search_messages');
      return (await zalo()).search({
        account: input.account,
        query: String(input.query || ''),
        ...(input.threadId ? { threadId: String(input.threadId) } : {}),
        since: parseWhen(input.since, 'since'),
        before: parseWhen(input.before, 'before'),
        limit: input.limit,
      });
    },
  },
  {
    name: 'zalo_sync',
    description:
      'ĐỒNG BỘ tin Zalo từ MÁY CHỦ khi sổ thiếu tin cũ (chỉ dùng trong kỹ năng Zalo). `action`:\n' +
      '- "status": xem sổ đang có bao nhiêu tin, cũ nhất từ khi nào, cài đặt lưu tin, cửa sổ Zalo Web đang mở/đăng nhập chưa.\n' +
      '- "server": lấy thêm tin cũ từ máy chủ Zalo (nhóm: kho tin cloud; 1-1: các trang tin cũ Zalo còn giữ). Không cần điện thoại.\n' +
      'Lịch sử CŨ HƠN nữa (nhất là chat 1-1) không có trên máy chủ — dùng cửa sổ Zalo Web: zalo_web_open rồi zalo_web_read.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        ...account,
        action: { type: 'string', enum: ['status', 'server'] },
        threadId: str('"server": chỉ lấy thêm cho hội thoại này (bỏ trống = mọi hội thoại).'),
      },
    },
    exec: async (input) => {
      connectorGate('zalo_sync');
      const z = await zalo();
      if (String(input.action) === 'server') return z.fetchHistory({ account: input.account, ...(input.threadId ? { threadId: String(input.threadId) } : {}) });
      return z.syncStatus();
    },
  },
  {
    name: 'zalo_web_open',
    description:
      'MỞ cửa sổ Zalo Web (chat.zalo.me chính thức) ngay trong Larkwave (chỉ dùng trong kỹ năng Zalo). ' +
      'Dùng khi cần đọc lịch sử CŨ mà sổ/máy chủ không có. KHÔNG cần phiên zca còn sống (cửa sổ này đăng nhập riêng). ' +
      'Trả trạng thái: `loggedIn:true` ⇒ nhờ người dùng mở đúng hội thoại TRONG CỬA SỔ rồi gọi zalo_web_read. ' +
      '`loggedIn:false` ⇒ nhờ người dùng QUÉT QR NGAY TRONG CỬA SỔ VỪA HIỆN (KHÔNG dùng nút "Kết nối Zalo" ở sidebar — đó là phiên khác, quét ở đó sẽ đá văng đăng nhập của cửa sổ), và bấm Đồng ý đồng bộ trên điện thoại nếu được hỏi.',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...account } },
    exec: async (input) => {
      connectorGate('zalo_web_open');
      const st = await (await zalo()).webOpen({ account: input.account, show: true });
      return {
        opened: st.exists,
        loggedIn: st.loggedIn ?? false,
        hint: st.loggedIn
          ? 'Cửa sổ Zalo Web đã mở và ĐÃ đăng nhập. Nhờ người dùng BẤM VÀO đúng hội thoại cần đọc trong cửa sổ (và bấm Đồng ý đồng bộ trên điện thoại nếu được hỏi), rồi gọi zalo_web_read. ĐỪNG bảo họ quét QR nữa.'
          : 'Cửa sổ Zalo Web vừa mở, CHƯA đăng nhập — nhờ người dùng QUÉT QR NGAY TRONG CỬA SỔ ĐÓ (đừng dùng nút "Kết nối Zalo" ở sidebar). Đăng nhập xong, mở hội thoại cần đọc rồi báo mình.',
      };
    },
  },
  {
    name: 'zalo_web_read',
    description:
      'ĐỌC hội thoại trong cửa sổ Zalo Web (chỉ dùng trong kỹ năng Zalo). TỰ MỞ hội thoại theo tên nếu truyền `chat` ' +
      '(ĐỪNG bắt người dùng tự bấm vào nhóm — cửa sổ do app điều khiển), rồi tự cuộn lên tải thêm lịch sử và trả về phần chữ. ' +
      'Dùng cho tin CŨ mà zalo_read_chat/zalo_sync không lấy được. KHÔNG cần phiên zca; chỉ cần cửa sổ đã ĐĂNG NHẬP (zalo_web_open). ' +
      'Kết quả có `chatNotFound` + `candidates` ⇒ không thấy hội thoại tên đó: xem danh sách gợi ý rồi gọi lại với tên đúng. ' +
      'Báo "đang ở trang đăng nhập" ⇒ mới cần nhờ người dùng quét QR trong cửa sổ. ' +
      'Trả về chữ thô của hội thoại (tên người + nội dung + giờ xen kẽ) — tự tóm tắt / trích theo yêu cầu, nói rõ đọc từ cửa sổ Zalo Web.',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...account,
        chat: str('TÊN hội thoại/nhóm cần đọc — công cụ tự mở nó trong cửa sổ. Bỏ trống = đọc hội thoại đang mở.'),
        since: str('Cuộn lên TỚI ngày này rồi dừng (YYYY-MM-DD hoặc ISO). Dùng khi người dùng hỏi theo khoảng thời gian — chính xác và nhanh hơn tự đoán `scrolls`.'),
        scrolls: { type: 'number', description: 'Số lần cuộn lên (mặc định 12; có `since` thì mặc định 120). Mỗi lần ~1 giây.' },
      },
    },
    exec: async (input) => {
      connectorGate('zalo_web_read');
      const since = parseWhen(input.since, 'since');
      const r = await (await zalo()).webRead({
        ...(typeof input.scrolls === 'number' ? { scrolls: input.scrolls } : {}),
        ...(input.chat ? { chat: String(input.chat) } : {}),
        ...(since !== undefined ? { since } : {}),
      });
      if (r.chatNotFound) {
        return {
          chatNotFound: r.chatNotFound,
          candidates: r.candidates,
          ...(r.webHistoryLimit ? { webHistoryLimit: r.webHistoryLimit } : {}),
          note: `Không MỞ được hội thoại "${r.chatNotFound}" trong cửa sổ Zalo Web${r.scriptError ? ` (lỗi: ${r.scriptError})` : ''}. Xem "candidates" (những mục cửa sổ đang thấy) rồi gọi lại với đúng tên. Danh sách trống ⇒ cửa sổ chưa tải xong hoặc chưa đăng nhập.`,
        };
      }
      if (r.empty) {
        return {
          empty: true,
          diag: r.diag,
          ...(r.scriptError ? { scriptError: r.scriptError } : {}),
          note:
            'Mở được hội thoại nhưng ĐỌC RA RỖNG. Thử lại MỘT lần với `scrolls` lớn hơn; vẫn rỗng thì DỪNG, ' +
            'báo người dùng đây là lỗi bộ đọc của Larkwave (không phải nhóm không có tin) và ĐƯA NGUYÊN `diag.how` ' +
            '(trong đó có CÂU LỖI THẬT) vào câu trả lời để nhóm phát triển sửa. KHÔNG bắt người dùng bấm lại hay đồng bộ lại.',
        };
      }
      return {
        chat: r.openedChat || r.title || '(không rõ tên)',
        truncated: r.truncated,
        // Zalo ghi mốc này NGAY TRONG khung hội thoại = ranh giới nó chịu nạp (đo thật 18/10/2026).
        ...(r.webHistoryLimit ? { zaloWebOldest: `Zalo Web chỉ nạp tin TỪ ngày ${r.webHistoryLimit} trở đi (Zalo tự ghi trong khung chat). Tin cũ hơn mốc này KHÔNG lấy được qua Zalo Web — chỉ Zalo PC mới có. NÓI RÕ mốc này cho người dùng, đừng để họ chờ.` } : {}),
        ...(r.diag ? { scrolled: r.diag.scrolled, oldestSeen: r.diag.oldestSeen, reachedTop: r.diag.reachedTop } : {}),
        text: r.text,
      };
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
