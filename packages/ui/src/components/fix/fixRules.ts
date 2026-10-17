/**
 * "Trợ lý kiểm tra" + mở thẳng chỗ sửa — phần THUẦN (không React) để kiểm được bằng node.
 *
 * Người dùng muốn (17/10/2026): thay vì để người dùng gặp lỗi rồi tự lần vào Cài đặt (thẻ lỗi cũ còn ghi
 * "Mở Cài đặt → mục Claude…"), có một trợ lý MIỄN PHÍ (luật cố định, không gọi AI) kiểm trước những thứ
 * cần có — Claude/Gemini cài + đăng nhập chưa, API key, Zalo/Gmail cho kỹ năng — báo ngay và MỞ LUÔN modal
 * sửa (quét QR, dán key…). Mọi chỗ trong app chỉ cần `openFix(đích)`; FixCenter (mount một lần trong
 * AppShell) mở đúng modal.
 */

export type FixTarget = 'checklist' | 'claude' | 'claudeKeys' | 'zalo' | 'gmail' | `runner:${string}`;

export const OPEN_FIX_EVENT = 'larkwave:open-fix';
/** FixCenter báo số việc CẦN sửa (error + warn) sau mỗi lần kiểm — FixBadge hiện số này. */
export const FIX_ISSUES_EVENT = 'larkwave:fix-issues';

export interface OpenFixDetail {
  target: FixTarget;
  /** Một câu: vì sao mở (hiện trên đầu modal). */
  reason?: string;
}

/** Mở modal sửa từ bất kỳ đâu (thẻ lỗi, thẻ công cụ, chip, ô gửi…). */
export function openFix(target: FixTarget, reason?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OpenFixDetail>(OPEN_FIX_EVENT, { detail: { target, reason } }));
}

/** Câu lỗi của công cụ Zalo/Gmail (connectorGate / dịch vụ) ⇒ modal kết nối tương ứng. */
export function fixTargetForToolError(text: string | undefined): FixTarget | null {
  const t = String(text || '');
  if (/Chưa kết nối Zalo|Zalo \(.*\) đang (nối lại|mất kết nối)|quét (lại )?(mã )?QR/i.test(t)) return 'zalo';
  if (/Chưa kết nối Gmail|Gmail từ chối đăng nhập|kết nối lại Gmail|chưa cho truy cập IMAP/i.test(t)) return 'gmail';
  return null;
}

/** Lệnh "/" của kỹ năng cần kết nối (gõ khi chưa kết nối ⇒ mở modal trước khi gửi). */
export function connectorForPrompt(prompt: string): 'zalo' | 'gmail' | null {
  const m = /^\s*\/(zalo|gmail)-[a-z-]+/i.exec(String(prompt || ''));
  return m ? (m[1].toLowerCase() as 'zalo' | 'gmail') : null;
}

export interface HealthRunner {
  id: string;
  label: string;
  installed: boolean;
  loggedIn: boolean;
  ready?: boolean;
}

export interface HealthInput {
  runners: HealthRunner[];
  /** Runner Lark × Agents đang dùng (larkStatus.defaultRunner). */
  activeRunner: string;
  /** Nguồn chạy: CLI trên máy / API key riêng / gói Larkwave. */
  runSource: 'cli' | 'api' | 'maic';
  /** Kho key nhóm của Claude (null = lõi không có). */
  claudeKeys?: { keys: { active: boolean; valid?: boolean }[] } | null;
  /** Lõi báo có key cho runner đang dùng (nguồn API). */
  apiKeyReady?: boolean;
  zalo?: { connected: boolean } | null;
  gmail?: { connected: boolean } | null;
}

export interface HealthIssue {
  id: string;
  /** error = lượt chat sẽ HỎNG; warn = nên sửa; info = tuỳ chọn (Zalo/Gmail) — không bao giờ nhắc tự động. */
  level: 'error' | 'warn' | 'info';
  title: string;
  detail?: string;
  fix?: FixTarget;
  fixLabel?: string;
}

/** Luật kiểm — chỉ những gì CHẮC chắn làm hỏng lượt chat mới là `error` (được bật thông báo). */
export function healthIssues(i: HealthInput): HealthIssue[] {
  const out: HealthIssue[] = [];
  const r = i.runners.find((x) => x.id === i.activeRunner);
  const name = r?.label?.replace(/\s*CLI$/i, '') || i.activeRunner;
  const fixRunner: FixTarget = i.activeRunner === 'claude' ? 'claude' : `runner:${i.activeRunner}`;
  if (i.runSource === 'cli' && r) {
    if (!r.installed) {
      out.push({ id: `runner-missing:${r.id}`, level: 'error', title: `Chưa cài ${r.label}`, detail: `Lark × Agents đang chạy bằng ${name} nhưng máy chưa có ${r.label}.`, fix: `runner:${r.id}`, fixLabel: 'Hướng dẫn cài' });
    } else if (!r.loggedIn) {
      out.push({ id: `runner-login:${r.id}`, level: 'error', title: `${name} chưa đăng nhập`, detail: `Đăng nhập ${name} (hoặc dán API key) để Lark × Agents chạy được.`, fix: fixRunner, fixLabel: `Đăng nhập ${name}` });
    }
  }
  if (i.runSource === 'api' && i.apiKeyReady === false) {
    out.push({
      id: `api-key:${i.activeRunner}`,
      level: 'error',
      title: `Chưa có API key cho ${name}`,
      detail: 'Đang chọn chạy bằng "API key riêng" nhưng chưa có key.',
      fix: i.activeRunner === 'claude' ? 'claudeKeys' : `runner:${i.activeRunner}`,
      fixLabel: 'Thêm API key',
    });
  }
  const active = i.claudeKeys?.keys.find((k) => k.active);
  if (active && active.valid === false) {
    out.push({ id: 'claude-key-invalid', level: 'warn', title: 'API key Claude đang dùng chưa được Anthropic chấp nhận', detail: 'Có thể key sai, đã thu hồi, hoặc tài khoản Anthropic hết credit — mở để kiểm lại và xem lý do.', fix: 'claudeKeys', fixLabel: 'Kiểm key' });
  }
  if (i.zalo && !i.zalo.connected) out.push({ id: 'zalo', level: 'info', title: 'Zalo chưa kết nối', detail: 'Cần cho kỹ năng Zalo (đọc / gửi tin). Tuỳ chọn.', fix: 'zalo', fixLabel: 'Quét QR Zalo' });
  if (i.gmail && !i.gmail.connected) out.push({ id: 'gmail', level: 'info', title: 'Gmail chưa kết nối', detail: 'Cần cho kỹ năng Gmail (đọc / gửi thư). Tuỳ chọn.', fix: 'gmail', fixLabel: 'Kết nối Gmail' });
  return out;
}
