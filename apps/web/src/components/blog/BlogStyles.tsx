/**
 * CSS của hai trang blog, gom một chỗ. Dùng `<style href precedence>` (React 19): thẻ được hoist
 * lên `<head>`, có mặt ngay trong HTML server trả về, và nhiều component cùng render nó chỉ sinh
 * MỘT bản — cùng cơ chế với FxStyles. Không "use client": server component render được luôn.
 *
 * Màu: trang blog nằm trong nhóm ForceDark (providers.tsx) và bản tối là bản DUY NHẤT được thiết
 * kế, nên các màu nhấn (tím lavender #C4B4FF, viền tím mờ) viết thẳng; phần nền/chữ/viền vẫn đi
 * qua biến `--tw-*` để khớp header/footer dùng chung.
 *
 * Ảnh bìa — lý do người dùng chê: ảnh CŨ trên máy chủ là ảnh nền sáng, hồng, có sẵn tiêu đề in
 * trong ảnh. Ba biện pháp ở đây: (1) `aspect-ratio` cố định + `object-fit: cover` để ảnh KHÔNG
 * quyết định chiều cao thẻ (lưới hết so le); (2) `filter` hạ sáng + bớt bão hoà và một lớp `veil`
 * gradient tối đè lên để ảnh sáng hoà vào nền đen-tím thay vì chọi; (3) KHÔNG đặt chữ thật lên
 * giữa ảnh — tiêu đề luôn nằm DƯỚI ảnh, nên ảnh cũ có chữ sẵn cũng không thành "hai tiêu đề".
 */
export const BLOG_CSS = `
.tw-bl-wrap{max-width:1140px;margin:0 auto;padding:0 clamp(16px,5vw,56px) 72px;}

/* ── Tab chuyên mục: một hàng cuộn ngang trên máy nhỏ, không xuống dòng cho khỏi chiếm nửa màn ── */
.tw-bl-tabs{display:flex;gap:6px;overflow-x:auto;max-width:100%;min-width:0;scrollbar-width:none;padding:4px 2px;margin:0 -2px;-webkit-overflow-scrolling:touch;}
.tw-bl-tabs::-webkit-scrollbar{display:none;}
.tw-bl-tab{flex:none;padding:9px 16px;border-radius:999px;font-size:14px;font-weight:600;color:var(--tw-text-sub,#A9B0C3);border:1px solid transparent;white-space:nowrap;transition:color .25s ease,background-color .25s ease,border-color .25s ease;}
.tw-bl-tab:hover{color:var(--tw-text,#fff);background:rgba(255,255,255,.05);}
.tw-bl-tab[aria-current="true"]{color:#fff;background:linear-gradient(135deg,#6C5CE7,#A66BFF);box-shadow:0 8px 24px rgba(108,92,231,.35);}
.tw-bl-tab small{opacity:.7;font-weight:500;margin-left:5px;font-size:12px;}

/* ── Chip thẻ ── */
.tw-bl-tags{display:flex;flex-wrap:wrap;gap:8px;}
.tw-bl-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:600;color:#C4B4FF;background:rgba(108,92,231,.14);border:1px solid rgba(108,92,231,.28);white-space:nowrap;transition:background-color .25s ease,border-color .25s ease,color .25s ease;}
.tw-bl-langs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}
.tw-bl-chip:hover{background:rgba(108,92,231,.26);border-color:rgba(196,180,255,.5);}
.tw-bl-chip[aria-current="true"]{background:#6C5CE7;color:#fff;border-color:#8F7CFF;}
.tw-bl-chip small{opacity:.65;font-weight:500;}

.tw-bl-filterbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:22px 0 18px;font-size:14px;color:var(--tw-text-sub,#A9B0C3);}
.tw-bl-filterbar a{color:#C4B4FF;font-weight:600;}

/* ── Lưới thẻ ── */
.tw-bl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px;}
@media (max-width:640px){.tw-bl-grid{grid-template-columns:1fr;gap:18px;}}

/* ── Thẻ bài viết ── */
.tw-bl-card{border-radius:18px;height:100%;}
.tw-bl-card-link{display:flex;flex-direction:column;height:100%;border-radius:18px;overflow:hidden;color:var(--tw-text,#fff);}
.tw-bl-card-link:focus-visible{outline:2px solid #A66BFF;outline-offset:2px;}
.tw-bl-cover{position:relative;aspect-ratio:1.9/1;overflow:hidden;background:#12101F;flex:none;}
.tw-bl-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.02) contrast(1.02);transform:scale(1.01);transition:transform .8s cubic-bezier(.2,.8,.2,1);}
.tw-bl-card-link:hover .tw-bl-cover img{transform:scale(1.05);}
/* Lớp phủ này sinh ra để CHỮ trên ảnh đọc được. Giờ tiêu đề nằm DƯỚI ảnh, không còn chữ nào
   đè lên, nên phủ 88% đen ở đáy chỉ còn tác dụng bóp chết ảnh. Hạ xuống mức vừa đủ để ảnh cũ
   nền sáng không chọi vào trang tối, và để mép dưới ảnh hoà vào thân thẻ. */
.tw-bl-cover-veil{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(10,8,22,0) 0%,rgba(10,8,22,.06) 60%,rgba(10,8,22,.42) 100%);}
.tw-bl-cover-fallback{position:absolute;inset:0;background:radial-gradient(60% 80% at 20% 20%,rgba(108,92,231,.6),transparent 60%),radial-gradient(50% 70% at 85% 80%,rgba(255,122,182,.38),transparent 60%),radial-gradient(40% 60% at 70% 20%,rgba(79,182,255,.3),transparent 60%),#12101F;}
.tw-bl-cover-fallback{filter:hue-rotate(var(--tw-bl-hue,0deg));display:grid;place-items:center;}
.tw-bl-cover-fallback>span{position:relative;z-index:1;font-size:clamp(46px,9vw,78px);font-weight:800;line-height:1;color:rgba(255,255,255,.22);letter-spacing:-2px;text-shadow:0 2px 24px rgba(0,0,0,.35);}
.tw-bl-cover-fallback::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(180deg,rgba(0,0,0,.9),transparent);}
.tw-bl-body{display:flex;flex-direction:column;gap:9px;padding:16px 18px 18px;flex:1;min-width:0;}
.tw-bl-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--tw-text-faint,#7C849A);}
.tw-bl-cat{color:#C4B4FF;font-weight:700;letter-spacing:.3px;text-transform:uppercase;font-size:11.5px;}
.tw-bl-title{margin:0;font-size:17.5px;font-weight:700;line-height:1.3;letter-spacing:-.2px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.tw-bl-excerpt{margin:0;color:var(--tw-text-sub,#A9B0C3);font-size:14.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;flex:1;}
.tw-bl-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px;font-size:12.5px;color:var(--tw-text-faint,#7C849A);}
.tw-bl-more{color:#C4B4FF;font-weight:600;white-space:nowrap;transition:transform .3s ease;}
.tw-bl-card-link:hover .tw-bl-more{transform:translateX(3px);}

/* Thẻ nổi bật (bài mới nhất): ảnh trái – chữ phải trên màn rộng; xếp dọc như thẻ thường khi hẹp. */
@media (min-width:820px){
  .tw-bl-card-link.is-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);}
  .is-hero .tw-bl-cover{aspect-ratio:auto;min-height:300px;height:100%;}
  .is-hero .tw-bl-body{padding:28px 30px;justify-content:center;gap:12px;}
  .is-hero .tw-bl-title{font-size:clamp(22px,2.6vw,30px);}
  .is-hero .tw-bl-excerpt{font-size:15.5px;-webkit-line-clamp:4;flex:none;}
}

/* ── Phân trang ── */
.tw-bl-pager{display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;margin-top:36px;}
.tw-bl-page{min-width:38px;height:38px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));background:var(--tw-pub-card-bg,rgba(255,255,255,.035));color:var(--tw-text-sub,#A9B0C3);font-weight:600;font-size:14px;transition:border-color .25s ease,color .25s ease;}
.tw-bl-page:hover{color:var(--tw-text,#fff);border-color:rgba(196,180,255,.5);}
.tw-bl-page[aria-current="page"]{background:#6C5CE7;color:#fff;border-color:#8F7CFF;}
.tw-bl-page[aria-disabled="true"]{opacity:.35;pointer-events:none;}
.tw-bl-ellipsis{color:var(--tw-text-faint,#7C849A);padding:0 4px;}

/* ── Trang bài viết: cột bài + cột mục lục dính ở ≥1100px ── */
.tw-bl-post{max-width:1140px;margin:0 auto;padding:clamp(24px,4vw,44px) clamp(16px,5vw,56px) 72px;display:grid;grid-template-columns:minmax(0,1fr);gap:40px;}
.tw-bl-article{max-width:760px;margin:0 auto;width:100%;min-width:0;}
.tw-bl-aside{display:none;}
@media (min-width:1100px){
  .tw-bl-post{grid-template-columns:minmax(0,1fr) 250px;}
  .tw-bl-article{margin:0;}
  .tw-bl-aside{display:block;}
  .tw-bl-aside-in{position:sticky;top:88px;}
  .tw-bl-toc-m{display:none;}
}
.tw-bl-crumbs{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px;margin-bottom:22px;}
.tw-bl-crumbs a{color:#C4B4FF;font-weight:600;}
.tw-bl-crumbs .sep{color:var(--tw-text-faint,#7C849A);}
.tw-bl-h1{font-size:clamp(28px,5vw,44px);font-weight:800;line-height:1.15;margin:0 0 14px;letter-spacing:-.5px;overflow-wrap:anywhere;}
.tw-bl-postmeta{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;color:var(--tw-text-faint,#7C849A);font-size:14px;margin-bottom:18px;}
.tw-bl-postmeta b{color:var(--tw-text-sub,#A9B0C3);font-weight:600;}
.tw-bl-hero-cover{position:relative;aspect-ratio:1.9/1;border-radius:18px;overflow:hidden;margin:22px 0 28px;background:#1A1730;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));box-shadow:0 30px 80px rgba(0,0,0,.45);}
/* KHÔNG dìm ảnh. Ảnh bìa là thứ có nội dung — dìm nó đi là vứt bỏ đúng thứ người đọc nhìn
   đầu tiên. Đo trên bài thật: ảnh gốc rất sáng, brightness(.85) + phủ .55 làm nó xỉn hẳn. */
.tw-bl-hero-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
/* Luật RIÊNG này từng đè lên bản vá lớp phủ chung — sửa một chỗ mà quên chỗ kia thì trang
   danh sách sáng lên còn trang bài viết vẫn tối, đúng cảnh người dùng gặp. Giữ lại đúng một
   vệt mờ ở mép dưới để ảnh không cắt ngang phũ vào nền. */
.tw-bl-hero-cover .tw-bl-cover-veil{background:linear-gradient(180deg,rgba(10,8,22,0) 78%,rgba(10,8,22,.28) 100%);}
.tw-bl-lead{font-size:19px;line-height:1.6;color:var(--tw-text-sub,#A9B0C3);font-weight:500;margin:0 0 24px;padding-left:16px;border-left:3px solid #6C5CE7;}
/* TÊN RIÊNG cho thân BÀI VIẾT. Trước đây nó cũng tên .tw-bl-body như thân THẺ ở trang danh
   sách (khai ở trên, có display:flex, gap:9px, padding:16px 18px 18px). Cùng độ ưu tiên nên luật sau
   chỉ đè min-width, còn lại thừa hưởng hết: thân bài bị thụt 18px mỗi bên so với tiêu đề và trở thành
   flex column, khoảng cách quanh khối 'Bài liên quan' chèn giữa bài phình ra. Ở 375px, mất 36px là mất hơn
   10% bề rộng đọc. Lỗi này nằm im từ lâu và chỉ lộ ra khi BlogStyles thực sự được áp lên trang bài
   viết (25/09/2026) — trước đó không luật nào trong tệp này có tác dụng ở đó cả. */
.tw-bl-postbody{min-width:0;overflow-wrap:anywhere;}
/* Header dính cao ~64px: chừa chỗ để heading không chui dưới header khi nhảy theo mục lục. */
.tw-bl-postbody h2,.tw-bl-postbody h3,.tw-bl-postbody h4{scroll-margin-top:96px;}
.tw-bl-postbody img{max-width:100%;height:auto;}
.tw-bl-section{margin-top:32px;padding-top:24px;border-top:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));}
.tw-bl-section-h{font-size:13px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--tw-text-faint,#7C849A);margin:0 0 12px;}
/* "Đọc thêm" chèn giữa thân bài. Cố ý KHÔNG giống thẻ bài ở cuối trang: đây là một gợi ý rẽ ngang
   trong lúc đọc, nếu làm to như thẻ thì nó cắt đứt mạch đọc thay vì mời rẽ. */
.tw-bl-readnext{margin:30px 0;padding:14px 16px;border:1px solid var(--tw-border,#ECEDF3);border-left:3px solid #8B7CFF;border-radius:12px;background:var(--tw-surface-2,rgba(139,124,255,.05));}
.tw-bl-readnext-h{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--tw-text-faint,#7C849A);}
.tw-bl-readnext ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}
.tw-bl-readnext a{color:#7C6BFF;font-weight:600;text-decoration:none;line-height:1.45;}
.tw-bl-readnext a:hover{text-decoration:underline;}
.tw-bl-h2{font-size:22px;font-weight:800;margin:0 0 16px;letter-spacing:-.2px;}

/* ── Mục lục ── */
.tw-bl-toc{display:flex;flex-direction:column;gap:0;}
.tw-bl-toc a{display:block;padding:6px 0 6px 12px;border-left:2px solid rgba(255,255,255,.08);color:var(--tw-text-sub,#A9B0C3);font-size:13.5px;line-height:1.4;transition:color .25s ease,border-color .25s ease;}
.tw-bl-toc a.is-h3{padding-left:24px;font-size:13px;}
.tw-bl-toc a:hover{color:var(--tw-text,#fff);}
.tw-bl-toc a.is-active{color:#C4B4FF;border-left-color:#A66BFF;}
.tw-bl-toc-m{margin:0 0 24px;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));border-radius:14px;background:var(--tw-pub-card-bg,rgba(255,255,255,.035));}
.tw-bl-toc-m summary{cursor:pointer;padding:12px 16px;font-weight:700;font-size:14px;list-style:none;display:flex;align-items:center;justify-content:space-between;}
.tw-bl-toc-m summary::-webkit-details-marker{display:none;}
.tw-bl-toc-m summary::after{content:"+";color:#C4B4FF;font-size:18px;line-height:1;}
.tw-bl-toc-m[open] summary::after{content:"–";}
.tw-bl-toc-m .tw-bl-toc{padding:0 16px 14px;}

/* ── Chia sẻ ── */
.tw-bl-share{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.tw-bl-share-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border-radius:999px;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));background:var(--tw-pub-card-bg,rgba(255,255,255,.035));color:var(--tw-text-sub,#A9B0C3);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:none;transition:color .25s ease,border-color .25s ease,background-color .25s ease;}
.tw-bl-share-btn:hover{color:var(--tw-text,#fff);border-color:rgba(196,180,255,.5);background:rgba(108,92,231,.14);}
.tw-bl-share-btn:focus-visible{outline:2px solid #A66BFF;outline-offset:2px;}
.tw-bl-share-btn svg{width:16px;height:16px;flex:none;fill:currentColor;}
.tw-bl-share-btn.is-done{color:#7EE0B3;border-color:rgba(126,224,179,.5);}
@media (max-width:420px){.tw-bl-share-btn span{display:none;}.tw-bl-share-btn{padding:0 11px;}}

/* ── Bình luận ── */
.tw-bl-cmts{margin-top:40px;padding-top:28px;border-top:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));}
.tw-bl-cmt-form{display:flex;flex-direction:column;gap:10px;}
.tw-bl-ta{display:block;width:100%;box-sizing:border-box;min-height:96px;resize:vertical;padding:12px 14px;border-radius:12px;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));background:var(--tw-pub-card-bg,rgba(255,255,255,.035));color:var(--tw-text,#fff);font:inherit;font-size:14.5px;line-height:1.5;outline:none;transition:border-color .25s ease,box-shadow .25s ease;}
.tw-bl-ta::placeholder{color:var(--tw-text-faint,#7C849A);}
.tw-bl-ta:focus{border-color:#A66BFF;box-shadow:0 0 0 3px rgba(108,92,231,.25);}
.tw-bl-form-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;color:var(--tw-text-faint,#7C849A);}
.tw-bl-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 18px;border-radius:10px;border:0;background:linear-gradient(135deg,#6C5CE7,#A66BFF);color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;text-decoration:none;box-shadow:0 8px 24px rgba(108,92,231,.3);transition:transform .25s ease,box-shadow .25s ease,opacity .25s ease;}
.tw-bl-btn:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(108,92,231,.4);}
.tw-bl-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}
.tw-bl-btn-ghost{background:transparent;border:1px solid var(--tw-pub-card-border,rgba(255,255,255,.09));color:var(--tw-text-sub,#A9B0C3);box-shadow:none;}
.tw-bl-btn-ghost:hover{box-shadow:none;border-color:rgba(196,180,255,.5);color:var(--tw-text,#fff);}
.tw-bl-err{padding:10px 12px;border-radius:10px;background:rgba(255,99,120,.12);border:1px solid rgba(255,99,120,.35);color:#FFB3C1;font-size:13.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;}
.tw-bl-note{padding:10px 12px;border-radius:10px;background:rgba(108,92,231,.12);border:1px solid rgba(108,92,231,.3);color:var(--tw-text-sub,#A9B0C3);font-size:13.5px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;}
.tw-bl-note a,.tw-bl-err a{color:#C4B4FF;font-weight:700;}
.tw-bl-cmt-list{margin-top:22px;}
.tw-bl-cmt{display:flex;gap:12px;padding:16px 0;border-top:1px solid rgba(255,255,255,.06);}
.tw-bl-cmt.is-reply{margin-left:46px;border-top:0;padding-top:4px;}
@media (max-width:480px){.tw-bl-cmt.is-reply{margin-left:22px;}}
.tw-bl-cmt-main{flex:1;min-width:0;}
.tw-bl-avatar{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:700;font-size:13px;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.2);}
.tw-bl-cmt-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--tw-text-faint,#7C849A);}
.tw-bl-cmt-name{font-weight:700;color:var(--tw-text,#fff);font-size:14px;}
.tw-bl-cmt-text{margin:4px 0 6px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55;font-size:14.5px;color:var(--tw-text,#fff);}
.tw-bl-cmt-acts{display:flex;gap:14px;}
.tw-bl-link-btn{background:none;border:0;padding:0;color:#C4B4FF;font:inherit;font-size:13px;font-weight:600;cursor:pointer;}
.tw-bl-link-btn:hover{text-decoration:underline;}
.tw-bl-link-btn:disabled{opacity:.5;cursor:not-allowed;text-decoration:none;}
.tw-bl-link-btn.is-danger{color:#FFB3C1;}
.tw-bl-reply-form{margin:10px 0 4px;}
.tw-bl-empty{padding:26px 16px;text-align:center;color:var(--tw-text-faint,#7C849A);font-size:14px;border:1px dashed var(--tw-pub-card-border,rgba(255,255,255,.12));border-radius:14px;}
.tw-bl-skel{height:14px;border-radius:7px;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.12),rgba(255,255,255,.05));background-size:200% 100%;animation:tw-bl-shimmer 1.4s linear infinite;}
@keyframes tw-bl-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}

/* Giảm chuyển động: không chỉ "nhẹ đi" mà tắt hẳn — cùng hợp đồng với bộ fx. */
@media (prefers-reduced-motion: reduce){
  .tw-bl-tab,.tw-bl-chip,.tw-bl-page,.tw-bl-more,.tw-bl-share-btn,.tw-bl-btn,.tw-bl-ta,.tw-bl-toc a,.tw-bl-cover img{transition:none !important;}
  .tw-bl-card-link:hover .tw-bl-cover img,.tw-bl-card-link:hover .tw-bl-more,.tw-bl-btn:hover{transform:none !important;}
  .tw-bl-skel{animation:none;}
}
`;

export function BlogStyles() {
  return (
    <style href="tw-blog" precedence="default">
      {BLOG_CSS}
    </style>
  );
}
