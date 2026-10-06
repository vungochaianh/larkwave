/**
 * Hợp đồng của mặt QUẢN TRỊ cửa hàng, nhìn từ phía web (`cms.toolswave.net`).
 *
 * VÌ SAO KHÔNG DÙNG `AdminListing` / `GrantProjectResponse` trong `@larkwave/shared`.
 *
 * Gói dùng chung có một khối "Quản trị cửa hàng (giai đoạn 2)" được viết theo model `Listing` ở
 * cuối `schema.prisma`. Nhưng thứ mà `/v1/admin/store/*` THẬT SỰ trả về là
 * `AdminListingRow` / `AdminListingFull` / `GrantResult` trong
 * `apps/api/src/store/admin-store.dto.ts` — và ba hình dạng đó lệch với gói dùng chung ở đúng
 * những chỗ đắt:
 *
 *   - `shared.AdminListing` khai `sellerId`, máy chủ KHÔNG chọn cột đó ra (`ROW_SELECT`); ngược
 *     lại máy chủ trả `hasDelivery` và `availableInventory`, gói dùng chung không có.
 *   - `shared.GrantProjectResponse` khai `{ orderId, orderCode, daCapTruocDo }`; tuyến
 *     `POST /admin/store/grants` trả `{ created, order, entitlementId, message }` — và `order`
 *     có thể là `null` (quyền cũ cấp tay, không kèm đơn). Dùng hình dạng kia thì màn hình cấp dự
 *     án sẽ đọc `orderCode` của `undefined`.
 *
 * Kiểu sai mà biên dịch vẫn xanh là kiểu tệ nhất: nó không báo gì cho tới khi có người bấm nút
 * thật. Phía API cố ý để hình dạng quản trị NGOÀI gói dùng chung (xem chú thích đầu
 * `admin-store.dto.ts` — để một trường nội bộ không đi nhờ sang phía công khai), nên bên web soi
 * lại đúng hình dạng đó ở đây. Cái giá: hai bản mô tả một hợp đồng, sửa API thì phải sửa cả đây.
 * Đổi lại, biên giới công khai/quản trị vẫn là một đường kẻ chứ không phải một thói quen.
 *
 * Những thứ ĐÚNG LÀ dùng chung — `StoreKind`, `StoreListingDetail`, `AppSeo`, `ListingStatus` —
 * vẫn lấy từ `@larkwave/shared`: chúng là cùng một khái niệm ở cả hai phía, nhân bản chúng mới
 * là chỗ dễ lệch.
 */
import type { AppSeo, ListingStatus, StoreKind, StoreListingDetail } from "@larkwave/shared";

export type { ListingStatus, StoreKind, StoreListingDetail, AppSeo };

/**
 * Một dòng trong bảng danh mục quản trị = `AdminListingRow` của API.
 *
 * `hasDelivery` chỉ là CÓ/KHÔNG. Nội dung đường giao hàng (link Drive, file ZIP, id repo GitLab)
 * không bao giờ đi cùng chuyến với tên và giá — nó có tuyến riêng, và tuyến riêng đó ghi nhật ký
 * mỗi lượt đọc. Xem `AdminStoreDelivery`.
 */
export interface AdminStoreRow {
  id: string;
  kind: StoreKind;
  slug: string;
  name: string;
  descriptionShort: string | null;
  thumbnailUrl: string | null;
  priceVnd: number;
  compareAtVnd: number | null;
  category: string | null;
  status: ListingStatus;
  sortOrder: number;
  totalSold: number;
  hasDelivery: boolean;
  appId: string | null;
  buildId: string | null;
  /** Có giá trị = dòng này do script nhập từ hệ B sinh ra, không phải ai đó gõ tay. */
  legacyId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Trang chi tiết một món = `AdminListingFull` của API: thêm phần dài + số tồn kho. */
export interface AdminStoreListing extends AdminStoreRow {
  description: string | null;
  gallery: string[];
  detail: StoreListingDetail;
  seo: AppSeo | null;
  notesInternal: string | null;
  /** Suất còn bán được trong kho. Chỉ `kind=software` mới khác 0. */
  availableInventory: number;
}

/**
 * Thân của `PATCH /admin/store/listings/:id`.
 *
 * HAI LUẬT phải thuộc, vì cả hai đều đã được máy chủ chốt và cả hai đều im lặng khi làm sai:
 *
 *  1. **Không gửi `null`.** `AdminStoreService.writableFields` gọi thẳng `.trim()` trên mọi giá
 *     trị khác `undefined`, nên `descriptionShort: null` không phải là "xoá trắng" mà là một cú
 *     500 giữa lúc ai đó đang lưu bài. Muốn xoá thì gửi CHUỖI RỖNG — máy chủ tự quy về `null`.
 *     Vì vậy các trường dưới đây khai `string`, không phải `string | null`: để trình biên dịch
 *     chặn thay cho trí nhớ. (Gói dùng chung mô tả `null` = xoá; đó là ý định, không phải thứ
 *     máy chủ đang làm.) `compareAtVnd` xoá bằng `0`, vì máy chủ đọc nó qua `|| null`.
 *  2. **Bỏ trống = để yên.** Trường không gửi thì máy chủ không động tới. Nhờ vậy mỗi thẻ trong
 *     trang sửa gửi riêng phần của nó, và hai người sửa hai ô khác nhau không ghi đè lên nhau.
 *
 * `detail` GỘP theo từng khoá (gửi mỗi `specDocument` không thổi bay `languages` do bản nhập
 * dựng ra); `seo` THAY CẢ KHỐI (nếu gộp thì "tắt sitemap" sẽ không bao giờ tắt được).
 */
export interface AdminStoreListingInput {
  slug?: string;
  name?: string;
  descriptionShort?: string;
  description?: string;
  thumbnailUrl?: string;
  gallery?: string[];
  /** Int VND. Ô nhập phải làm tròn — portal trả Decimal ra JSON dạng chuỗi ("100000.00"). */
  priceVnd?: number;
  /** Giá gạch ngang. `0` = bỏ khuyến mãi. */
  compareAtVnd?: number;
  category?: string;
  status?: ListingStatus;
  sortOrder?: number;
  detail?: StoreListingDetail;
  seo?: AppSeo;
  /** Ghi chú nội bộ — không bao giờ ra API công khai. */
  notesInternal?: string;
  /** Chỉ `kind=app|tool`. Chuỗi rỗng = gỡ liên kết. */
  appId?: string;
  /** Bản build đóng băng được bán. Chuỗi rỗng = bỏ ghim. */
  buildId?: string;
}

/**
 * Thân của `POST /admin/store/listings`.
 *
 * `kind` chỉ có ở đây và không có trong bản sửa: đổi loại là đổi cả đường dẫn công khai lẫn cách
 * giao hàng, nên đó là việc tạo món mới chứ không phải việc sửa một ô.
 */
export interface AdminStoreCreateInput extends AdminStoreListingInput {
  kind: StoreKind;
  slug: string;
  name: string;
}

/**
 * Tham số của bảng danh mục.
 *
 * Khai bằng `type` chứ không `interface` là có lý do kỹ thuật: `apiFetch` nhận `query` kiểu
 * `Record<string, …>`, và TypeScript chỉ suy ra chữ ký chỉ mục ngầm cho bí danh kiểu, không cho
 * interface. Đổi sang `interface` là một lỗi biên dịch khó hiểu ở chỗ khác.
 */
export type AdminStoreQuery = {
  page?: number;
  pageSize?: number;
  /** Tìm trong TÊN và SLUG (máy chủ, không phân biệt hoa thường). */
  q?: string;
  kind?: StoreKind;
  status?: ListingStatus;
  category?: string;
};

/**
 * Đường giao hàng đã giải mã — `GET`/`PUT /admin/store/listings/:id/delivery`.
 *
 * Ba trường này chính là lỗ rò vừa bịt bên portal hôm 23/09. Mỗi lượt ĐỌC đều vào nhật ký, nên
 * trang quản trị chỉ gọi tuyến này khi người dùng thật sự mở thẻ "Giao hàng" — không gọi sẵn
 * lúc mở trang, vì như thế thì dòng nhật ký "ai đã xem link tải" mất hết giá trị.
 */
export interface AdminStoreDelivery {
  driveLink: string | null;
  zipFileUrl: string | null;
  gitlabRepoId: string | null;
}

/** Thân của `PUT …/delivery` — THAY cả khối. Gửi object rỗng = xoá sạch. */
export interface AdminStoreDeliveryInput {
  driveLink?: string;
  zipFileUrl?: string;
  gitlabRepoId?: string;
}

/** Thân của `POST /admin/store/grants`. Cần `email` HOẶC `userId` — máy chủ kiểm. */
export interface AdminStoreGrantInput {
  email?: string;
  userId?: string;
  listingId: string;
  /** Vì sao cấp. Sáu tháng sau đây là thứ duy nhất giải thích một đơn 0đ. */
  note?: string;
}

/** Đơn do quản trị cấp, dạng rút gọn. `null` khi quyền cũ không kèm đơn nào. */
export interface AdminStoreGrantedOrder {
  orderId: string;
  code: string;
  userId: string;
  userEmail: string;
  listingId: string;
  listingName: string;
  kind: StoreKind;
  priceVnd: number;
  entitlementId: string;
  fulfillmentId: string | null;
  fulfillmentMethod: string | null;
  createdAt: string;
}

/**
 * Kết quả một lần cấp.
 *
 * `created === false` nghĩa là tài khoản đó ĐÃ có quyền với món này từ trước và máy chủ không
 * tạo đơn thứ hai. Giao diện phải nói thẳng điều đó — "đã có sẵn" khác hẳn "vừa cấp xong", và
 * người bấm nút cần biết mình đang ở trường hợp nào trước khi báo lại cho khách.
 */
export interface AdminStoreGrantResult {
  created: boolean;
  order: AdminStoreGrantedOrder | null;
  entitlementId: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nhãn tiếng Việt — dùng chung cho cả ba màn, khai một chỗ để chúng không lệch nhau
// ─────────────────────────────────────────────────────────────────────────────

export const KIND_LABEL: Record<StoreKind, string> = {
  software: "Tài khoản phần mềm",
  document: "Tài liệu",
  sourcecode: "Mã nguồn",
  app: "App bàn giao",
  tool: "Tool",
  service: "Dịch vụ",
};

/**
 * Mặt tiền `/store` hiện CHỈ bày `sourcecode` (`SHOP_KINDS` trong `store.service.ts`). Các loại
 * còn lại vẫn quản lý được ở đây — dữ liệu về hệ này trước, mặt tiền mở sau theo giai đoạn 4/5 —
 * nên bảng danh mục cần nói rõ loại nào đang thật sự có mặt ngoài cửa hàng.
 */
export const KIND_ON_STOREFRONT: readonly StoreKind[] = ["sourcecode"];

export const STATUS_META: Record<ListingStatus, { label: string; color: string; hint: string }> = {
  active: { label: "Đang bán", color: "success", hint: "Hiện trên /store và trong sitemap." },
  hidden: {
    label: "Đã ẩn",
    color: "default",
    hint: "Gỡ khỏi mặt tiền. Đơn cũ vẫn đọc được tên và giá — ẩn không phải là xoá.",
  },
  sold_out: {
    label: "Hết hàng",
    color: "warning",
    hint: "Chỉ có nghĩa với tài khoản phần mềm (hết suất trong kho).",
  },
};
