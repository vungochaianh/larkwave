/**
 * Client-side "export to PDF" for the desktop app (and any @larkwave/ui consumer). Builds a clean
 * printable HTML document and opens the browser/Electron print dialog — the user picks "Save as PDF"
 * (Chromium's built-in destination). No main-process/native dependency, so it ships via code-push.
 */

import { ensureContrast } from './contrast';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Very small Markdown → HTML for a readable transcript (headings, bold, code, lists, line breaks). */
function mdLite(src: string): string {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let inList = false;
  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith('```')) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (inCode) { out.push('</pre>'); inCode = false; } else { out.push('<pre>'); inCode = true; }
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    if (line.trim() === '') { out.push('<div style="height:6px"></div>'); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  if (inCode) out.push('</pre>');
  return out.join('\n');
}
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
  agent?: string;
}

/** Build + print a chat transcript as PDF. `title` names the document; `messages` are rendered in order. */
export function exportTranscriptPdf(opts: { title: string; messages: TranscriptMessage[]; subtitle?: string }): void {
  const when = new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const blocks = opts.messages
    .filter((m) => (m.text || '').trim())
    .map((m) => {
      const who = m.role === 'user' ? 'Bạn' : (m.agent ? `AI · ${esc(m.agent)}` : 'AI');
      const cls = m.role === 'user' ? 'user' : 'ai';
      return `<div class="msg ${cls}"><div class="who">${who}</div><div class="body">${mdLite(m.text)}</div></div>`;
    })
    .join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1E2230; font-size: 13px; line-height: 1.55; margin: 0; }
  .head { border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; margin-bottom: 16px; }
  .head h1 { font-size: 20px; margin: 0 0 4px; color: #1E2230; }
  .head .meta { color: #6B7280; font-size: 12px; }
  .msg { margin: 0 0 14px; padding: 10px 12px; border-radius: 10px; page-break-inside: avoid; }
  .msg.user { background: #F1EFFE; }
  .msg.ai { background: #F7F7FB; border: 1px solid #ECEDF3; }
  .who { font-weight: 700; font-size: 11px; letter-spacing: .03em; text-transform: uppercase; color: #6C5CE7; margin-bottom: 4px; }
  .msg.user .who { color: #5B4FC2; }
  .body p { margin: 0 0 6px; }
  .body h1,.body h2,.body h3,.body h4 { margin: 10px 0 4px; }
  .body ul { margin: 4px 0; padding-left: 20px; }
  .body code { background: #ECEBFB; color: #5B4FC2; padding: 1px 5px; border-radius: 5px; font-family: ui-monospace, Menlo, monospace; font-size: .92em; }
  .body pre { background: #FBFAFF; color: #2E2A44; border: 1px solid #E6E2F8; padding: 10px 12px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
  .foot { margin-top: 18px; padding-top: 10px; border-top: 1px solid #ECEDF3; color: #9AA3B5; font-size: 11px; text-align: right; }
</style></head><body>
  <div class="head"><h1>${esc(opts.title)}</h1><div class="meta">${opts.subtitle ? esc(opts.subtitle) + ' · ' : ''}Xuất ngày ${esc(when)}</div></div>
  ${blocks || '<p style="color:#9AA3B5">Chưa có nội dung.</p>'}
  <div class="foot">Larkwave</div>
</body></html>`;

  printHtml(html);
}

/** Dựng một iframe ẩn, đổ HTML vào rồi mở hộp thoại in — nơi người dùng chọn "Lưu thành PDF". */
function printHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => { setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 1000); };
  setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* ignore */ }
    cleanup();
  }, 300);
}

/* ────────────────────────── Xuất PDF từ chính phần đã hiển thị ────────────────────────── */

/**
 * Bảng biến CSS bản SÁNG, nhúng thẳng vào tài liệu in.
 *
 * Mọi style nội tuyến trong ChatMarkdown viết dưới dạng `var(--tw-…, dự phòng)`. Trong một tài
 * liệu in mới tinh thì các biến này không tồn tại, nên trình duyệt dùng giá trị dự phòng — vốn
 * đã là bản sáng. Nhưng dựa vào dự phòng là dựa vào may mắn: khai báo hẳn ra thì bản in LUÔN
 * sáng, kể cả khi người dùng đang ở chế độ tối và kể cả khi sau này có ai bỏ giá trị dự phòng.
 */
const PRINT_VARS = `:root{
  --tw-layer:#F4F5FB;--tw-surface:#FFFFFF;--tw-surface-alt:#FAFAFE;--tw-surface-muted:#F6F5FE;
  --tw-text:#1E2230;--tw-text-sub:#6B7280;--tw-text-faint:#9AA3B5;
  --tw-border:#ECEDF3;--tw-border-sub:#F1F2F7;--tw-chip-bg:#F1EFFE;--tw-chip-text:#5B4FC2;
  --tw-code-bg:#FBFAFF;--tw-code-header-bg:#F3F1FD;--tw-code-border:#E6E2F8;--tw-code-text:#2E2A44;
  --tw-code-dark:0;color-scheme:light;
}`;

/** Nền giấy — mọi màu chữ phải đọc được trên nền này, không phải trên nền của màn hình. */
const PAPER: [number, number, number] = [255, 255, 255];

/**
 * Chuẩn bị một bản sao của phần đã hiển thị để đem đi in.
 *
 * Ba việc, mỗi việc sửa một thứ sẽ hỏng nếu bê nguyên xi:
 *  1. MÀU CHỮ. react-syntax-highlighter ghi màu thẳng vào style nội tuyến của từng span. Nếu
 *     người dùng đang ở chế độ tối thì đó là bảng màu tối, in lên giấy trắng là không đọc nổi.
 *     Đưa mọi màu nội tuyến qua ensureContrast — cùng phép tính mà khối mã trên màn hình dùng,
 *     nên một đoạn mã không thể có hai màu khác nhau giữa hai nơi.
 *  2. IFRAME. Bản xem trước artifact nằm trong iframe; nội dung của nó KHÔNG in ra được. Thay
 *     bằng một dòng ghi chú thành thật thay vì để lại một ô trắng bí ẩn.
 *  3. NÚT BẤM. "Tải", "Sao chép", "Mở rộng"… vô nghĩa trên giấy.
 */
function prepareForPrint(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('iframe').forEach((f) => {
    const note = document.createElement('div');
    note.setAttribute('data-tw-print-note', '');
    note.textContent = '[Bản xem trước tương tác — không in ra được. Phần mã bên dưới là nội dung đầy đủ.]';
    f.replaceWith(note);
  });

  clone.querySelectorAll('button').forEach((b) => b.remove());

  clone.querySelectorAll<HTMLElement>('[style*="color"]').forEach((el) => {
    const c = el.style.color;
    if (c) el.style.color = ensureContrast(c, PAPER);
  });

  return clone;
}

/**
 * In một hoặc nhiều phần trả lời ra PDF, GIỮ ĐÚNG cách nó đang hiển thị.
 *
 * Vì sao nhân bản DOM chứ không dựng lại từ Markdown: `mdLite` ở trên chỉ hiểu tiêu đề, đậm,
 * nghiêng, danh sách và khối mã — một BẢNG markdown, thứ hay gặp nhất trong câu trả lời có dữ
 * liệu, sẽ bị đổ ra thành mấy dòng đầy dấu gạch. Nhân bản đúng phần đã hiển thị thì bảng, khối
 * mã tô màu, trích dẫn, liên kết… ra giấy y như trên màn hình, và sẽ tự đúng theo mỗi lần
 * ChatMarkdown được nâng cấp mà không phải sửa lại chỗ này.
 */
export function exportRenderedPdf(opts: { title: string; subtitle?: string; nodes: HTMLElement[] }): void {
  const printable = opts.nodes.filter(Boolean).map(prepareForPrint);
  if (!printable.length) return;
  const when = new Date().toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const body = printable.map((n) => `<div class="turn">${n.innerHTML}</div>`).join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  ${PRINT_VARS}
  @page { margin: 16mm 14mm; }
  body { margin:0; background:#fff; color:#1E2230;
         font: 13.5px/1.65 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .head { border-bottom:1px solid #ECEDF3; padding-bottom:10px; margin-bottom:16px; }
  .head h1 { margin:0; font-size:18px; }
  .meta { color:#9AA3B5; font-size:11px; margin-top:3px; }
  .turn { margin-bottom:14px; }
  /* Đừng cắt đôi một bảng hay một khối mã giữa hai trang giấy. */
  table, pre, blockquote { break-inside: avoid; page-break-inside: avoid; }
  table { border-collapse:collapse; width:100%; }
  img, svg { max-width:100%; height:auto; }
  [data-tw-print-note] { color:#6B7280; font-size:11.5px; font-style:italic; padding:8px 10px;
                         border:1px dashed #ECEDF3; border-radius:8px; }
  .foot { margin-top:18px; padding-top:10px; border-top:1px solid #ECEDF3;
          color:#9AA3B5; font-size:11px; text-align:right; }
</style></head><body>
  <div class="head"><h1>${esc(opts.title)}</h1><div class="meta">${opts.subtitle ? esc(opts.subtitle) + ' · ' : ''}Xuất ngày ${esc(when)}</div></div>
  ${body}
  <div class="foot">Larkwave</div>
</body></html>`;

  printHtml(html);
}
