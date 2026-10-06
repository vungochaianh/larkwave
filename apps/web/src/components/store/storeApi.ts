import { API_BASE } from "@/lib/api";

/**
 * Đọc cửa hàng từ API của CHÍNH hệ này (`/v1/store/*`), không gọi thẳng portal.
 *
 * Ở giai đoạn 1, API bên trong mới là bên đi hỏi portal và chuẩn hoá lại. Nhờ vậy khi dữ liệu
 * dọn về cơ sở dữ liệu của hệ này (giai đoạn 2), ba trang cửa hàng không phải sửa một dòng nào.
 *
 * `revalidate: 300` khớp đúng thời hạn đệm phía API — đệm hai tầng cùng nhịp thì dữ liệu cũ nhất
 * một người dùng thấy được là 5 phút, không phải 10.
 *
 * LƯU Ý khi chẩn đoán: bộ đệm fetch của Next nằm trên ĐĨA (`.next/cache/fetch-cache`) nên nó
 * sống qua restart, và mỗi tiến trình giữ một bản riêng. Sửa dữ liệu mà trang không đổi thì xoá
 * thư mục đó ở cả bản build lẫn bản standalone rồi mới khởi động lại — xem docs/OPERATIONS.md.
 */
export async function getStore<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}/store${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
