/**
 * Nhịp gửi Zalo / Gmail — CẢNH BÁO, không chặn. THUẦN (không electron) để kiểm được bằng node.
 *
 * Bản 0.1.5 chép luật của Social Wave: sàn 8 giây, TRẦN 30 tin Zalo / 40 thư mỗi giờ thì NÉM lỗi, và
 * mọi lần gửi luôn phải bấm duyệt. Người dùng nhận lại đúng cái họ không muốn (17/10/2026): đặt "cứ 1
 * phút gửi giờ hiện tại vào nhóm, 30 lần thì dừng, không cần duyệt" thì agent từ chối, viện dẫn trần
 * 30 tin/giờ. Họ nói rõ: "muốn gửi thế nào thì gửi, mình đưa ra cảnh báo tài khoản Zalo là được".
 *
 * Nay: không có trần. Chỉ giữ một sàn rất ngắn giữa hai lần gửi (để hai lời gọi liền nhau của model
 * không bắn cùng một mili-giây vào máy chủ Zalo/Google), và trả `warning` — lần gửi ĐẦU TIÊN của mỗi
 * tài khoản trong phiên app, và mỗi khi gửi dày — để agent nói lại cho người dùng.
 */

export const ZALO_SEND_FLOOR_MS = 2_000;
export const GMAIL_SEND_FLOOR_MS = 2_000;
/** Từ mức này trong 1 giờ qua thì cảnh báo "gửi dày" (không chặn). */
export const ZALO_DENSE_PER_HOUR = 20;
export const GMAIL_DENSE_PER_HOUR = 40;
export const GMAIL_MAX_RECIPIENTS = 100;
export const GMAIL_MANY_RECIPIENTS = 20;

const HOUR = 3_600_000;

/** Bỏ mốc cũ hơn 1 giờ. */
export function lastHour(log: number[], now: number): number[] {
  return log.filter((t) => now - t < HOUR);
}

export const ZALO_RISK =
  'Zalo có thể hạn chế hoặc khoá tài khoản cá nhân gửi dày, gửi nội dung lặp lại hay nhắn người lạ — tài khoản là của bạn, bạn tự cân nhắc.';

/** `sentBefore` = số tin đã gửi bằng tài khoản này trong 1 giờ qua (chưa tính tin đang gửi). */
export function zaloSendWarning(sentBefore: number, firstThisSession: boolean): string | undefined {
  const n = sentBefore + 1;
  if (n >= ZALO_DENSE_PER_HOUR) return `Đã gửi ${n} tin Zalo trong 1 giờ qua bằng tài khoản này. ${ZALO_RISK}`;
  if (firstThisSession) return `Lưu ý: ${ZALO_RISK}`;
  return undefined;
}

export function gmailSendWarning(sentBefore: number, recipients: number, firstThisSession: boolean): string | undefined {
  const n = sentBefore + 1;
  const out: string[] = [];
  if (n >= GMAIL_DENSE_PER_HOUR) out.push(`Đã gửi ${n} thư trong 1 giờ qua.`);
  if (recipients > GMAIL_MANY_RECIPIENTS) out.push(`Thư này gửi ${recipients} người nhận.`);
  if (out.length) return `${out.join(' ')} Google giới hạn ~500 thư/ngày và có thể tạm khoá gửi hoặc đưa thư vào Spam khi gửi dày.`;
  if (firstThisSession) return 'Lưu ý: Gmail giới hạn ~500 thư/ngày; gửi dày hoặc gửi hàng loạt có thể bị tạm khoá gửi / vào Spam.';
  return undefined;
}
