/**
 * Sinh trường SEO cho bài blog tự đăng.
 *
 * Trang /blog/[slug] đã có sẵn generateMetadata + JSON-LD + canonical + OG/Twitter, và sitemap.ts
 * tự nạp mọi bài đã đăng. Bộ máy đó KHÔNG thiếu gì — nó chỉ đang rỗng. Việc của file này là nạp
 * cho nó đầu vào tử tế, vì metadata lấy đúng bốn thứ: seoTitle, seoDescription, tags, coverImage.
 *
 * Các hàm ở đây thuần (không I/O) để test được — xem blog-seo.spec.ts.
 */

/** Google cắt tiêu đề quanh 60 ký tự; dài hơn là phần đuôi không ai đọc được trên kết quả tìm kiếm. */
const TITLE_MAX = 60;
/** Mô tả quanh 155 ký tự; dài hơn bị cắt bằng dấu "…" của Google chứ không phải của mình. */
const DESC_MAX = 155;

/**
 * Từ KHÔNG được làm thẻ: hư từ, và cả động từ / danh từ chung chung.
 *
 * Danh sách đầu tiên của tôi chỉ có hư từ ("và", "của"), nên bài thật đầu tiên ra thẻ
 * ["howto","cách","tạo","website","bán","hàng"] — bốn trong sáu thẻ là chữ cắt rời khỏi câu, không
 * ai bấm vào, và vì listPublished lọc theo tag nên chúng tạo ra những trang danh sách rỗng nghĩa.
 * Thẻ sai còn tệ hơn không có thẻ.
 */
const STOPWORDS = new Set([
  // hư từ
  'và', 'là', 'của', 'có', 'cho', 'với', 'các', 'những', 'được', 'khi', 'thì', 'mà', 'này', 'đó',
  'một', 'trong', 'ra', 'lên', 'về', 'từ', 'đến', 'bằng', 'như', 'nếu', 'hay', 'hoặc', 'tại',
  'theo', 'sau', 'trước', 'rồi', 'nữa', 'cũng', 'rất', 'nhiều', 'ít', 'sao', 'gì', 'nào', 'thế',
  'còn', 'vẫn', 'chỉ', 'cùng', 'khác', 'mỗi', 'tất', 'hơn', 'nhất', 'đang', 'sẽ', 'đã', 'chưa',
  // động từ / danh từ chung chung — có trong mọi tiêu đề nên không phân biệt được bài nào với bài nào
  'cách', 'tạo', 'làm', 'dùng', 'sử', 'dụng', 'giúp', 'biết', 'cần', 'phải', 'nên', 'muốn', 'để',
  'bạn', 'tôi', 'mình', 'người', 'việc', 'điều', 'thứ', 'lần', 'hàng', 'bán', 'mới', 'tự',
  'không', 'chính', 'thêm', 'xong', 'luôn', 'ngay', 'sẵn',
  // tiếng Anh
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'is', 'are', 'how', 'what',
  'your', 'you', 'my', 'it', 'be', 'do', 'can', 'make', 'get', 'use',
]);

/** Dưới ngưỡng này gần như chắc là mảnh vụn của một từ ghép ("bán", "web"), không phải chủ đề. */
const MIN_TAG_LEN = 4;

/** Bỏ cú pháp Markdown để còn lại chữ người đọc thật sự thấy. */
export function stripMarkdown(md: string): string {
  return (md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')        // khối code
    .replace(/`([^`]*)`/g, '$1')            // code inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')  // ảnh
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link → giữ chữ
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')     // tiêu đề
    .replace(/^\s{0,3}>\s?/gm, '')          // trích dẫn
    .replace(/^\s*[-*+]\s+/gm, '')          // gạch đầu dòng
    .replace(/(\*\*|__|\*|_|~~)/g, '')      // in đậm/nghiêng
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cắt ở ranh giới TỪ, không cắt giữa chữ. Trả về chuỗi <= max (đã tính cả dấu "…"). */
function clipAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/**
 * Tiêu đề SEO. Thêm đuôi thương hiệu CHỈ KHI còn chỗ — nhồi cho bằng được rồi bị cắt thì mất cả
 * từ khoá lẫn thương hiệu.
 */
export function deriveSeoTitle(title: string, brand = 'Larkwave'): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return brand;
  const suffix = ` · ${brand}`;
  if (t.length + suffix.length <= TITLE_MAX) return t + suffix;
  return clipAtWord(t, TITLE_MAX);
}

/** Mô tả SEO: ưu tiên caption (người/AI viết để tóm tắt), thiếu thì rút từ thân bài. */
export function deriveSeoDescription(caption: string, body: string): string {
  const fromCaption = (caption ?? '').replace(/\s+/g, ' ').trim();
  const source = fromCaption || stripMarkdown(body);
  if (!source) return '';
  return clipAtWord(source, DESC_MAX);
}

/**
 * Thẻ (tags) — KHÔNG phải để nhồi meta keywords (Google bỏ qua từ lâu), mà để liên kết nội bộ:
 * BlogService.listPublished lọc theo tag, nên thẻ tốt tạo ra đường đi giữa các bài.
 */
export function deriveTags(
  topic: string,
  title: string,
  template?: string,
  max = 5,
  explicit?: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string, minLen: number) => {
    const w = raw.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
    if (!w || w.length < minLen || STOPWORDS.has(w) || seen.has(w)) return;
    seen.add(w);
    out.push(w);
  };

  if (template) push(template, 1);

  // Thẻ do NGƯỜI chỉ định thì dùng nguyên: cụm nhiều chữ ("website bán hàng") mới là thẻ thật, và
  // không có cách nào cắt được cụm đó ra từ một câu mà không cần phân tích ngôn ngữ.
  if (explicit?.length) {
    for (const t of explicit) {
      if (out.length >= max) break;
      push(t, 2);
    }
    return out.slice(0, max);
  }

  // Đường lùi khi topic không kèm thẻ: chỉ giữ từ đủ dài và không chung chung. Cố ý ra ÍT thẻ —
  // vài thẻ đúng hơn hẳn sáu thẻ trong đó bốn cái là chữ vụn.
  for (const src of [topic, title]) {
    for (const w of (src ?? '').split(/[\s,./|–—-]+/)) {
      if (out.length >= max) break;
      push(w, MIN_TAG_LEN);
    }
  }
  return out.slice(0, max);
}

/**
 * Chuyên mục của một bài, suy ra từ chủ đề + tiêu đề.
 *
 * Vì sao là DANH SÁCH ĐÓNG chứ không để AI tự đặt tên: chuyên mục tự do sẽ đẻ ra "Hướng dẫn",
 * "Huong dan", "Hướng dẫn cơ bản", "Cách làm"… và tab trên /blog vỡ thành hàng chục mục mỗi mục
 * một bài — tức là không còn là chuyên mục nữa. Thà ít mục mà gom đúng.
 *
 * Khác `deriveTags`: thẻ thì nhiều và hẹp, chuyên mục thì MỘT và rộng. Đừng gộp hai thứ.
 */
const CATEGORY_RULES: { name: string; keys: string[] }[] = [
  // Xếp từ HẸP tới RỘNG: luật đứng trước thắng. Bài nào cũng nhắc "website", nên nếu để mục đó
  // lên đầu thì mọi bài dồn vào một chỗ và tab chuyên mục thành vô dụng.
  //
  // "Chi phí & so sánh" đứng TRƯỚC "AI & trợ lý" vì một bài so sánh chi phí thường đem AI ra làm
  // MỘT VẾ được so ("thuê người làm website so với tự dựng bằng AI") — chủ đề là so sánh, không
  // phải AI. Đo trên bài thật: để AI trước thì bài đó bị xếp nhầm.
  { name: 'Tên miền & hosting', keys: ['tên miền', 'ten mien', 'domain', 'hosting', 'dns', 'ssl', 'https', 'deploy'] },
  { name: 'Tự động hoá', keys: ['tự động', 'tu dong', 'automation', 'lark', 'bitable', 'workflow', 'bot'] },
  { name: 'Chi phí & so sánh', keys: ['chi phí', 'chi phi', 'giá', 'bao nhiêu', 'so sánh', 'so sanh', 'thuê', 'rẻ'] },
  { name: 'AI & trợ lý', keys: ['ai', 'trợ lý', 'tro ly', 'chatgpt', 'claude', 'chatbot'] },
  // CỐ Ý bỏ 'shop' và 'khách hàng': chúng là ĐỐI TƯỢNG chứ không phải CHỦ ĐỀ. "Trợ lý AI viết nội
  // dung cho shop" nói về AI, không nói về bán hàng — để 'shop' ở đây là xếp nhầm cả một nhóm bài.
  { name: 'Bán hàng online', keys: ['bán hàng', 'ban hang', 'thương mại', 'đơn hàng', 'giỏ hàng', 'thanh toán'] },
  { name: 'Website', keys: ['website', 'web', 'landing', 'trang web', 'giao diện', 'seo'] },
];

/** Mục mặc định khi không luật nào khớp — luôn có mục, không bao giờ để trống. */
const CATEGORY_FALLBACK = 'Hướng dẫn';

/**
 * Toàn bộ chuyên mục HỢP LỆ. Xuất ra để nơi nào ghi bài cũng kiểm được trước khi ghi.
 *
 * Danh sách này ĐÓNG có chủ ý: tab trên /blog dựng từ chuyên mục, nên mỗi tên mới là một tab mới.
 * Đặt tay một cái tên ngoài danh sách — dù nghe hợp lý như "Kiến thức" — là đẻ ra một tab chỉ có
 * một bài, và không có gì báo cho ai biết. Muốn thêm mục thật thì thêm luật vào CATEGORY_RULES,
 * đừng gõ tên tự do lúc đăng.
 */
export const BLOG_CATEGORIES: readonly string[] = [
  ...CATEGORY_RULES.map((r) => r.name),
  CATEGORY_FALLBACK,
];

/**
 * Tên chuyên mục bằng tiếng Anh.
 *
 * Chuyên mục được lưu trong cơ sở dữ liệu bằng tiếng Việt và đóng vai trò KHOÁ LỌC (`?category=`),
 * nên không dịch được ở tầng dữ liệu mà không làm gãy mọi liên kết lọc đang có. Bảng này chỉ đổi
 * thứ HIỂN THỊ: khoá giữ nguyên, chữ trên màn hình đổi theo ngôn ngữ.
 *
 * Vì sao cần: đo ngày 23/09/2026 trên /blog?lang=en — 10/12 thẻ bài vẫn hiện tên mục tiếng Việt
 * ("Hướng dẫn", "Bán hàng online"), trên một trang mọi thứ khác đã là tiếng Anh.
 *
 * Thiếu khoá thì trả lại chính tên tiếng Việt: một tên chưa dịch vẫn hơn một ô trống.
 */
const CATEGORY_EN: Record<string, string> = {
  'Tên miền & hosting': 'Domains & hosting',
  'Tự động hoá': 'Automation',
  'Chi phí & so sánh': 'Costs & comparisons',
  'AI & trợ lý': 'AI & assistants',
  'Bán hàng online': 'Selling online',
  Website: 'Websites',
  'Hướng dẫn': 'Guides',
};

/** Tên chuyên mục để HIỂN THỊ theo ngôn ngữ. Khoá lọc vẫn là tên tiếng Việt. */
export function categoryLabel(name: string, lang: string): string {
  if (lang === 'vi') return name;
  return CATEGORY_EN[name] ?? name;
}

/**
 * Thẻ bài viết bằng tiếng Anh — cũng chỉ đổi phần HIỂN THỊ, vì lý do y hệt chuyên mục:
 * `?tag=` mang đúng chuỗi đang lưu, đổi chuỗi đó là mọi liên kết lọc đã chia sẻ trỏ vào hư không.
 *
 * Khác chuyên mục ở chỗ thẻ là tập MỞ: 68 thẻ hôm nay, bài mới mai thêm thẻ mới. Nên bảng này
 * không bao giờ đủ, và không cần đủ — thẻ lạ rơi xuống chính tên gốc. Đó là lựa chọn có chủ ý:
 * một thẻ tiếng Việt lọt vào trang tiếng Anh vẫn bấm được và vẫn lọc đúng, còn bỏ trống nó thì
 * người đọc mất hẳn một lối đi.
 *
 * Những thẻ vốn đã là tiếng Anh (howto, seo, api, quiz, webhook, portfolio…) không có mặt ở đây:
 * chúng đi qua nguyên vẹn.
 */
const TAG_EN: Record<string, string> = {
  'an toàn dữ liệu': 'data safety',
  'bảo mật': 'security',
  'biểu mẫu đăng ký': 'signup forms',
  'blog cá nhân': 'personal blog',
  'chăm sóc khách hàng': 'customer support',
  'chi phí làm website': 'website cost',
  'chi phí vận hành': 'running costs',
  'chọn công nghệ': 'choosing a stack',
  'cơ sở dữ liệu': 'databases',
  'cửa hàng nhỏ': 'small shops',
  'danh mục sản phẩm': 'product catalog',
  'đưa web lên mạng': 'going live',
  'game bằng ai': 'ai-made games',
  'game mini': 'mini games',
  'game trắc nghiệm': 'quiz games',
  'game trình duyệt': 'browser games',
  'giáo dục': 'education',
  'khái niệm cơ bản': 'basics',
  'khôi phục dữ liệu': 'data recovery',
  'không cần code': 'no-code',
  'kiến trúc web': 'web architecture',
  'kinh nghiệm làm web': 'lessons learned',
  'làm game html5': 'html5 games',
  'làm web bằng ai': 'building with ai',
  'lỗi thường gặp': 'common mistakes',
  'marketing tương tác': 'interactive marketing',
  'máy chủ': 'servers',
  'nghề tự do': 'freelancing',
  'quản lý lịch hẹn': 'appointment management',
  'quản lý sự kiện': 'event management',
  'quản trị đơn hàng': 'order management',
  'quảng cáo': 'advertising',
  'quán ăn': 'restaurants',
  'sao lưu website': 'website backup',
  'so sánh nền tảng': 'platform comparison',
  'song ngữ': 'bilingual',
  'tên miền': 'domains',
  'thanh toán chuyển khoản': 'bank transfer',
  'thay thế wordpress': 'wordpress alternatives',
  'thu khách hàng': 'lead capture',
  'thuê ngoài': 'outsourcing',
  'thương mại điện tử': 'ecommerce',
  'thực đơn trực tuyến': 'online menu',
  'tích hợp hệ thống': 'system integration',
  'tích hợp thời gian thực': 'realtime integration',
  'tìm kiếm và lọc': 'search & filtering',
  'tối ưu di động': 'mobile optimisation',
  'tốc độ website': 'website speed',
  'tra cứu đơn hàng': 'order lookup',
  'trang giới thiệu công ty': 'company profile site',
  'vòng quay may mắn': 'spin the wheel',
  'web tĩnh': 'static sites',
  'website bán hàng': 'online store',
  'website doanh nghiệp': 'business website',
  'website đa ngôn ngữ': 'multilingual website',
  'website đặt lịch': 'booking website',
};

/** Tên thẻ để HIỂN THỊ theo ngôn ngữ. Khoá lọc vẫn là tên tiếng Việt. */
export function tagLabel(name: string, lang: string): string {
  if (lang === 'vi') return name;
  return TAG_EN[name] ?? name;
}

/**
 * Khớp một khoá trong câu.
 *
 * Khoá NGẮN (≤3 ký tự, không dấu cách) phải khớp theo RANH GIỚI TỪ. Lý do rất cụ thể: `'ai'` mà
 * dùng `includes` sẽ khớp trong "phải", "ngoài", "loại", "mai"… — tức là gần như mọi bài tiếng
 * Việt đều rơi vào mục AI. Lỗi này không kêu thành tiếng, chỉ làm chuyên mục sai âm thầm.
 */
function hasKey(hay: string, key: string): boolean {
  if (key.length > 3 || key.includes(' ')) return hay.includes(key);
  return new RegExp(`(^|[^\\p{L}\\p{N}])${key}($|[^\\p{L}\\p{N}])`, 'u').test(hay);
}

export function deriveCategory(topic: string, title: string): string {
  const hay = `${topic ?? ''} ${title ?? ''}`.toLowerCase();
  // Luật đứng TRƯỚC thắng: danh sách xếp từ hẹp tới rộng, nên "tên miền & hosting" thắng
  // "website" cho bài về DNS — bài nào cũng nhắc "website", nếu để nó trước thì mọi bài rơi hết
  // vào một mục.
  for (const rule of CATEGORY_RULES) {
    if (rule.keys.some((k) => hasKey(hay, k))) return rule.name;
  }
  return CATEGORY_FALLBACK;
}
