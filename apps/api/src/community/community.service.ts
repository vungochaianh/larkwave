import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import type { AuthUser } from '../common/auth-user';

/** Giới hạn độ dài — đủ cho một mẩu suy nghĩ, không thành bài blog. */
const MAX_POST = 2_000;
const MAX_COMMENT = 1_000;
const PAGE = 20;
/** Tối đa 20MB một tệp đính kèm — trùng với nắp của FileInterceptor ở controller. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Đuôi tệp ĐƯỢC PHÉP cất trên đĩa và phục vụ tĩnh từ API origin.
 *
 * Tệp cất ở đây được express phục vụ y nguyên, Content-Type suy từ đuôi. Cho phép `.html`/`.svg`/
 * `.js` là cho người lạ chạy script trên chính origin của API — một lỗ XSS mở sẵn. Vì thế đuôi
 * KHÔNG nằm trong danh sách này thì đổi thành `.bin` (octet-stream → trình duyệt chỉ tải về,
 * không bao giờ thực thi). Danh sách này là danh sách trắng, không phải danh sách đen.
 */
const SAFE_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
  'pdf', 'txt', 'md', 'csv', 'json',
  'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'mp4', 'mp3', 'webm', 'm4a',
]);

/** Tệp multer đưa vào — chỉ những trường ta thật sự dùng. */
export interface UploadedAttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface CommunityAuthor {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Một tệp đính kèm của bài đăng. `mime` quyết định hiện thành ảnh hay thẻ tải về. */
export interface CommunityAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface CommunityPostView {
  id: string;
  author: CommunityAuthor;
  content: string;
  attachments: CommunityAttachment[];
  createdAt: string;
  likeCount: number;
  commentCount: number;
  /** Người đang xem đã thích chưa — để nút thích không phải gọi thêm lượt nào. */
  likedByMe: boolean;
  /** Người đang xem có quyền xoá không (chủ bài hoặc quản trị). */
  canDelete: boolean;
}

export interface CommunityCommentView {
  id: string;
  author: CommunityAuthor;
  content: string;
  createdAt: string;
  canDelete: boolean;
  /** Bình luận cha, null = bình luận gốc. Giao diện tự gom thành một cấp. */
  parentId: string | null;
}

/**
 * Đọc mảng đính kèm từ cột Json, bỏ mọi thứ không đúng dạng.
 *
 * Cột Json nên dữ liệu trong đó KHÔNG được CSDL bảo đảm hình dạng — một bản ghi cũ, một lần ghi
 * tay, hay một bản vá hỏng đều có thể để lại rác. Lọc ở đây thay vì tin, vì thứ này đi thẳng ra
 * giao diện công khai.
 */
function readAttachments(raw: unknown): CommunityAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: CommunityAttachment[] = [];
  for (const it of raw.slice(0, 8)) {
    const o = it as Partial<CommunityAttachment> | null;
    const url = String(o?.url || '').trim();
    // Chỉ nhận đường dẫn tương đối hoặc http(s). Chặn `javascript:` và `data:` — chúng đi vào
    // thuộc tính href/src của trang công khai.
    if (!url || !/^(https?:\/\/|\/)/i.test(url)) continue;
    out.push({
      url,
      name: String(o?.name || 'tệp').slice(0, 200),
      mime: String(o?.mime || '').slice(0, 100),
      size: Number(o?.size) || 0,
    });
  }
  return out;
}

export interface CommunityFeed {
  items: CommunityPostView[];
  /** Con trỏ trang sau; null là hết. */
  nextCursor: string | null;
}

type AuthorRow = { id: string; name: string | null; email: string; avatarUrl: string | null };

const authorOf = (u: AuthorRow): CommunityAuthor => ({
  id: u.id,
  // Chưa đặt tên thì lấy phần trước @ của email — KHÔNG đưa email đầy đủ lên dòng thời gian
  // công khai, đó là dữ liệu liên hệ chứ không phải tên hiển thị.
  name: u.name?.trim() || u.email.split('@')[0],
  avatarUrl: u.avatarUrl,
});

const AUTHOR_SELECT = { id: true, name: true, email: true, avatarUrl: true } as const;

/**
 * "Cộng đồng" — dòng thời gian bài đăng ngắn, có thích và bình luận.
 *
 * Đọc thì mở cho mọi người đã đăng nhập: đây là chỗ công khai, không phải hộp thư riêng. Ghi thì
 * hẹp: chỉ người viết (hoặc quản trị) mới xoá được bài và bình luận của mình.
 */
@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Cất một tệp đính kèm lên đĩa và trả về URL CÔNG KHAI của nó.
   *
   * Vì sao không dùng `POST /v1/uploads` sẵn có: kho đó cất base64 trong CSDL và chỉ CHỦ SỞ HỮU
   * đọc được qua JSON — không có URL nào để `<img src>` của người khác tải, và tệp `purpose=chat`
   * còn bị dọn sau 30 ngày. Bài đăng là dữ liệu công khai, sống lâu, nên đi đường của ảnh đại
   * diện: ghi vào `uploadsDir/community`, express phục vụ tĩnh tại `${publicApiUrl}/uploads/...`.
   *
   * Tên tệp do MÁY CHỦ đặt (id người + thời điểm + ngẫu nhiên): tên gốc chỉ giữ để hiển thị, không
   * bao giờ chạm vào đường dẫn đĩa — chặn `../` và đè tệp của người khác từ gốc.
   */
  async storeAttachment(user: AuthUser, file?: UploadedAttachmentFile): Promise<CommunityAttachment> {
    if (!file || !file.buffer?.length) throw new BadRequestException('Thiếu tệp (trường "file").');
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException('Tệp tối đa 20MB.');

    const original = String(file.originalname || 'tệp').slice(0, 200);
    const rawExt = (original.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? '').toLowerCase();
    const ext = SAFE_EXT.has(rawExt) ? rawExt : 'bin';

    const dir = join(this.config.uploadsDir, 'community');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${user.id}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    await fs.writeFile(join(dir, filename), file.buffer);

    return {
      url: `${this.config.publicApiUrl}/uploads/community/${filename}`,
      name: original,
      // Đuôi bị đổi thành .bin thì mime cũng không được khai là ảnh — giao diện quyết định
      // "hiện thành ảnh" theo mime, và một tệp .bin mà hiện thành <img> chỉ ra ô vỡ.
      mime: ext === 'bin' ? 'application/octet-stream' : String(file.mimetype || '').slice(0, 100),
      size: file.size,
    };
  }

  private clean(text: string, max: number, what: string): string {
    const t = (text ?? '').trim();
    if (!t) throw new BadRequestException(`${what} không được để trống.`);
    if (t.length > max) throw new BadRequestException(`${what} tối đa ${max} ký tự.`);
    return t;
  }

  /**
   * Dòng thời gian, có tìm kiếm.
   *
   * Tìm KHÔNG phân biệt hoa thường và tìm cả trong tên người đăng — người ta nhớ "bài của Hà" nhiều
   * hơn là nhớ chữ trong bài. Tìm rỗng thì trả về như cũ.
   */
  async feed(user: AuthUser, cursor?: string, q?: string): Promise<CommunityFeed> {
    const term = (q || '').trim().slice(0, 100);
    const where = term
      ? {
          OR: [
            { content: { contains: term, mode: 'insensitive' as const } },
            { author: { name: { contains: term, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const rows = await this.prisma.socialPost.findMany({
      where,
      take: PAGE + 1, // lấy dư một để biết còn trang sau mà không phải đếm tổng
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true, comments: true } },
        // CHỈ lấy lượt thích của chính người xem: đủ để biết đã thích chưa, mà không kéo về
        // toàn bộ danh sách người thích của mỗi bài.
        likes: { where: { userId: user.id }, select: { userId: true } },
      },
    });

    const hasMore = rows.length > PAGE;
    const page = hasMore ? rows.slice(0, PAGE) : rows;
    const items = page.map((p) => ({
      id: p.id,
      author: authorOf(p.author),
      content: p.content,
      attachments: readAttachments(p.attachments),
      createdAt: p.createdAt.toISOString(),
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      likedByMe: p.likes.length > 0,
      canDelete: p.authorId === user.id || user.role === 'admin',
    }));

    return { items, nextCursor: hasMore && items.length ? items[items.length - 1]!.id : null };
  }

  async createPost(
    user: AuthUser,
    content: string,
    attachments?: CommunityAttachment[],
  ): Promise<CommunityPostView> {
    const files = readAttachments(attachments ?? []);
    // Bài CHỈ có ảnh là hợp lệ — bắt buộc có chữ thì người ta phải gõ một dấu chấm cho qua cửa.
    const text = files.length
      ? String(content || '').trim().slice(0, MAX_POST)
      : this.clean(content, MAX_POST, 'Nội dung bài đăng');
    const p = await this.prisma.socialPost.create({
      data: { authorId: user.id, content: text, attachments: files as unknown as object },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return {
      id: p.id,
      author: authorOf(p.author),
      content: p.content,
      attachments: files,
      createdAt: p.createdAt.toISOString(),
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      canDelete: true,
    };
  }

  async deletePost(user: AuthUser, id: string): Promise<{ ok: true }> {
    const post = await this.prisma.socialPost.findUnique({ where: { id }, select: { authorId: true } });
    if (!post) throw new NotFoundException('Không tìm thấy bài đăng.');
    if (post.authorId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Chỉ người đăng mới xoá được bài này.');
    }
    // Lượt thích và bình luận đi theo bài (onDelete: Cascade trong schema).
    await this.prisma.socialPost.delete({ where: { id } });
    return { ok: true };
  }

  /** Bấm lần nữa là bỏ thích. Trả luôn số đếm mới để giao diện khỏi tải lại cả dòng thời gian. */
  async toggleLike(user: AuthUser, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    const exists = await this.prisma.socialPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Không tìm thấy bài đăng.');

    const key = { postId_userId: { postId, userId: user.id } };
    const had = await this.prisma.socialPostLike.findUnique({ where: key, select: { userId: true } });
    if (had) {
      await this.prisma.socialPostLike.delete({ where: key });
    } else {
      // Bấm hai lần thật nhanh có thể cùng lúc tới đây: khoá chính ghép (postId,userId) chặn bản
      // ghi thứ hai ở tầng CSDL, và ta coi đó là "đã thích rồi" chứ không ném lỗi ra màn hình.
      await this.prisma.socialPostLike
        .create({ data: { postId, userId: user.id } })
        .catch(() => undefined);
    }
    const likeCount = await this.prisma.socialPostLike.count({ where: { postId } });
    return { liked: !had, likeCount };
  }

  async comments(user: AuthUser, postId: string): Promise<CommunityCommentView[]> {
    const rows = await this.prisma.socialComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return rows.map((c) => ({
      id: c.id,
      author: authorOf(c.author),
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      canDelete: c.authorId === user.id || user.role === 'admin',
      parentId: c.parentId,
    }));
  }

  /**
   * Thêm bình luận, có thể là TRẢ LỜI một bình luận khác.
   *
   * Chỉ MỘT cấp: nhắm vào một dòng vốn đã là trả lời thì gắn lên CHA của nó thay vì đẻ ra tầng
   * thứ ba. Từ chối sẽ khó chịu mà chẳng được gì — người dùng chỉ muốn nói với ai đó trong nhánh
   * đang mở, họ không quan tâm cây sâu mấy tầng.
   */
  async addComment(
    user: AuthUser,
    postId: string,
    content: string,
    parentIdRaw?: string | null,
  ): Promise<CommunityCommentView> {
    const text = this.clean(content, MAX_COMMENT, 'Bình luận');
    const exists = await this.prisma.socialPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Không tìm thấy bài đăng.');

    let parentId: string | null = null;
    const wanted = String(parentIdRaw || '').trim();
    if (wanted) {
      // Kiểm cha thuộc ĐÚNG bài này: thiếu điều kiện đó thì gửi id của bài khác sẽ ghép một nhánh
      // trả lời vào bài không liên quan, và nó hiện ra ở nơi không ai ngờ.
      const parent = await this.prisma.socialComment.findFirst({
        where: { id: wanted, postId },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new NotFoundException('Không tìm thấy bình luận được trả lời.');
      parentId = parent.parentId ?? parent.id;
    }

    const c = await this.prisma.socialComment.create({
      data: { postId, authorId: user.id, content: text, parentId },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return {
      id: c.id,
      author: authorOf(c.author),
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      canDelete: true,
      parentId: c.parentId,
    };
  }

  async deleteComment(user: AuthUser, id: string): Promise<{ ok: true }> {
    const c = await this.prisma.socialComment.findUnique({ where: { id }, select: { authorId: true } });
    if (!c) throw new NotFoundException('Không tìm thấy bình luận.');
    if (c.authorId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Chỉ người viết mới xoá được bình luận này.');
    }
    await this.prisma.socialComment.delete({ where: { id } });
    return { ok: true };
  }
}
