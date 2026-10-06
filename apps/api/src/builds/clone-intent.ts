/**
 * Pull a clone TARGET out of a free-text prompt — but only when the user actually asked to copy
 * a site.
 *
 * A bare URL is NOT enough: "app đọc RSS từ https://vnexpress.net/rss" names a data source, and
 * treating it as a clone target would screenshot the wrong thing and derail the build. So we
 * require an explicit copy verb next to the URL. When the user filled the dedicated clone field,
 * that always wins and this never runs.
 */
const CLONE_INTENT =
  /\b(clone|copy)\b|sao\s*ch[ée]p|b[aả]n\s*sao|gi[oố]ng\s*(h[eệ]t|nh[uư])|y\s*h[eệ]t|d[uự]ng\s*l[aạ]i|l[aà]m\s*l[aạ]i|nh[aá]i\s*l[aạ]i/iu;

/**
 * Đuôi tệp hay bị nhầm thành tên miền. "sửa app.js" hay "đọc data.json" KHÔNG phải yêu cầu sao
 * chép một trang web — thiếu danh sách này thì mọi câu nhắc tới tên tệp đều biến thành lệnh clone.
 */
const NOT_TLD = new Set([
  'js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html', 'htm', 'md', 'txt', 'csv', 'xml', 'yml', 'yaml',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'pdf', 'zip', 'rar', 'sh', 'py', 'rb', 'go',
  'java', 'php', 'sql', 'env', 'lock', 'log', 'map', 'xlsx', 'docx', 'pptx', 'exe', 'dmg',
]);

/** Tên miền trần trong câu ("socamdo.com", "www.abc.vn/gioi-thieu") — người ta hiếm khi gõ https://. */
function bareHostFromText(text: string): string | undefined {
  const re = /(?:^|[\s(<"'])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})((?:\/[^\s<>"'`)\]]*)?)/gi;
  for (const m of text.matchAll(re)) {
    const host = m[1].toLowerCase();
    const tld = host.split('.').pop() ?? '';
    if (NOT_TLD.has(tld)) continue;
    if (/^\d+$/.test(host.replace(/\./g, ''))) continue; // "1.2.3" là số phiên bản, không phải host
    try {
      const u = new URL(`https://${host}${m[2] || ''}`);
      return u.toString();
    } catch {
      /* thử token kế tiếp */
    }
  }
  return undefined;
}

/**
 * Người dùng RÕ RÀNG muốn sao chép một trang, nhưng câu chữ không chứa địa chỉ nào dùng được.
 *
 * Đây là ca im lặng tệ nhất của luồng này: "tạo bản sao website socamdo" không có tên miền, nên
 * hệ thống bỏ qua toàn bộ đường sao chép và dựng một app bất kỳ theo mô tả — người dùng nhận về
 * thứ chẳng giống gì mà KHÔNG hề được báo vì sao.
 */
export function cloneIntentWithoutUrl(prompt: string): boolean {
  const text = prompt || '';
  if (!CLONE_INTENT.test(text)) return false;
  return !cloneUrlFromPrompt(text);
}

export function cloneUrlFromPrompt(prompt: string): string | undefined {
  const text = prompt || '';
  if (!CLONE_INTENT.test(text)) return undefined;
  const m = /https?:\/\/[^\s<>"'`)\]]+/i.exec(text);
  // Không có địa chỉ đầy đủ thì thử TÊN MIỀN TRẦN. Người dùng gõ "tạo bản sao website socamdo.com"
  // nhiều hơn hẳn so với dán cả https:// — trước đây câu đó rơi thẳng xuống "không phải clone" và
  // hệ thống lặng lẽ dựng một app bất kỳ theo mô tả.
  if (!m) return bareHostFromText(text);
  // Trim trailing punctuation a sentence leaves glued to the URL ("… https://x.com.").
  const raw = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
