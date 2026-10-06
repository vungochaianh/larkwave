import { type LarkToolDef, uuid, str } from './types';

/** Messaging — discover chats + read history (read) and send a message (gated write). */
export const messagingTools: LarkToolDef[] = [
  {
    name: 'messaging_list_chats',
    description:
      'Liệt kê các nhóm/cuộc trò chuyện mà tài khoản (hoặc app) đang tham gia — trả về chat_id + tên nhóm. ' +
      'Gọi TRƯỚC khi gửi tin để lấy đúng chat_id của nhóm cần gửi (không phải đoán).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        page_size: { type: 'integer', description: 'Số nhóm tối đa (mặc định 50, tối đa 100)' },
        page_token: str('Token trang tiếp theo (lấy từ kết quả trước)'),
      },
    },
    gated: false,
    exec: (i, c) =>
      c.request('GET', '/open-apis/im/v1/chats', {
        params: { page_size: i.page_size ?? 50, page_token: i.page_token },
      }),
  },
  {
    name: 'messaging_get_messages',
    description:
      'Đọc lịch sử tin nhắn của một nhóm/chat theo chat_id (mới → cũ, đã phân trang). Gọi khi cần ngữ cảnh ' +
      'cuộc trò chuyện trước khi trả lời/tóm tắt. Tài khoản/app phải nằm trong nhóm đó.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        chat_id: str('chat_id của nhóm (lấy từ messaging_list_chats)'),
        page_size: { type: 'integer', description: 'Số tin tối đa (mặc định 20, tối đa 50)' },
        page_token: str('Token trang tiếp theo'),
      },
      required: ['chat_id'],
    },
    gated: false,
    exec: (i, c) =>
      c.request('GET', '/open-apis/im/v1/messages', {
        params: {
          container_id_type: 'chat',
          container_id: i.chat_id,
          page_size: i.page_size ?? 20,
          page_token: i.page_token,
          sort_type: 'ByCreateTimeDesc',
        },
      }),
  },
  {
    name: 'messaging_create_chat',
    description:
      'Tạo một NHÓM chat (hội thoại nhóm) mới trong Lark với tên + (tuỳ chọn) danh sách thành viên. Hành động GHI — ' +
      'sẽ hỏi xác nhận. Trả về chat_id để gửi tin vào nhóm sau đó. `member_id_type` mặc định open_id; nếu chỉ biết ' +
      'email/điện thoại hãy gọi contacts_batch_get_id trước để lấy open_id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: str('Tên nhóm'),
        description: str('Mô tả nhóm (tuỳ chọn)'),
        member_id_type: {
          type: 'string',
          enum: ['open_id', 'user_id', 'union_id'],
          description: 'Loại định danh trong member_ids (mặc định open_id)',
        },
        member_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Danh sách định danh thành viên thêm vào nhóm (tuỳ chọn)',
        },
      },
      required: ['name'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', '/open-apis/im/v1/chats', {
        params: { user_id_type: i.member_id_type ?? 'open_id' },
        data: {
          name: i.name,
          description: i.description || undefined,
          user_id_list: Array.isArray(i.member_ids) && i.member_ids.length ? i.member_ids : undefined,
        },
      }),
  },
  {
    name: 'messaging_send_message',
    description:
      'Gửi tin nhắn văn bản tới một người dùng hoặc nhóm chat trong Lark. Hành động GHI — sẽ hỏi xác nhận. `receive_id` phải khớp `receive_id_type` (open_id / user_id / email / chat_id). Nếu chỉ biết email/điện thoại, gọi contacts_batch_get_id trước để lấy open_id; nếu cần chat_id của nhóm, gọi messaging_list_chats.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        receive_id_type: {
          type: 'string',
          enum: ['open_id', 'user_id', 'union_id', 'email', 'chat_id'],
          description: 'Loại định danh người/nhóm nhận',
        },
        receive_id: str('Định danh người/nhóm nhận theo receive_id_type'),
        text: str('Nội dung tin nhắn (văn bản thuần)'),
      },
      required: ['receive_id_type', 'receive_id', 'text'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', '/open-apis/im/v1/messages', {
        params: { receive_id_type: i.receive_id_type },
        data: {
          receive_id: i.receive_id,
          msg_type: 'text',
          content: JSON.stringify({ text: i.text }),
          uuid: uuid(),
        },
      }),
  },
  {
    name: 'messaging_send_rich',
    description:
      'Gửi tin nhắn ĐỊNH DẠNG (rich) tới người/nhóm: msg_type "post" (văn bản có tiêu đề/đậm/link/nhiều dòng) hoặc ' +
      '"interactive" (thẻ card). Hành động GHI — sẽ hỏi xác nhận. `content` là OBJECT đúng chuẩn Lark cho loại đó ' +
      '(post: {zh_cn:{title,content:[[{tag:"text",text:"…"}]]}}; interactive: card JSON). Nếu chỉ cần văn bản thuần, ' +
      'dùng messaging_send_message.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        receive_id_type: {
          type: 'string',
          enum: ['open_id', 'user_id', 'union_id', 'email', 'chat_id'],
          description: 'Loại định danh người/nhóm nhận',
        },
        receive_id: str('Định danh người/nhóm nhận theo receive_id_type'),
        msg_type: { type: 'string', enum: ['post', 'interactive'], description: 'post = rich text; interactive = card' },
        content: {
          type: 'object',
          additionalProperties: true,
          description: 'Object nội dung đúng chuẩn Lark cho msg_type (sẽ được JSON.stringify)',
        },
      },
      required: ['receive_id_type', 'receive_id', 'msg_type', 'content'],
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', '/open-apis/im/v1/messages', {
        params: { receive_id_type: i.receive_id_type },
        data: {
          receive_id: i.receive_id,
          msg_type: i.msg_type,
          content: JSON.stringify(i.content),
          uuid: uuid(),
        },
      }),
  },
];
