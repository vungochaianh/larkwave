/**
 * Báo qua Telegram khi một việc tự động BỊ CHẶN và cần người vào tay.
 *
 * Vì sao cần: những việc chạy theo lịch trên máy này im lặng khi gặp chặn. Đường báo index chết
 * nhiều ngày mà không ai biết, lịch đăng bài hết chủ đề rồi dừng mà không ai biết — cả hai chỉ lộ
 * ra khi có người tình cờ đi tìm. Một tiến trình tự động không báo được lúc nó kẹt thì phần "tự
 * động" chỉ đúng cho tới lần kẹt đầu tiên.
 *
 * Dùng:
 *   import { notifyBlocked } from './lib/notify.mjs';
 *   await notifyBlocked(cfg, { what: 'Deploy website', why: '...', need: '...' });
 */

/** Đọc cấu hình Telegram từ cùng các file mà những script khác đang dùng. */
export function telegramCfg(cfg) {
  return {
    token: cfg.TG_TOKEN,
    chatId: cfg.TG_CHAT_ID,
    threadId: cfg.TG_THREAD_ID,
  };
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Gửi một tin "đang kẹt". Trả về { ok, note } và KHÔNG ném — việc báo tin hỏng không được phép
 * làm hỏng thêm cái việc vốn đã kẹt.
 *
 * `what` việc gì · `why` kẹt vì sao (cụ thể, có số đo) · `need` cần người làm gì để gỡ.
 */
export async function notifyBlocked(cfg, { what, why, need, extra } = {}) {
  const { token, chatId, threadId } = telegramCfg(cfg);
  if (!token || !chatId) return { ok: false, note: 'chưa cấu hình TG_TOKEN / TG_CHAT_ID' };

  const text = [
    `🚧 <b>Đang kẹt: ${esc(what)}</b>`,
    `<i>${new Date().toLocaleString('vi-VN')}</i>`,
    '',
    `<b>Vì sao:</b>`,
    esc(why),
    '',
    `<b>Cần bạn làm:</b>`,
    esc(need),
    ...(extra ? ['', esc(extra)] : []),
  ].join('\n');

  try {
    const r = await (
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: Number(chatId),
          ...(threadId ? { message_thread_id: Number(threadId) } : {}),
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
    ).json();
    return r.ok
      ? { ok: true, note: `message_id ${r.result.message_id}` }
      : { ok: false, note: r.description ?? 'lỗi không rõ' };
  } catch (e) {
    return { ok: false, note: e.message };
  }
}

/**
 * Như notifyBlocked, nhưng CHỈ NHẮC LẠI MỘT LẦN MỖI 24 GIỜ cho cùng một chỗ kẹt.
 *
 * Bắt buộc phải có: site-check chạy mỗi 5 tiếng, nên một chỗ kẹt kéo dài vài ngày sẽ đẻ ra hàng
 * chục tin giống hệt nhau. Nhóm chat bị dội tin thì người ta tắt thông báo, và lúc có tin thật
 * đáng đọc thì không ai đọc — tức là báo quá nhiều và không báo gì đi tới cùng một kết cục.
 *
 * `key` là định danh chỗ kẹt (vd "indexnow-403"). Mốc thời gian ghi ở .notify-state.json,
 * gitignored vì nó là trạng thái của riêng từng máy.
 */
export async function notifyBlockedOnce(cfg, key, payload, { root, everyMs = 24 * 60 * 60_000 } = {}) {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const file = path.join(root ?? process.cwd(), '.notify-state.json');
  let state = {};
  try {
    if (existsSync(file)) state = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    /* hỏng thì coi như chưa từng báo — thà báo thừa một lần còn hơn im lặng vì một file rác */
  }
  const last = Number(state[key] ?? 0);
  if (Date.now() - last < everyMs) return { ok: false, note: 'đã báo trong 24h qua, bỏ qua' };
  const r = await notifyBlocked(cfg, payload);
  if (r.ok) {
    state[key] = Date.now();
    try {
      writeFileSync(file, JSON.stringify(state, null, 1));
    } catch {
      /* không ghi được mốc thì lần sau báo lại — chấp nhận được */
    }
  }
  return r;
}
