/**
 * Template reuse (v1): curated "blueprints" for the most common app types. When a
 * prompt clearly matches one, we inject a vetted structure + feature + polish
 * checklist into codegen so the result is complete, consistent and professional —
 * fewer missing pieces ⇒ fewer fix-loops ⇒ lower token cost. Purely additive: if
 * nothing matches, generation is unchanged. (v2 = start from real template files.)
 *
 * Matching uses whole-token / whole-phrase boundaries and DISTINCTIVE keywords
 * only — common standalone words (e.g. "sản phẩm", "quản lý", "cá nhân") are
 * deliberately excluded so an unrelated app never gets the wrong checklist.
 */
export interface AppTemplate {
  id: string;
  label: string;
  /** Distinctive keywords/phrases; matched as whole tokens (not substrings). */
  keywords: string[];
  /** Vetted guidance appended to the spec for this app type. */
  guide: string;
}

export const APP_TEMPLATES: AppTemplate[] = [
  {
    id: 'landing',
    label: 'Landing page',
    keywords: ['landing', 'landing page', 'trang landing', 'trang đích', 'one page', 'one-page'],
    guide:
      'MẪU LANDING PAGE — sinh đủ các phần (theo thứ tự), hiện đại + có animation mượt:\n' +
      '1) Header dính (sticky) + logo + menu cuộn mượt + nút CTA.\n' +
      '2) Hero: tiêu đề lớn, mô tả, 2 nút CTA, ảnh/illustration, hiệu ứng fade/slide khi vào.\n' +
      '3) Logo cloud / social proof. 4) Features (3–6 thẻ icon + tiêu đề + mô tả).\n' +
      '5) How it works (các bước). 6) Pricing (2–3 gói, nổi bật gói giữa).\n' +
      '7) Testimonials. 8) FAQ (accordion). 9) CTA cuối. 10) Footer đầy đủ.\n' +
      'Responsive hoàn chỉnh, dùng gradient + bo góc + bóng đổ tinh tế.',
  },
  {
    id: 'todo',
    label: 'Todo / Task app',
    keywords: ['todo', 'to-do', 'to do', 'task', 'checklist', 'việc cần làm', 'danh sách việc'],
    guide:
      'MẪU TODO/TASK — UX gọn, mượt:\n' +
      '• Thêm/sửa/xoá task; đánh dấu hoàn thành; lọc (Tất cả/Đang làm/Xong); xoá đã xong.\n' +
      '• Ưu tiên/nhãn/hạn (nếu hợp lý); kéo-thả sắp xếp nếu được.\n' +
      '• Lưu localStorage (hoặc backend nếu yêu cầu có đăng nhập). Đếm số việc còn lại.\n' +
      '• Empty state đẹp, animation khi thêm/xoá, responsive.',
  },
  {
    id: 'dashboard',
    label: 'Dashboard / Admin',
    keywords: ['dashboard', 'bảng điều khiển', 'admin panel', 'trang quản trị', 'analytics', 'crm'],
    guide:
      'MẪU DASHBOARD/ADMIN — bố cục chuẩn:\n' +
      '• Sidebar điều hướng + topbar (search, user menu). Responsive (sidebar thu gọn ở mobile).\n' +
      '• Trang tổng quan: hàng thẻ KPI (số liệu + delta), 1–2 biểu đồ, bảng dữ liệu gần đây.\n' +
      '• Bảng có sort/filter/phân trang; trạng thái bằng tag màu.\n' +
      '• Nếu có backend: CRUD đầy đủ cho các thực thể chính. Loading/empty states gọn gàng.',
  },
  {
    id: 'shop',
    label: 'E-commerce / Shop',
    keywords: ['shop', 'ecommerce', 'e-commerce', 'thương mại điện tử', 'giỏ hàng', 'cửa hàng', 'bán hàng online'],
    guide:
      'MẪU SHOP — luồng mua sắm:\n' +
      '• Trang danh sách sản phẩm (lưới + lọc theo danh mục/giá + tìm kiếm).\n' +
      '• Trang chi tiết sản phẩm (ảnh, mô tả, giá, chọn biến thể, nút thêm giỏ).\n' +
      '• Giỏ hàng (sửa số lượng, tổng tiền) + trang thanh toán (form thông tin).\n' +
      '• Định dạng tiền tệ VND, ảnh placeholder đẹp, responsive, animation thêm-giỏ.',
  },
  {
    id: 'blog',
    label: 'Blog / Content',
    keywords: ['blog', 'tin tức', 'bài viết', 'magazine'],
    guide:
      'MẪU BLOG — đọc dễ chịu:\n' +
      '• Trang chủ: bài nổi bật + lưới bài viết (ảnh, tiêu đề, tóm tắt, ngày, tag).\n' +
      '• Trang bài viết: typography đẹp, mục lục nếu dài, bài liên quan.\n' +
      '• Lọc theo tag/chuyên mục + tìm kiếm. Nếu có CMS/backend: CRUD bài viết.\n' +
      '• Responsive, tối ưu đọc trên mobile.',
  },
  {
    id: 'portfolio',
    label: 'Portfolio / CV',
    keywords: ['portfolio', 'cv', 'resume', 'hồ sơ cá nhân'],
    guide:
      'MẪU PORTFOLIO — gây ấn tượng:\n' +
      '• Hero giới thiệu (tên, nghề, ảnh/avatar, CTA liên hệ/tải CV).\n' +
      '• Giới thiệu, Kỹ năng, Dự án (lưới thẻ có ảnh + link), Kinh nghiệm (timeline), Liên hệ (form).\n' +
      '• Animation khi cuộn, dark mode, responsive, gu thiết kế hiện đại.',
  },
];

/** Lowercase Unicode word tokens of a string. */
function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * First template whose keyword appears as a WHOLE token (or contiguous token
 * phrase) in the prompt — so "báo" can't match inside "báo cáo" and a one-word
 * incidental hit can't trigger a whole-template injection.
 */
export function matchTemplate(prompt: string): AppTemplate | null {
  const joined = ` ${tokenize(prompt).join(' ')} `;
  return (
    APP_TEMPLATES.find((t) =>
      t.keywords.some((k) => {
        const kt = tokenize(k);
        return kt.length > 0 && joined.includes(` ${kt.join(' ')} `);
      }),
    ) ?? null
  );
}

/** Guidance block to append to the spec for a matched type ('' when no match). */
export function templateGuide(prompt: string): string {
  const t = matchTemplate(prompt);
  return t
    ? `\n\n----- KHUÔN MẪU CHUẨN (${t.label}) — bám theo để app đầy đủ & chuyên nghiệp -----\n${t.guide}\n`
    : '';
}

// ── v2: real starter FILE-SETS ──────────────────────────────────────────────
// For a clearly-matched STATIC type we seed a vetted, buildable Vite+React app and
// let the model CUSTOMIZE it (the tested delta/iterate path) instead of generating
// from scratch — fewer output tokens + guaranteed-correct structure. normalizeWeb
// still fills package.json/config, so a template only needs the app sources.

const LANDING_CSS = `:root{--bg:#0b0d12;--panel:#12151c;--card:#161a23;--text:#e8eaf0;--muted:#9aa3b5;--brand:#6c5ce7;--brand2:#8b7bf0;--ring:#262b38;--radius:16px}
*{box-sizing:border-box}html,body,#root{margin:0;height:100%}
body{background:var(--bg);color:var(--text);font-family:Inter,system-ui,Segoe UI,Roboto,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.container{max-width:1080px;margin:0 auto;padding:0 20px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:999px;font-weight:600;border:1px solid var(--ring);background:transparent;color:var(--text);cursor:pointer;transition:transform .15s,filter .15s}
.btn:hover{transform:translateY(-1px)}
.btn-primary{background:linear-gradient(135deg,var(--brand),var(--brand2));border:none;color:#fff;box-shadow:0 10px 26px rgba(108,92,231,.4)}
.nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(8px);background:rgba(11,13,18,.7);border-bottom:1px solid var(--ring)}
.nav .container{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:800;font-size:18px}
.nav-links{display:flex;gap:22px;color:var(--muted)}
.hero{text-align:center;padding:96px 0 64px}
.hero h1{font-size:clamp(34px,6vw,60px);line-height:1.05;margin:0 0 18px;letter-spacing:-.02em}
.grad{background:linear-gradient(135deg,var(--brand),var(--brand2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{font-size:19px;color:var(--muted);max-width:620px;margin:0 auto 28px}
.row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.section{padding:72px 0}
.section h2{font-size:clamp(26px,4vw,38px);text-align:center;margin:0 0 8px}
.section p.sub{text-align:center;color:var(--muted);margin:0 auto 40px;max-width:560px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--ring);border-radius:var(--radius);padding:24px}
.card h3{margin:6px 0 8px}.card p{color:var(--muted);margin:0}
.ico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,var(--brand),var(--brand2));font-size:20px}
.price{text-align:center}.price .amt{font-size:40px;font-weight:800;margin:10px 0}
.price.feat{border-color:var(--brand);box-shadow:0 16px 40px rgba(108,92,231,.18)}
.footer{border-top:1px solid var(--ring);color:var(--muted);padding:36px 0;text-align:center}
.reveal{opacity:0;transform:translateY(14px);animation:rise .6s ease forwards}
@keyframes rise{to{opacity:1;transform:none}}
@media(max-width:640px){.nav-links{display:none}}`;

const LANDING_APP = `import './index.css';

const ICON = { fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', width: 22, height: 22, viewBox: '0 0 24 24' };
const features = [
  { icon: (<svg {...ICON}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>), title: 'Nhanh chóng', desc: 'Khởi chạy trong vài phút, không cần cấu hình phức tạp.' },
  { icon: (<svg {...ICON}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>), title: 'Đẹp mặc định', desc: 'Giao diện hiện đại, responsive trên mọi thiết bị.' },
  { icon: (<svg {...ICON}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>), title: 'An toàn', desc: 'Bảo mật theo chuẩn, dữ liệu của bạn được bảo vệ.' },
];
const plans = [
  { name: 'Miễn phí', price: '0đ', feats: ['Tính năng cơ bản', '1 dự án', 'Hỗ trợ cộng đồng'], feat: false },
  { name: 'Pro', price: '199k', feats: ['Mọi tính năng', 'Không giới hạn dự án', 'Hỗ trợ ưu tiên'], feat: true },
  { name: 'Doanh nghiệp', price: 'Liên hệ', feats: ['Tuỳ chỉnh riêng', 'SLA', 'Quản lý chuyên trách'], feat: false },
];
const faqs = [
  { q: 'Tôi có cần thẻ tín dụng để bắt đầu?', a: 'Không. Bạn có thể dùng gói miễn phí ngay lập tức.' },
  { q: 'Có thể huỷ bất cứ lúc nào không?', a: 'Có, bạn huỷ bất cứ lúc nào, không ràng buộc.' },
];

export default function App() {
  return (
    <div>
      <nav className="nav">
        <div className="container">
          <div className="brand">Thương hiệu</div>
          <div className="nav-links"><a href="#features">Tính năng</a><a href="#pricing">Bảng giá</a><a href="#faq">FAQ</a></div>
          <button className="btn btn-primary">Bắt đầu</button>
        </div>
      </nav>

      <header className="hero container reveal">
        <h1>Tiêu đề lớn cho <span className="grad">sản phẩm của bạn</span></h1>
        <p className="lead">Mô tả ngắn gọn, hấp dẫn về giá trị bạn mang lại cho khách hàng.</p>
        <div className="row"><button className="btn btn-primary">Dùng thử miễn phí</button><button className="btn">Xem demo</button></div>
      </header>

      <section id="features" className="section">
        <div className="container">
          <h2>Tính năng nổi bật</h2>
          <p className="sub">Mọi thứ bạn cần để thành công.</p>
          <div className="grid">
            {features.map((f) => (
              <div key={f.title} className="card"><div className="ico">{f.icon}</div><h3>{f.title}</h3><p>{f.desc}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="section">
        <div className="container">
          <h2>Bảng giá</h2>
          <p className="sub">Chọn gói phù hợp với bạn.</p>
          <div className="grid">
            {plans.map((p) => (
              <div key={p.name} className={'card price' + (p.feat ? ' feat' : '')}>
                <h3>{p.name}</h3><div className="amt grad">{p.price}</div>
                {p.feats.map((x) => (<p key={x}>✓ {x}</p>))}
                <button className={'btn ' + (p.feat ? 'btn-primary' : '')} style={{ marginTop: 14 }}>Chọn gói</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="section">
        <div className="container">
          <h2>Câu hỏi thường gặp</h2>
          <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
            {faqs.map((f) => (<div key={f.q} className="card"><h3>{f.q}</h3><p>{f.a}</p></div>))}
          </div>
        </div>
      </section>

      <footer className="footer"><div className="container">© 2026 Thương hiệu. Đã đăng ký bản quyền.</div></footer>
    </div>
  );
}`;

const LANDING_MAIN = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);`;

const LANDING_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet"/>
<title>Landing</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`;

/** Complete, buildable starter file-set for a template id ([] = no file template). */
export function templateFiles(id: string): { path: string; content: string }[] {
  if (id === 'landing') {
    return [
      { path: 'index.html', content: LANDING_HTML },
      { path: 'src/main.tsx', content: LANDING_MAIN },
      { path: 'src/App.tsx', content: LANDING_APP },
      { path: 'src/index.css', content: LANDING_CSS },
    ];
  }
  return [];
}
