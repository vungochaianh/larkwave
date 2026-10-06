import { enc, type LarkToolDef, str } from './types';

/**
 * Drive — liệt kê, TẠO THƯ MỤC và DI CHUYỂN.
 *
 * Trước đây chỉ có `drive_list_files`, nên agent dựng xong một Base là nó nằm trơ ở gốc Drive,
 * không tên, không thư mục — người dùng phải tự vào Lark đặt tên và kéo đi. Chính agent đã tự
 * chẩn ra và liệt kê đúng những tool nó thiếu.
 *
 * Mọi endpoint dưới đây đều ĐỐI CHIẾU VỚI TÀI LIỆU LARK trước khi viết, không viết theo trí nhớ:
 * một tool trỏ sai địa chỉ còn tệ hơn không có tool, vì agent sẽ thử lại mãi rồi báo một lỗi
 * chẳng liên quan.
 */
export const driveTools: LarkToolDef[] = [
  {
    name: 'drive_list_files',
    description: 'Liệt kê file/thư mục trong Drive (tuỳ chọn folder_token; bỏ trống = thư mục gốc).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        folder_token: str('folder_token (bỏ trống = gốc)'),
        page_size: { type: 'integer' },
        page_token: str('Token trang tiếp theo'),
      },
    },
    gated: false,
    exec: (i, c) =>
      c.request('GET', '/open-apis/drive/v1/files', {
        params: { folder_token: i.folder_token, page_size: i.page_size ?? 50, page_token: i.page_token },
      }),
  },

  {
    name: 'drive_create_folder',
    description:
      'TẠO một thư mục trong Drive. Dùng khi cần gom các Base/tài liệu vừa dựng vào một chỗ thay vì ' +
      'để rải rác ở gốc. `folder_token` là thư mục CHA — bỏ trống thì tạo ở gốc "Không gian của tôi". ' +
      'Trả về token thư mục mới, dùng tiếp cho drive_move_file hoặc bitable_create_app.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: str('Tên thư mục. Đặt tiếng Việt có dấu thoải mái.'),
        folder_token: str('Thư mục cha. Bỏ trống = gốc.'),
      },
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', '/open-apis/drive/v1/files/create_folder', {
        // `folder_token` rỗng thì Lark hiểu là gốc; gửi chuỗi rỗng an toàn hơn bỏ hẳn khoá.
        data: { name: i.name, folder_token: i.folder_token || '' },
      }),
  },

  {
    name: 'drive_move_file',
    description:
      'DI CHUYỂN một file/thư mục trong Drive sang thư mục khác. Dùng để dọn một Base vừa tạo vào ' +
      'đúng chỗ. `type` phải khớp loại thật: Base là "bitable", thư mục là "folder".',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['file_token', 'type'],
      properties: {
        file_token: str('Token của thứ cần chuyển (Base thì dùng app_token).'),
        type: {
          type: 'string',
          enum: ['bitable', 'folder', 'docx', 'doc', 'sheet', 'file', 'mindnote'],
          description: 'Loại đối tượng. Base = bitable.',
        },
        folder_token: str('Thư mục đích. Bỏ trống = chuyển về gốc.'),
      },
    },
    gated: true,
    exec: (i, c) =>
      c.request('POST', `/open-apis/drive/v1/files/${enc(i.file_token)}/move`, {
        data: { type: i.type, folder_token: i.folder_token || '' },
      }),
  },
];
