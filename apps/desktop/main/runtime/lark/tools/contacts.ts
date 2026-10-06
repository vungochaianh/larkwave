import { type LarkToolDef, enc, str } from './types';

/** Contacts — look up a user + resolve ids from email/phone (read-only). */
export const contactsTools: LarkToolDef[] = [
  {
    name: 'contacts_batch_get_id',
    description:
      'Phân giải open_id/user_id của người dùng từ EMAIL hoặc SỐ ĐIỆN THOẠI. Gọi khi cần gửi tin/nhắc ai đó ' +
      'nhưng chỉ biết email/điện thoại — lấy open_id rồi dùng messaging_send_message với receive_id_type="open_id".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        emails: { type: 'array', items: { type: 'string' }, description: 'Danh sách email cần tra' },
        mobiles: { type: 'array', items: { type: 'string' }, description: 'Danh sách số điện thoại (kèm mã vùng nếu cần, vd +84…)' },
        user_id_type: {
          type: 'string',
          enum: ['open_id', 'union_id', 'user_id'],
          description: 'Loại ID muốn nhận (mặc định open_id)',
        },
      },
    },
    gated: false,
    exec: (i, c) =>
      c.request('POST', '/open-apis/contact/v3/users/batch_get_id', {
        params: { user_id_type: i.user_id_type ?? 'open_id' },
        data: { emails: i.emails, mobiles: i.mobiles },
      }),
  },
  {
    name: 'contacts_get_user',
    description:
      'Lấy thông tin một người dùng Lark (tên, email, phòng ban) theo user_id. Gọi khi cần phân giải một người dùng để hiển thị hoặc để gửi tin nhắn.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        user_id: str('Định danh người dùng'),
        user_id_type: {
          type: 'string',
          enum: ['open_id', 'union_id', 'user_id'],
          description: 'Loại định danh (mặc định open_id)',
        },
      },
      required: ['user_id'],
    },
    gated: false,
    exec: (i, c) =>
      c.request('GET', `/open-apis/contact/v3/users/${enc(i.user_id)}`, {
        params: { user_id_type: i.user_id_type ?? 'open_id' },
      }),
  },
];
