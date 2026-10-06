import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bình luận dưới bài blog.
 *
 * Hai quyết định định hình cả file này, nói ra để người sau khỏi "sửa cho tiện":
 *
 * 1. **Mặc định hiện luôn, không chờ duyệt.** Một blog mà mọi bình luận phải chờ admin bấm duyệt
 *    thì thực tế là blog không có bình luận — vì không ai ngồi duyệt hằng ngày. Đổi lại phải có
 *    đường GỠ nhanh (`hide`) và chỉ mục theo `status` để trang công khai không bao giờ phải lọc
 *    trong bộ nhớ.
 *
 * 2. **Bắt buộc đăng nhập.** Bình luận ẩn danh trên một trang công khai là mời spam, và khi đã có
 *    spam thì thứ duy nhất cứu được là chặn theo tài khoản — không có tài khoản thì không chặn
 *    được ai cả.
 *
 * Trả lời chỉ MỘT cấp: lồng sâu trên blog thì trên điện thoại thụt lề mấy tầng là không đọc nổi.
 */

export interface BlogCommentDto {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  /** Người đang xem có được sửa/xoá dòng này không — giao diện dựa vào đây, không tự đoán. */
  mine: boolean;
}

const MAX_LEN = 4000;

@Injectable()
export class BlogCommentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bài đã XUẤT BẢN có slug này. Bài nháp không nhận bình luận. */
  private async publishedPostId(slug: string): Promise<string> {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: 'published' },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    return post.id;
  }

  /**
   * Danh sách bình luận hiện được. `viewerId` rỗng = khách chưa đăng nhập (vẫn đọc được).
   *
   * Trả về PHẲNG kèm `parentId`, để giao diện tự gom thành một cấp. Dựng cây ở máy chủ nghĩa là
   * cố định cách hiển thị, mà chỗ đó còn đổi.
   */
  async list(slug: string, viewerId: string | null): Promise<BlogCommentDto[]> {
    const postId = await this.publishedPostId(slug);
    const rows = await this.prisma.blogComment.findMany({
      where: { postId, status: 'visible' },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorName || 'Người dùng',
      content: r.content,
      parentId: r.parentId,
      createdAt: r.createdAt.toISOString(),
      mine: !!viewerId && r.authorId === viewerId,
    }));
  }

  async add(
    slug: string,
    userId: string,
    userName: string,
    body: { content?: string; parentId?: string | null },
  ): Promise<BlogCommentDto> {
    const content = String(body?.content || '').trim();
    if (!content) throw new BadRequestException('Nội dung trống');
    if (content.length > MAX_LEN) throw new BadRequestException(`Bình luận tối đa ${MAX_LEN} ký tự`);
    const postId = await this.publishedPostId(slug);

    // Trả lời chỉ MỘT cấp: nếu nhắm vào một dòng vốn đã là trả lời, gắn lên cha của nó thay vì
    // đẻ ra tầng thứ ba. Từ chối sẽ khó chịu mà chẳng được gì.
    let parentId: string | null = null;
    const wanted = String(body?.parentId || '').trim();
    if (wanted) {
      const parent = await this.prisma.blogComment.findFirst({
        where: { id: wanted, postId, status: 'visible' },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new NotFoundException('Không tìm thấy bình luận được trả lời');
      parentId = parent.parentId ?? parent.id;
    }

    const row = await this.prisma.blogComment.create({
      data: { postId, authorId: userId, authorName: userName.slice(0, 80), content, parentId },
    });
    return {
      id: row.id,
      authorId: row.authorId,
      authorName: row.authorName,
      content: row.content,
      parentId: row.parentId,
      createdAt: row.createdAt.toISOString(),
      mine: true,
    };
  }

  /**
   * Xoá. Người viết tự xoá được; admin gỡ được của bất kỳ ai.
   *
   * Đánh dấu `hidden` chứ không xoá hàng: một bình luận biến mất kéo theo các trả lời của nó thành
   * mồ côi, và lịch sử kiểm duyệt cũng mất luôn.
   */
  async remove(id: string, userId: string, isAdmin: boolean): Promise<{ ok: true }> {
    const row = await this.prisma.blogComment.findUnique({ where: { id }, select: { authorId: true } });
    if (!row) throw new NotFoundException('Không tìm thấy bình luận');
    if (!isAdmin && row.authorId !== userId) throw new ForbiddenException('Không phải bình luận của bạn');
    await this.prisma.blogComment.update({ where: { id }, data: { status: 'hidden' } });
    return { ok: true };
  }

  /** Số bình luận của nhiều bài cùng lúc — để thẻ trên /blog hiện được con số mà không N+1. */
  async countsFor(postIds: string[]): Promise<Record<string, number>> {
    if (!postIds.length) return {};
    const rows = await this.prisma.blogComment.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds }, status: 'visible' },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.postId, r._count._all]));
  }
}
