/**
 * CSS của ba trang cửa hàng, gom một chỗ. Dùng `<style href precedence>` (React 19): thẻ được
 * hoist lên `<head>`, có mặt ngay trong HTML máy chủ trả về, và nhiều component cùng render nó
 * chỉ sinh MỘT bản — cùng cơ chế với BlogStyles.
 *
 * Cửa hàng nằm trong nhóm TỐI (providers.tsx) và bản tối là bản duy nhất được thiết kế, nên màu
 * nhấn viết thẳng; nền/chữ/viền vẫn đi qua biến `--tw-*` để khớp header/footer dùng chung.
 *
 * Ảnh sản phẩm: `aspect-ratio` cố định + `object-fit: cover` để ẢNH KHÔNG quyết định chiều cao
 * thẻ — ảnh sản phẩm bên portal đủ mọi tỉ lệ, thả tự do là lưới so le ngay hàng đầu tiên.
 */
export const STORE_CSS = `
.tw-st-wrap{max-width:1140px;margin:0 auto;padding:0 clamp(16px,5vw,56px) 72px;}

/* ── Tab loại hàng / chuyên mục ── */
/* max-width:100% + min-width:0 là thứ làm overflow-x:auto ở trên thực sự có tác dụng.
   Đo ngày 25/09/2026 ở 375px: dưới 640px .tw-st-filter đổi sang cột với align-items:flex-start,
   nên dải tab không còn bị kéo theo khung mà tự rộng theo NỘI DUNG — đo được 2229px, tức
   clientWidth bằng scrollWidth nên KHÔNG cuộn được: các chuyên mục nằm ngoài màn hình và không có
   cách nào tới. Thanh cuộn đã bị ẩn (scrollbar-width:none) nên lỗi này im lặng hoàn toàn.
   KHÔNG dùng dấu huyền ngược trong chú thích này: cả khối CSS nằm trong một template literal,
   một dấu như vậy là kết thúc chuỗi và cả tệp không biên dịch được. */
.tw-st-tabs{display:flex;gap:6px;overflow-x:auto;max-width:100%;min-width:0;scrollbar-width:none;padding:4px 2px;margin:0 -2px;-webkit-overflow-scrolling:touch;}
.tw-st-tabs::-webkit-scrollbar{display:none;}
.tw-st-tab{flex:none;padding:9px 16px;border-radius:999px;font-size:14px;font-weight:600;color:var(--tw-text-sub,#A9B0C3);border:1px solid transparent;white-space:nowrap;transition:color .25s ease,background-color .25s ease,border-color .25s ease;}
.tw-st-tab:hover{color:var(--tw-text,#fff);background:rgba(255,255,255,.05);}
.tw-st-tab[aria-current="true"]{color:#fff;background:linear-gradient(135deg,#6C5CE7,#A66BFF);box-shadow:0 8px 24px rgba(108,92,231,.35);}
.tw-st-tab small{opacity:.7;font-weight:500;margin-left:5px;font-size:12px;}

/* ── Ô tìm kiếm (form GET thuần — không cần JavaScript) ── */
.tw-st-search{display:flex;gap:8px;align-items:center;}
.tw-st-search input{min-width:0;width:min(320px,52vw);padding:9px 14px;border-radius:999px;font-size:14px;color:var(--tw-text,#fff);background:rgba(255,255,255,.05);border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.14));}
.tw-st-search input::placeholder{color:var(--tw-text-faint,#7C849A);}
.tw-st-search input:focus{outline:2px solid #A66BFF;outline-offset:1px;}
.tw-st-search button{flex:none;padding:9px 16px;border-radius:999px;font-size:14px;font-weight:600;color:#fff;background:linear-gradient(135deg,#6C5CE7,#A66BFF);border:0;cursor:pointer;}

.tw-st-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:22px 0 18px;font-size:14px;color:var(--tw-text-sub,#A9B0C3);}

/* ── Hàng bộ lọc: nhãn đứng yên bên trái, chip cuộn ngang bên phải ──
   Nhãn PHẢI có mặt. Hai hàng chip liền nhau (công nghệ rồi chuyên mục) mà không gắn nhãn thì
   nhìn như một danh sách bị xuống dòng, và người dùng không biết mình đang lọc theo cái gì. */
.tw-st-filter{display:flex;align-items:center;gap:10px;margin:0 0 10px;min-width:0;}
.tw-st-filter-label{flex:none;font-size:12.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--tw-text-faint,#7C849A);}
@media (max-width:640px){.tw-st-filter{flex-direction:column;align-items:flex-start;gap:4px;}}
.tw-st-bar a{color:#C4B4FF;font-weight:600;}

/* ── Lưới + thẻ sản phẩm ── */
.tw-st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:22px;}
@media (max-width:640px){.tw-st-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;}}

.tw-st-card{display:flex;flex-direction:column;height:100%;border-radius:18px;overflow:hidden;color:var(--tw-text,#fff);background:var(--tw-pub-card,rgba(255,255,255,.04));border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.1));transition:transform .3s cubic-bezier(.2,.8,.2,1),border-color .3s ease,box-shadow .3s ease;}
.tw-st-card:hover{transform:translateY(-3px);border-color:rgba(166,107,255,.45);box-shadow:0 18px 40px rgba(0,0,0,.35);}
.tw-st-card:focus-visible{outline:2px solid #A66BFF;outline-offset:2px;}
.tw-st-thumb{position:relative;aspect-ratio:1.6/1;overflow:hidden;background:#12101F;flex:none;}
.tw-st-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.8,.2,1);}
.tw-st-card:hover .tw-st-thumb img{transform:scale(1.05);}
.tw-st-thumb-fallback{position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(135deg,hsl(var(--tw-st-hue,265deg) 58% 30%),hsl(var(--tw-st-hue,265deg) 68% 16%));}
.tw-st-thumb-letter{font-size:46px;font-weight:800;line-height:1;color:rgba(255,255,255,.38);text-shadow:0 2px 14px rgba(0,0,0,.35);}
.tw-st-thumb-icon{position:absolute;top:10px;left:12px;font-size:19px;opacity:.85;}
/* Phiên bản nằm ĐÈ lên ảnh, góc dưới phải: nó là thông tin phụ, chiếm một dòng riêng trong thân
   thẻ thì đẩy giá xuống và làm thẻ cao thêm mà không đáng. */
.tw-st-ver{position:absolute;right:8px;bottom:8px;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700;color:#fff;background:rgba(11,9,20,.72);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(4px);}

/* ── Chip công nghệ trên thẻ ── */
.tw-st-stack{display:flex;flex-wrap:wrap;gap:6px;}
.tw-st-tech{padding:3px 9px;border-radius:7px;font-size:11.5px;font-weight:600;color:#9FE8D0;background:rgba(63,184,160,.12);border:1px solid rgba(63,184,160,.26);white-space:nowrap;}
.tw-st-tech.more{color:var(--tw-text-faint,#7C849A);background:rgba(255,255,255,.05);border-color:var(--tw-pub-card-border,rgba(255,255,255,.12));}

.tw-st-body{display:flex;flex-direction:column;gap:7px;padding:14px 15px 15px;flex:1;}
.tw-st-cat{font-size:12px;font-weight:600;color:#C4B4FF;text-transform:uppercase;letter-spacing:.4px;}
.tw-st-name{margin:0;font-size:15.5px;font-weight:700;line-height:1.35;}
.tw-st-desc{margin:0;font-size:13.5px;line-height:1.5;color:var(--tw-text-sub,#A9B0C3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.tw-st-foot{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:auto;padding-top:8px;}
.tw-st-price{font-size:17px;font-weight:800;color:#fff;}
.tw-st-sold{font-size:12.5px;color:var(--tw-text-faint,#7C849A);}

.tw-st-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;}
.tw-st-badge.ok{color:#7BE3B6;background:rgba(63,184,160,.14);border:1px solid rgba(63,184,160,.3);}
.tw-st-badge.out{color:#FFA8A8;background:rgba(229,99,77,.14);border:1px solid rgba(229,99,77,.3);}

/* ── Chip (ngôn ngữ, định dạng, phiên bản) ── */
.tw-st-chips{display:flex;flex-wrap:wrap;gap:8px;}
.tw-st-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:600;color:#C4B4FF;background:rgba(108,92,231,.14);border:1px solid rgba(108,92,231,.28);white-space:nowrap;}

/* ── Trang chi tiết ── */
.tw-st-detail{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:clamp(20px,4vw,44px);align-items:start;}
@media (max-width:860px){.tw-st-detail{grid-template-columns:1fr;}}
.tw-st-hero-img{width:100%;aspect-ratio:1.6/1;object-fit:cover;border-radius:18px;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.1));background:#12101F;}
.tw-st-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;margin-top:12px;}
.tw-st-gallery img{width:100%;aspect-ratio:1.4/1;object-fit:cover;border-radius:10px;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.1));}
.tw-st-buy{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 26px;border-radius:999px;font-size:15.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6C5CE7,#A66BFF);box-shadow:0 12px 32px rgba(108,92,231,.35);transition:transform .25s ease;}
.tw-st-buy:hover{transform:translateY(-2px);color:#fff;}
.tw-st-prose{font-size:15px;line-height:1.7;color:var(--tw-text-sub,#C6CBD8);}
.tw-st-prose p{margin:0 0 12px;}

/* Dải nói rõ đơn hàng đang đặt ở đâu — giai đoạn 1 còn ở portal. Thà nói trước còn hơn để
   người dùng bấm Mua rồi mới thấy mình nhảy sang một tên miền khác. */
.tw-st-note{display:flex;gap:10px;align-items:flex-start;padding:12px 15px;border-radius:14px;font-size:13.5px;line-height:1.55;color:var(--tw-text-sub,#A9B0C3);background:rgba(108,92,231,.08);border:1px solid rgba(108,92,231,.22);}
.tw-st-note a{color:#C4B4FF;font-weight:600;}

.tw-st-empty{padding:44px 16px;text-align:center;color:var(--tw-text-faint,#7C849A);font-size:15px;border:1px dashed var(--tw-pub-card-border,rgba(255,255,255,.12));border-radius:18px;}

/* ── Phân trang ── */
.tw-st-pager{display:flex;gap:6px;justify-content:center;align-items:center;margin-top:36px;flex-wrap:wrap;}
.tw-st-page{min-width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;border-radius:10px;font-size:14px;font-weight:600;color:var(--tw-text-sub,#A9B0C3);border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.12));transition:color .25s ease,background-color .25s ease;}
.tw-st-page:hover{color:#fff;background:rgba(255,255,255,.06);}
.tw-st-page[aria-current="page"]{color:#fff;background:linear-gradient(135deg,#6C5CE7,#A66BFF);border-color:transparent;}
.tw-st-page[aria-disabled="true"]{opacity:.35;pointer-events:none;}
.tw-st-ellipsis{color:var(--tw-text-faint,#7C849A);padding:0 4px;}

@media (prefers-reduced-motion: reduce){
  .tw-st-card,.tw-st-tab,.tw-st-page,.tw-st-buy,.tw-st-thumb img{transition:none !important;}
  .tw-st-card:hover{transform:none !important;}
  .tw-st-card:hover .tw-st-thumb img{transform:none !important;}
  .tw-st-buy:hover{transform:none !important;}
}
`;

export function StoreStyles() {
  return (
    <style href="tw-store" precedence="default">
      {STORE_CSS}
    </style>
  );
}
