export const FIELD_TYPES = [
  { value: 1,    label: 'Text' },           { value: 2,    label: 'Number' },
  { value: 3,    label: 'Single select' },  { value: 4,    label: 'Multi select' },
  { value: 5,    label: 'Date' },           { value: 7,    label: 'Checkbox' },
  { value: 11,   label: 'Person' },         { value: 13,   label: 'Phone' },
  { value: 15,   label: 'URL' },            { value: 17,   label: 'Attachment' },
  { value: 18,   label: 'One-way link' },   { value: 21,   label: 'Two-way link' },
  { value: 22,   label: 'Location' },       { value: 23,   label: 'Group chat' },
  { value: 1001, label: 'Created time' },   { value: 1002, label: 'Modified time' },
  { value: 1003, label: 'Created by' },     { value: 1004, label: 'Modified by' },
  { value: 1005, label: 'Auto serial' },
]

export const TYPE_COLOR: Record<number, string> = {
  1: 'blue', 2: 'green', 3: 'orange', 4: 'orange', 5: 'purple',
  7: 'cyan', 11: 'geekblue', 13: 'volcano', 15: 'magenta',
  17: 'gold', 18: 'cyan', 21: 'cyan', 22: 'lime', 23: 'geekblue',
  1001: 'default', 1002: 'default', 1003: 'default', 1004: 'default', 1005: 'default',
}

export const DOMAINS = [
  'Quản lý bán hàng (CRM)', 'Quản lý nhân sự (HR)', 'Quản lý dự án',
  'Thương mại điện tử', 'Sản xuất & Kho', 'Giáo dục', 'Y tế',
  'Tài chính & Kế toán', 'Logistics & Vận tải', 'Bất động sản',
]

export const REQUIREMENTS = [
  'Theo dõi trạng thái (Status tracking)',
  'Kết nối giữa các bảng (Relationships)',
  'Báo cáo & thống kê',
  'Quy trình phê duyệt',
  'Phân quyền người dùng',
  'Theo dõi thời gian (Timeline)',
  'Tích hợp thông báo',
  'Lưu trữ tệp đính kèm',
]

export const TABLE_COUNT_OPTIONS = [
  { label: '2–4 bảng (đơn giản)', value: '4' },
  { label: '5–8 bảng (trung bình)', value: '8' },
  { label: '9–15 bảng (phức tạp)', value: '15' },
  { label: '16–25 bảng (hệ thống lớn)', value: '25' },
]

export const API_BASE   = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
export const API_ORIGIN = API_BASE.replace(/\/api$/, '')
