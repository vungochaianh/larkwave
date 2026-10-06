import Link from "next/link";
import type { StoreListing } from "@larkwave/shared";
import type { Lang } from "@/lib/serverLocale";
import { chuDau } from "@/lib/chuDau";
import { KIND_UI, SEG_BY_KIND, formatVnd } from "./storeShared";

/** Góc màu suy ra từ slug: cùng món luôn ra cùng màu, khác món thì khác rõ — cùng luật với /blog. */
function hueOf(slug: string): number {
  let n = 0;
  for (let i = 0; i < slug.length; i += 1) n = (n * 31 + slug.charCodeAt(i)) % 360;
  return n;
}

/** Số chip công nghệ hiện trên thẻ. Quá ba là thẻ thành danh sách và mất tác dụng đọc lướt. */
const MAX_CHIP = 3;

/**
 * Thẻ một sản phẩm. Cả thẻ là MỘT liên kết (không lồng liên kết bên trong) để bấm ở đâu cũng
 * trúng và trình đọc màn hình chỉ đọc một đích.
 *
 * Thẻ mang STACK chứ không chỉ mang tên: người chọn mã nguồn quét theo công nghệ trước, tên sau.
 * Một thẻ không nói nó chạy Next.js hay Go thì bắt người ta mở từng trang mới biết.
 */
export default function StoreCard({ item, lang }: { item: StoreListing; lang: Lang }) {
  const seg = SEG_BY_KIND[item.kind] ?? item.kind;
  const ui = KIND_UI[item.kind];
  const sold = item.totalSold > 0 ? (lang === "vi" ? `Đã bán ${item.totalSold}` : `${item.totalSold} sold`) : "";
  const langs = item.detail.languages ?? [];
  const chips = langs.slice(0, MAX_CHIP);
  const con = langs.length - chips.length;
  // Ngôn ngữ đang xem phải ĐI THEO liên kết. Thiếu đuôi này thì người đọc bản tiếng Anh bấm vào
  // một sản phẩm là rơi về tiếng Việt — đúng lỗi đã sửa cho /blog ở commit 1681838.
  const langSfx = lang === "en" ? "?lang=en" : "";

  return (
    <Link href={`/store/${seg}/${item.slug}${langSfx}`} className="tw-st-card">
      <div className="tw-st-thumb">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          // Phần lớn hàng bên portal CHƯA có ảnh. Một khối gradient trống trơn trông như ảnh
          // hỏng, nên ô thay thế mang chữ cái đầu của tên (mỗi món một màu theo slug) cộng biểu
          // tượng loại hàng — đủ để đọc lướt là phân biệt được, và trông như một lựa chọn.
          <div
            className="tw-st-thumb-fallback"
            aria-hidden="true"
            style={{ "--tw-st-hue": `${hueOf(item.slug)}deg` } as React.CSSProperties}
          >
            <span className="tw-st-thumb-letter">{chuDau(item.name)}</span>
            <span className="tw-st-thumb-icon">{ui.icon}</span>
          </div>
        )}
        {item.detail.version && <span className="tw-st-ver">v{item.detail.version}</span>}
      </div>
      <div className="tw-st-body">
        {item.category && <span className="tw-st-cat">{item.category}</span>}
        {/* h3, KHÔNG phải h2: thẻ nằm dưới một h2 tiêu đề nhóm, nhảy cấp là gãy dàn ý trang
            với người dùng trình đọc màn hình. */}
        <h3 className="tw-st-name">{item.name}</h3>
        {item.descriptionShort && <p className="tw-st-desc">{item.descriptionShort}</p>}
        {chips.length > 0 && (
          <div className="tw-st-stack" aria-label={lang === "vi" ? "Công nghệ" : "Stack"}>
            {chips.map((l) => (
              <span key={l} className="tw-st-tech">
                {l}
              </span>
            ))}
            {con > 0 && <span className="tw-st-tech more">+{con}</span>}
          </div>
        )}
        <div className="tw-st-foot">
          <span className="tw-st-price">{formatVnd(item.priceVnd, lang)}</span>
          {item.inStock === false ? (
            <span className="tw-st-badge out">{lang === "vi" ? "Tạm hết" : "Out of stock"}</span>
          ) : (
            sold && <span className="tw-st-sold">{sold}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
