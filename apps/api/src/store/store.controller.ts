import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import type {
  Paginated,
  StoreFacet,
  StoreKind,
  StoreListing,
  StoreOverview,
  StoreSort,
} from '@larkwave/shared';
import { STORE_KINDS, STORE_SORTS } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { StoreService } from './store.service';

/**
 * Cửa hàng công khai (SEO) — danh mục + chi tiết, không cần đăng nhập.
 *
 * Giai đoạn 1 chưa có đặt hàng ở đây: mỗi món mang sẵn `buyUrl` trỏ về portal, nơi duy nhất
 * còn nhận đơn. Khi giai đoạn 3 mở thanh toán nội bộ, `buyUrl` đổi trong service và giao diện
 * không phải sửa gì.
 */
@Public()
@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  private static kind(raw: string): StoreKind {
    const k = (raw ?? '').trim().toLowerCase() as StoreKind;
    if (!STORE_KINDS.includes(k)) throw new BadRequestException(`Loại hàng không hợp lệ: ${raw}`);
    return k;
  }

  /** Trang chủ cửa hàng: mỗi loại hàng một hàng thẻ. */
  @Get()
  overview(@Query('limit') limit?: string): Promise<StoreOverview> {
    const n = Math.min(24, Math.max(1, parseInt(limit ?? '6', 10) || 6));
    return this.store.overview(n);
  }

  /** Chuyên mục đang có hàng của một loại — dựng tab lọc. */
  @Get('categories')
  categories(@Query('kind') kind?: string): Promise<StoreFacet[]> {
    return this.store.categories(StoreController.kind(kind ?? 'sourcecode'));
  }

  /**
   * Công nghệ đang có + số sản phẩm dùng nó. Đây là bộ lọc CHÍNH của người đi chọn mã nguồn,
   * nên nó là một tuyến riêng chứ không nhét chung vào `categories`.
   */
  @Get('languages')
  languages(@Query('kind') kind?: string): Promise<StoreFacet[]> {
    return this.store.languages(StoreController.kind(kind ?? 'sourcecode'));
  }

  /** Mọi slug đang bán — sitemap đọc để khai báo từng trang bán. */
  @Get('slugs')
  slugs(): Promise<{ kind: StoreKind; slug: string; updatedAt: string | null }[]> {
    return this.store.slugs();
  }

  @Get(':kind')
  list(
    @Param('kind') kind: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('language') language?: string,
    @Query('sort') sort?: string,
  ): Promise<Paginated<StoreListing>> {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const ps = Math.min(48, Math.max(1, parseInt(pageSize ?? '12', 10) || 12));
    // Giá trị `sort` lạ thì LỜ ĐI chứ không ném lỗi: nó đến từ URL người dùng gõ hoặc dán, và
    // một cú 400 ở đây biến một tham số vô hại thành trang trắng.
    const st = (sort ?? '').trim() as StoreSort;
    return this.store.list(StoreController.kind(kind), {
      page: p,
      pageSize: ps,
      search: search?.trim() || undefined,
      category: category?.trim() || undefined,
      language: language?.trim() || undefined,
      sort: STORE_SORTS.includes(st) ? st : undefined,
    });
  }

  @Get(':kind/:slug')
  detail(@Param('kind') kind: string, @Param('slug') slug: string): Promise<StoreListing> {
    return this.store.detail(StoreController.kind(kind), slug);
  }
}
