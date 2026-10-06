import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BlogPost as PBlogPost } from '@prisma/client';
import type {
  BlogI18n,
  BlogPost,
  BlogPostListItem,
  BlogPostStatus,
  BlogTranslation,
  CreateBlogPostRequest,
  Paginated,
  UpdateBlogPostRequest,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';

const VALID_STATUS: BlogPostStatus[] = ['draft', 'published'];

/**
 * Ngôn ngữ của các cột gốc (title/content/…). Toàn bộ bài đang có đều là tiếng Việt.
 *
 * Giữ bản gốc ở cột thường thay vì nhét cả tiếng Việt vào `i18n` để mọi mã cũ đọc `post.title`
 * vẫn chạy nguyên — chuyển sang song ngữ mà không phải đổi đồng loạt mọi chỗ đang dùng.
 */
const BASE_LOCALE = 'vi';

/**
 * Độ dài tối đa của slug.
 *
 * 70 chứ không phải 80, và con số này KHÔNG tuỳ tiện: bộ chấm SEO trừ điểm mọi slug quá 75 ký tự
 * (scripts/seo-report.mjs). Để mức cắt cao hơn ngưỡng chấm nghĩa là chính máy chủ sinh ra những
 * slug mà chính ta chấm là hỏng — đo ngày 24/09/2026: 5/28 bài bị trừ điểm, tất cả vì đúng lý do
 * này, và đó là toàn bộ khoảng cách giữa 98 và 100 điểm.
 */
const SLUG_MAX = 70;

/**
 * Turn a title into a URL-safe slug (handles Vietnamese diacritics → ASCII).
 *
 * Cắt ở RANH GIỚI TỪ, không cắt giữa chừng. `slice(80)` trần để lại những slug kết thúc bằng một
 * mẩu từ cụt — có thật trên site: `…trong-mot-buoi-c`, `…tu-y-tuong-toi-l`. Người đọc thấy địa chỉ
 * đó thì tưởng link bị copy thiếu, và đó là thứ họ phải nhìn mỗi lần được chia sẻ bài.
 *
 * Chỉ ảnh hưởng bài MỚI: slug của bài đã đăng nằm trong cơ sở dữ liệu và không được đụng tới —
 * đổi địa chỉ một bài đã đăng là vứt đi liên kết và thứ hạng nó đã có.
 */
function slugify(input: string): string {
  const raw = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (raw.length <= SLUG_MAX) return raw || 'bai-viet';
  const cut = raw.slice(0, SLUG_MAX + 1);
  const at = cut.lastIndexOf('-');
  // Không có gạch nào trong 71 ký tự đầu = một "từ" dài hơn cả giới hạn. Hiếm, nhưng cắt cứng vẫn
  // hơn trả về cả chuỗi dài.
  const base = (at > 0 ? cut.slice(0, at) : raw.slice(0, SLUG_MAX)).replace(/-+$/, '');
  return base || 'bai-viet';
}

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private toTags(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  }

  /** Đọc cột `i18n` ra object. Dữ liệu hỏng thì coi như chưa dịch, KHÔNG để nó làm đổ cả bài. */
  private toI18n(value: unknown): BlogI18n {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: BlogI18n = {};
    for (const [loc, tr] of Object.entries(value as Record<string, unknown>)) {
      if (!tr || typeof tr !== 'object' || Array.isArray(tr)) continue;
      const t = tr as Record<string, unknown>;
      const pick = (k: string) => (typeof t[k] === 'string' ? (t[k] as string) : undefined);
      const entry: BlogTranslation = {
        title: pick('title'),
        excerpt: pick('excerpt'),
        content: pick('content'),
        seoTitle: pick('seoTitle'),
        seoDescription: pick('seoDescription'),
      };
      // Bỏ khoá rỗng để `??` bên dưới lùi đúng về bản gốc.
      for (const k of Object.keys(entry) as (keyof BlogTranslation)[]) {
        if (entry[k] === undefined) delete entry[k];
      }
      if (Object.keys(entry).length) out[loc] = entry;
    }
    return out;
  }

  /**
   * Các ngôn ngữ đọc được: bản gốc + những khoá trong `i18n` CÓ ĐỦ tiêu đề và nội dung.
   *
   * Đòi đủ hai trường là có lý do: một bản dịch mới có tiêu đề mà chưa có thân bài, nếu đem khai
   * là "đọc được tiếng Anh" thì người bấm sang sẽ thấy tiêu đề tiếng Anh trên một thân bài tiếng
   * Việt — tệ hơn là không có bản tiếng Anh nào.
   */
  private localesOf(i18n: BlogI18n): string[] {
    const extra = Object.entries(i18n)
      .filter(([, t]) => Boolean(t.title && t.content))
      .map(([loc]) => loc);
    return [BASE_LOCALE, ...extra];
  }

  /**
   * Phủ bản dịch lên bản gốc, THEO TỪNG TRƯỜNG.
   *
   * Thiếu trường nào thì trường đó lùi về bản gốc, thay vì bỏ cả bản dịch. Một bài đã dịch thân
   * nhưng chưa dịch mô tả SEO vẫn dùng được ngay — không phải chờ dịch trọn vẹn mới hiện.
   */
  private applyLocale(p: PBlogPost, locale?: string): PBlogPost {
    if (!locale || locale === BASE_LOCALE) return p;
    const tr = this.toI18n(p.i18n)[locale];
    if (!tr) return p;
    return {
      ...p,
      title: tr.title ?? p.title,
      excerpt: tr.excerpt ?? p.excerpt,
      content: tr.content ?? p.content,
      seoTitle: tr.seoTitle ?? p.seoTitle,
      seoDescription: tr.seoDescription ?? p.seoDescription,
    };
  }

  private toDto(raw: PBlogPost, locale?: string): BlogPost {
    const i18n = this.toI18n(raw.i18n);
    const p = this.applyLocale(raw, locale);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt ?? null,
      content: p.content,
      coverImage: p.coverImage ?? null,
      status: (VALID_STATUS.includes(p.status as BlogPostStatus) ? p.status : 'draft') as BlogPostStatus,
      tags: this.toTags(p.tags),
      category: p.category ?? null,
      seoTitle: p.seoTitle ?? null,
      seoDescription: p.seoDescription ?? null,
      i18n,
      locales: this.localesOf(i18n),
      authorName: p.authorName ?? null,
      featured: p.featured,
      views: p.views,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toListItem(raw: PBlogPost, locale?: string): BlogPostListItem {
    const p = this.applyLocale(raw, locale);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt ?? null,
      coverImage: p.coverImage ?? null,
      tags: this.toTags(p.tags),
      category: p.category ?? null,
      locales: this.localesOf(this.toI18n(raw.i18n)),
      authorName: p.authorName ?? null,
      featured: p.featured,
      views: p.views,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    };
  }

  /**
   * Làm sạch object bản dịch trước khi ghi: bỏ chuỗi rỗng, bỏ ngôn ngữ trống, và BỎ CẢ bản gốc.
   *
   * Bỏ bản gốc là cố ý: tiếng Việt sống ở các cột phẳng. Cho nó vào `i18n` nữa là có hai nguồn
   * cho cùng một nội dung, và đến lúc lệch nhau thì không ai biết bên nào đúng.
   */
  private cleanI18n(value: unknown): BlogI18n {
    const parsed = this.toI18n(value);
    delete parsed[BASE_LOCALE];
    return parsed;
  }

  /**
   * Gộp bản dịch mới vào bản đang có, THEO TỪNG NGÔN NGỮ.
   *
   * Gửi { en } không được phép xoá { ko } đã lưu — sửa bản tiếng Anh mà mất bản tiếng Hàn là mất
   * dữ liệu không báo trước. Muốn xoá hẳn một ngôn ngữ thì gửi ngôn ngữ đó với giá trị rỗng.
   */
  private mergeI18n(current: unknown, incoming: unknown): BlogI18n {
    const base = this.cleanI18n(current);
    for (const [loc, tr] of Object.entries(this.cleanI18n(incoming))) {
      base[loc] = { ...(base[loc] ?? {}), ...tr };
    }
    return base;
  }

  /** Ensure the slug is unique; append -2, -3… on collision (ignoring `exceptId`). */
  private async uniqueSlug(desired: string, exceptId?: string): Promise<string> {
    const root = slugify(desired);
    for (let n = 0; n < 50; n += 1) {
      const candidate = n === 0 ? root : `${root}-${n + 1}`;
      const clash = await this.prisma.blogPost.findUnique({ where: { slug: candidate } });
      if (!clash || clash.id === exceptId) return candidate;
    }
    return `${root}-${Date.now()}`;
  }

  // ── Public ───────────────────────────────────────────────────────────────

  /** Published posts, newest first (paginated). For /blog. */
  async listPublished(
    page: number,
    pageSize: number,
    tag?: string,
    category?: string,
    locale?: string,
  ): Promise<Paginated<BlogPostListItem>> {
    const where: Prisma.BlogPostWhereInput = {
      status: 'published',
      ...(tag ? { tags: { array_contains: tag } } : {}),
      // So sánh KHÔNG phân biệt hoa thường: chuyên mục do người viết gõ tay, "Hướng dẫn" và
      // "hướng dẫn" là một. Không xử thì tab chia đôi và nửa số bài biến mất khỏi cả hai.
      ...(category ? { category: { equals: category, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { items: rows.map((r) => this.toListItem(r, locale)), total, page, pageSize };
  }

  /**
   * Các chuyên mục ĐANG CÓ BÀI, kèm số bài — để /blog dựng tab mà không cần bảng danh mục riêng.
   *
   * Lấy từ chính dữ liệu thay vì một danh sách cố định: một chuyên mục không còn bài nào thì tab
   * của nó phải biến mất, chứ không phải bấm vào ra trang rỗng.
   */
  async categories(): Promise<{ name: string; count: number }[]> {
    const rows = await this.prisma.blogPost.groupBy({
      by: ['category'],
      where: { status: 'published', category: { not: null } },
      _count: { _all: true },
    });
    // Gộp các biến thể hoa thường về một, giữ cách viết gặp đầu tiên làm nhãn hiển thị.
    const byKey = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const name = (r.category || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const cur = byKey.get(key);
      if (cur) cur.count += r._count._all;
      else byKey.set(key, { name, count: r._count._all });
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }

  /** Các thẻ đang có bài, kèm số lần dùng — để /blog hiện dải thẻ lọc. */
  async tags(): Promise<{ name: string; count: number }[]> {
    const rows = await this.prisma.blogPost.findMany({
      where: { status: 'published' },
      select: { tags: true },
    });
    const count = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const list = Array.isArray(r.tags) ? (r.tags as unknown[]) : [];
      for (const raw of list) {
        const name = String(raw || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const cur = count.get(key);
        if (cur) cur.count += 1;
        else count.set(key, { name, count: 1 });
      }
    }
    return [...count.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }

  /** A published post by slug; increments the view counter (best-effort). */
  async getPublished(slug: string, locale?: string): Promise<BlogPost> {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== 'published') throw new NotFoundException('Không tìm thấy bài viết');
    await this.prisma.blogPost
      .update({ where: { id: post.id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);
    return this.toDto({ ...post, views: post.views + 1 }, locale);
  }

  /** Featured (else newest) published posts for the landing teaser. */
  async featured(limit: number, locale?: string): Promise<BlogPostListItem[]> {
    const take = Math.min(Math.max(1, limit), 12);
    const featured = await this.prisma.blogPost.findMany({
      where: { status: 'published', featured: true },
      orderBy: { publishedAt: 'desc' },
      take,
    });
    if (featured.length >= take) return featured.map((p) => this.toListItem(p, locale));
    // Top up with newest non-featured published posts.
    const fill = await this.prisma.blogPost.findMany({
      where: { status: 'published', featured: false },
      orderBy: { publishedAt: 'desc' },
      take: take - featured.length,
    });
    return [...featured, ...fill].map((p) => this.toListItem(p, locale));
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  /** All posts (any status), newest first. */
  async adminList(page: number, pageSize: number, status?: string): Promise<Paginated<BlogPost>> {
    const where: Prisma.BlogPostWhereInput =
      status && VALID_STATUS.includes(status as BlogPostStatus) ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return { items: rows.map((r) => this.toDto(r)), total, page, pageSize };
  }

  async adminGet(id: string): Promise<BlogPost> {
    const post = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    return this.toDto(post);
  }

  async create(user: AuthUser, dto: CreateBlogPostRequest): Promise<BlogPost> {
    return this.insert(user.id, dto.authorName?.trim() || user.email, dto);
  }

  /**
   * Đăng bài do TÁC VỤ NỀN tạo (lịch Marketing blog tự chạy).
   *
   * Không nhận AuthUser: đằng sau nó không có request nào cả, và bịa ra một AuthUser với `role` giả
   * để lọt qua kiểu là cách dễ nhất để sau này ai đó tưởng lịch có quyền của một người dùng thật.
   * Chủ nhân lịch là tác giả, chỉ vậy.
   */
  async createFromSchedule(userId: string, fallbackAuthor: string, dto: CreateBlogPostRequest): Promise<BlogPost> {
    return this.insert(userId, dto.authorName?.trim() || fallbackAuthor, dto);
  }

  private async insert(authorId: string, authorName: string, dto: CreateBlogPostRequest): Promise<BlogPost> {
    const title = (dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Tiêu đề không được để trống');
    const status: BlogPostStatus = dto.status === 'published' ? 'published' : 'draft';
    const slug = await this.uniqueSlug(dto.slug?.trim() || title);
    const post = await this.prisma.blogPost.create({
      data: {
        slug,
        title,
        excerpt: dto.excerpt?.trim() || null,
        content: dto.content ?? '',
        coverImage: dto.coverImage?.trim() || null,
        status,
        tags: this.toTags(dto.tags),
        category: dto.category?.trim() || null,
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
        // Prisma gõ cột Json là InputJsonValue, không nhận thẳng Record<string, BlogTranslation>.
        i18n: this.cleanI18n(dto.i18n) as unknown as Prisma.InputJsonValue,
        featured: !!dto.featured,
        authorId,
        authorName,
        publishedAt: status === 'published' ? new Date() : null,
      },
    });
    return this.toDto(post);
  }

  async update(id: string, dto: UpdateBlogPostRequest): Promise<BlogPost> {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy bài viết');

    const data: Prisma.BlogPostUncheckedUpdateInput = {};
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) throw new BadRequestException('Tiêu đề không được để trống');
      data.title = t;
    }
    if (dto.slug !== undefined && dto.slug.trim() && dto.slug.trim() !== existing.slug) {
      data.slug = await this.uniqueSlug(dto.slug.trim(), id);
    }
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt.trim() || null;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.coverImage !== undefined) data.coverImage = dto.coverImage.trim() || null;
    if (dto.tags !== undefined) data.tags = this.toTags(dto.tags);
    if (dto.category !== undefined) data.category = dto.category.trim() || null;
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle.trim() || null;
    if (dto.seoDescription !== undefined) data.seoDescription = dto.seoDescription.trim() || null;
    // GỘP chứ không thay: gửi { en } không được xoá { ko } đang có. Xem mergeI18n.
    if (dto.i18n !== undefined) {
      data.i18n = this.mergeI18n(existing.i18n, dto.i18n) as unknown as Prisma.InputJsonValue;
    }
    if (dto.authorName !== undefined) data.authorName = dto.authorName.trim() || null;
    if (dto.featured !== undefined) data.featured = !!dto.featured;
    if (dto.status !== undefined && VALID_STATUS.includes(dto.status)) {
      data.status = dto.status;
      // Stamp publishedAt the first time it goes live; keep the original afterwards
      // (so toggling draft↔published preserves the original publish date).
      if (dto.status === 'published' && !existing.publishedAt) data.publishedAt = new Date();
    }

    const post = await this.prisma.blogPost.update({ where: { id }, data });
    return this.toDto(post);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Không tìm thấy bài viết');
    await this.prisma.blogPost.delete({ where: { id } });
    return { ok: true };
  }
}
