import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { UploadContent, UploadListItem, UploadListPage, UploadRef } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';
import { extractOfficeText, officeKindFor } from './ooxml';

/** Minimal shape of a Multer-parsed upload (avoids needing @types/multer). */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_IMAGE = 5 * 1024 * 1024; // 5MB
const MAX_TEXT = 256 * 1024; // 256KB (cap on extracted/raw text content)
const MAX_PDF = 10 * 1024 * 1024; // 10MB — fed natively to Claude (document block)
const MAX_OFFICE = 20 * 1024 * 1024; // 20MB — only text is extracted (→ MAX_TEXT)

const PDF_MIME = 'application/pdf';

/**
 * Đuôi tệp → mime, dùng khi trình duyệt không nói (rất hay: `new File([bytes], name)` không có
 * `{type}` sẽ ra application/octet-stream). Nếu lưu nguyên octet-stream thì mọi .xlsx tải lên
 * từ trò chuyện sẽ bị trả về dưới dạng text/plain khi tải xuống — mở ra là một đống ký tự lạ.
 */
const EXT_MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  csv: 'text/csv',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: PDF_MIME,
};

/** Mime đáng tin nhất cho một tệp: đuôi tệp trước, rồi mới đến thứ trình duyệt khai báo. */
function bestMime(name: string, declared: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext && EXT_MIME[ext]) return EXT_MIME[ext];
  return declared && declared !== 'application/octet-stream' ? declared : 'application/octet-stream';
}

/**
 * Thời gian giữ tệp. Hết hạn thì XOÁ NỘI DUNG nhưng GIỮ LẠI DÒNG dữ liệu.
 *
 * Xoá hẳn cả dòng thì một hội thoại cũ mở ra chỉ nhận được "không tìm thấy" — không phân biệt
 * nổi với id sai hay tệp của người khác, nên không thể nói cho người dùng biết chuyện gì đã
 * xảy ra. Bia mộ (tên + dung lượng + purgedAt) chỉ nặng vài chục byte và đổi lấy một câu trả
 * lời thành thật: "tệp đã bị xoá vì quá 30 ngày".
 */
export const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Chỉ tệp đính kèm trong TRÒ CHUYỆN và khi TẠO APP mới bị dọn theo hạn.
 *
 * 'build' được thêm sau: tệp gửi kèm lúc tạo app là những tệp NẶNG NHẤT người dùng tải lên, mà
 * lại chưa gắn nhãn nào nên hạn 30 ngày không bao giờ chạm tới — đúng ngược với ý định.
 *
 * Cùng một bảng Upload còn giữ ảnh chụp màn hình báo lỗi (quản trị viên đọc lại sau nhiều
 * tháng), ảnh nguồn cho marketing, và tệp tham chiếu khi tạo app. Một luật "quá 30 ngày là
 * xoá" áp cho cả bảng sẽ âm thầm phá hết những thứ đó. Dòng chưa gắn nhãn (null) nằm ở phía
 * GIỮ LẠI — đoán sai theo hướng giữ thì chỉ tốn dung lượng, đoán sai theo hướng xoá thì mất
 * dữ liệu của người khác.
 */
export const PURGEABLE_PURPOSES = ['chat', 'build'] as const;

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// Text-like files whose content we extract and feed to the model as context.
const TEXT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'application/json',
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
  'application/typescript',
]);
// Many code/text files arrive as application/octet-stream — fall back to the
// extension to decide whether to treat them as text.
const TEXT_EXT =
  /\.(txt|md|markdown|csv|json|ya?ml|toml|html?|css|scss|less|js|jsx|ts|tsx|vue|svelte|py|rb|go|rs|java|kt|php|c|cpp|h|cs|sql|sh|env|ini|xml|prisma)$/i;

@Injectable()
export class UploadsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(UploadsService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Quét mỗi giờ là đủ: hạn tính bằng NGÀY, nên trễ một giờ không ai thấy, mà lại không nện
    // vào cơ sở dữ liệu. Chạy trong tiến trình vì chỉ có MỘT instance api dưới systemd — cùng
    // mô hình mà ScheduledService đang dùng, không có đua giữa nhiều node.
    this.timer = setInterval(() => void this.purgeExpired(), 60 * 60 * 1000);
    // Quét sớm một lần sau khi khởi động để deploy xong là hạn cũ được dọn ngay.
    setTimeout(() => void this.purgeExpired(), 45_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Xoá nội dung của mọi tệp quá hạn, giữ lại phần mô tả.
   *
   * Mốc tính theo `createdAt` chứ không lưu sẵn một cột `expiresAt`: hạn là một hằng số của hệ
   * thống, lưu thêm một cột nữa chỉ tạo ra hai nguồn sự thật có thể lệch nhau, và buộc phải
   * backfill cho mọi dòng đã có.
   */
  async purgeExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    try {
      const res = await this.prisma.upload.updateMany({
        where: { purpose: { in: [...PURGEABLE_PURPOSES] }, purgedAt: null, createdAt: { lt: cutoff } },
        data: { data: '', rawData: null, purgedAt: new Date() },
      });
      if (res.count) this.log.log(`đã xoá nội dung ${res.count} tệp quá ${RETENTION_DAYS} ngày`);
      return res.count;
    } catch (e) {
      this.log.warn(`dọn tệp quá hạn thất bại: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Hạn xoá của một tệp — suy ra từ ngày tạo, không lưu riêng. */
  private expiryOf(createdAt: Date): Date {
    return new Date(createdAt.getTime() + RETENTION_MS);
  }

  async upload(user: AuthUser, file?: UploadedFileLike, purpose?: string): Promise<UploadRef> {
    if (!file) throw new BadRequestException('Thiếu tệp (trường "file")');
    const name = (file.originalname || 'file').slice(0, 200);
    const lower = name.toLowerCase();
    // Nhận diện theo mime ĐÃ CHUẨN HOÁ. Trước đây chỉ so mime trình duyệt khai: web gửi ảnh qua
    // `new File([bytes], name)` không kèm type → octet-stream → bị từ chối, và lỗi bị nuốt mất,
    // nên ảnh đính kèm ở /claude chưa bao giờ đến được máy chủ.
    const declaredMime = bestMime(name, file.mimetype);
    const isImage = IMAGE_MIME.has(declaredMime);
    const isPdf = !isImage && (declaredMime === PDF_MIME || lower.endsWith('.pdf'));
    const office = !isImage && !isPdf ? officeKindFor(name, file.mimetype) : null;
    const isText =
      !isImage && !isPdf && !office && (TEXT_MIME.has(declaredMime) || TEXT_EXT.test(name));

    if (!isImage && !isPdf && !office && !isText) {
      throw new BadRequestException(
        'Định dạng không hỗ trợ. Hỗ trợ: ảnh (PNG/JPEG/WEBP/GIF), PDF, ' +
          'Word/PowerPoint/Excel (.docx/.pptx/.xlsx) và tệp văn bản/code (txt, md, json, code…).',
      );
    }
    if (isImage && file.size > MAX_IMAGE) {
      throw new BadRequestException('Ảnh phải nhỏ hơn 5MB.');
    }
    if (isPdf && file.size > MAX_PDF) {
      throw new BadRequestException('Tệp PDF phải nhỏ hơn 10MB.');
    }
    if (office && file.size > MAX_OFFICE) {
      throw new BadRequestException('Tệp tài liệu (Word/PowerPoint/Excel) phải nhỏ hơn 20MB.');
    }

    // Resolve to a stored (kind, data, mime). Images + PDFs are kept as base64 and
    // fed natively to Claude (vision / document blocks); Office docs are reduced to
    // extracted text; everything else is raw text/code.
    let kind: 'image' | 'pdf' | 'text';
    let data: string;
    let mime: string;
    if (isImage) {
      kind = 'image';
      data = file.buffer.toString('base64');
      mime = declaredMime;
    } else if (isPdf) {
      kind = 'pdf';
      data = file.buffer.toString('base64');
      mime = PDF_MIME;
    } else if (office) {
      const extracted = extractOfficeText(file.buffer, office).slice(0, MAX_TEXT);
      if (!extracted.trim()) {
        throw new BadRequestException(
          'Không đọc được nội dung văn bản từ tệp này (có thể là tệp ảnh/scan). ' +
            'Hãy thử lưu sang PDF rồi tải lên.',
        );
      }
      kind = 'text';
      data = extracted;
      mime = declaredMime; // giữ mime OOXML thật để tải xuống mở đúng bằng Excel/Word

    } else {
      if (file.size > MAX_TEXT) {
        throw new BadRequestException('Tệp văn bản phải nhỏ hơn 256KB.');
      }
      kind = 'text';
      data = file.buffer.toString('utf8').slice(0, MAX_TEXT);
      mime = declaredMime === 'application/octet-stream' ? 'text/plain' : declaredMime;
    }

    // Giữ bản gốc để người dùng tải lại được đúng tệp họ đã gửi. Chỉ giữ khi `data` KHÔNG phải
    // bản gốc (office/text đang lưu phần chữ trích ra) — với ảnh/PDF thì `data` chính là bản gốc,
    // lưu thêm lần nữa là nhân đôi đúng những dòng nặng nhất.
    const rawData = isImage || isPdf ? null : file.buffer.toString('base64');
    const row = await this.prisma.upload.create({
      data: {
        ownerId: user.id,
        name,
        mime,
        kind,
        data,
        rawData,
        size: file.size,
        ...(purpose ? { purpose } : {}),
      },
      select: { id: true, name: true, kind: true, mime: true, size: true },
    });
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as 'image' | 'text' | 'pdf',
      mime: row.mime,
      size: row.size,
    };
  }

  /**
   * Lưu một tệp DO TRỢ LÝ TẠO RA, nguyên trạng.
   *
   * KHÔNG đi qua `upload()`: cổng đó là cho tệp NGƯỜI DÙNG tải lên và có luật riêng — nó từ chối
   * một .xlsx không trích được chữ với câu "có thể là tệp ảnh/scan, hãy lưu sang PDF". Áp luật đó
   * cho tệp máy tự sinh là vô nghĩa và đã làm mất đúng cái hợp đồng người dùng vừa nhờ tạo.
   * Ở đây chỉ cần giữ đủ byte để tải về, cộng phần chữ trích được (nếu có) để xem trước.
   */
  async storeGenerated(ownerId: string, name: string, buf: Buffer): Promise<UploadRef> {
    const safe = (name || 'ket-qua').slice(0, 200);
    const mime = bestMime(safe, '');
    const isImage = IMAGE_MIME.has(mime);
    const isPdf = mime === PDF_MIME;
    const office = officeKindFor(safe, mime);
    let kind: 'image' | 'pdf' | 'text' = 'text';
    let data = '';
    if (isImage) {
      kind = 'image';
      data = buf.toString('base64');
    } else if (isPdf) {
      kind = 'pdf';
      data = buf.toString('base64');
    } else if (office) {
      // Trích được chữ thì tốt (xem trước được); không trích được vẫn LƯU — khác hẳn upload().
      data = extractOfficeText(buf, office).slice(0, MAX_TEXT);
    } else {
      data = buf.toString('utf8').slice(0, MAX_TEXT);
    }
    const row = await this.prisma.upload.create({
      data: {
        ownerId,
        name: safe,
        mime,
        kind,
        data,
        rawData: isImage || isPdf ? null : buf.toString('base64'),
        size: buf.length,
        purpose: 'chat', // tệp do trợ lý tạo ra thuộc luồng trò chuyện
      },
      select: { id: true, name: true, kind: true, mime: true, size: true },
    });
    return { id: row.id, name: row.name, kind: row.kind as 'image' | 'text' | 'pdf', mime: row.mime, size: row.size };
  }

  /** Fetch one upload's full content (owner-only) so the UI can preview it. */
  async getOne(ownerId: string, id: string): Promise<UploadContent> {
    const row = await this.prisma.upload.findFirst({
      where: { id, ownerId },
      select: { id: true, name: true, kind: true, mime: true, size: true, data: true, purgedAt: true, createdAt: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy tệp đính kèm');
    // 410 chứ không phải 404: tệp NÀY từng tồn tại và đã bị xoá theo hạn lưu trữ. Client cần
    // phân biệt được để nói "đã hết hạn" thay vì "không tìm thấy" — hai chuyện khác hẳn nhau
    // với người dùng đang mở lại hội thoại cũ.
    if (row.purgedAt) {
      throw new GoneException(
        `Tệp "${row.name}" đã bị xoá vì quá hạn lưu trữ ${RETENTION_DAYS} ngày.`,
      );
    }
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as 'image' | 'text' | 'pdf',
      mime: row.mime,
      size: row.size,
      data: row.data,
    };
  }

  /**
   * Danh sách tệp của một người dùng, mới nhất trước. KHÔNG trả về nội dung — một trang danh
   * sách 50 tệp mà kèm base64 thì nặng hàng chục MB cho thứ chỉ hiện ra tên và dung lượng.
   */
  async listMine(
    ownerId: string,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<UploadListPage> {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const rows = await this.prisma.upload.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // lấy dư 1 để biết còn trang sau hay không, không cần đếm toàn bảng
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: {
        id: true, name: true, kind: true, mime: true, size: true,
        createdAt: true, purgedAt: true, rawData: true,
        // Cần `purpose` để biết tệp có nằm trong diện tự dọn hay không.
        purpose: true,
      },
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind as 'image' | 'text' | 'pdf',
        mime: r.mime,
        size: r.size,
        createdAt: r.createdAt.toISOString(),
        // Chỉ tệp thuộc diện tự dọn mới có ngày hết hạn; còn lại trả null để giao diện nói
        // "giữ vĩnh viễn" thay vì bịa một ngày xoá không bao giờ tới.
        expiresAt: PURGEABLE_PURPOSES.includes((r.purpose ?? '') as (typeof PURGEABLE_PURPOSES)[number])
          ? this.expiryOf(r.createdAt).toISOString()
          : null,
        expired: !!r.purgedAt,
        // Tệp tải lên trước khi có cột rawData không có bản gốc để trả lại. Nói thẳng bằng một
        // cờ để giao diện tắt nút Tải, thay vì để người dùng bấm rồi nhận lỗi.
        downloadable: !r.purgedAt && (r.kind !== 'text' || r.rawData !== null),
      })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null,
    };
  }

  /**
   * Bản gốc của một tệp để tải về. Ảnh/PDF nằm sẵn ở `data`; office/text nằm ở `rawData`.
   */
  async rawFile(
    ownerId: string,
    id: string,
  ): Promise<{ id: string; name: string; mime: string; dataBase64: string }> {
    const row = await this.prisma.upload.findFirst({
      where: { id, ownerId },
      select: { name: true, mime: true, kind: true, data: true, rawData: true, purgedAt: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy tệp');
    if (row.purgedAt) {
      throw new GoneException(`Tệp "${row.name}" đã bị xoá vì quá hạn lưu trữ ${RETENTION_DAYS} ngày.`);
    }
    const b64 = row.rawData ?? (row.kind === 'text' ? null : row.data);
    if (!b64) {
      throw new GoneException(
        `Tệp "${row.name}" được tải lên trước khi hệ thống lưu bản gốc, nên chỉ xem được nội dung chữ, không tải lại được.`,
      );
    }
    return { id, name: row.name, mime: row.mime || 'application/octet-stream', dataBase64: b64 };
  }

  /** Người dùng tự xoá một tệp — xoá hẳn, không phải bia mộ hết hạn. */
  async remove(ownerId: string, id: string): Promise<{ ok: true }> {
    const res = await this.prisma.upload.deleteMany({ where: { id, ownerId } });
    if (!res.count) throw new NotFoundException('Không tìm thấy tệp');
    return { ok: true };
  }

  /**
   * Resolve attachment ids the user owns into model-ready context:
   * concatenated text + base64 images + base64 PDF documents. Used by the pipeline.
   */
  async resolveForPrompt(
    ownerId: string,
    ids: string[],
  ): Promise<{
    text: string;
    images: { mime: string; data: string }[];
    documents: { mime: string; data: string; name?: string }[];
    /** Per-file extracted text, kept separate from the joined `text` blob so a caller can write
     *  each attachment back out as its OWN file (the agentic chat seeds them into a workspace so
     *  a skill that says "read the attached PI" finds a real file instead of an empty folder). */
    texts: { name: string; content: string }[];
  }> {
    if (!ids?.length) return { text: '', images: [], documents: [], texts: [] };
    const rows = await this.prisma.upload.findMany({
      where: { id: { in: ids }, ownerId },
    });
    const images: { mime: string; data: string }[] = [];
    const documents: { mime: string; data: string; name?: string }[] = [];
    const textParts: string[] = [];
    const texts: { name: string; content: string }[] = [];
    const expired: string[] = [];
    for (const r of rows) {
      // Tệp đã hết hạn KHÔNG được lẳng lặng đi vào prompt. Nội dung của nó đã bị xoá thành chuỗi
      // rỗng, nên nếu cứ đẩy vào thì model "đọc" một tệp trống rồi trả lời rất tự tin từ hư
      // không — sai lặng lẽ, kiểu tệ nhất. Nói thẳng ra trong phần chữ để model biết mà từ chối.
      if (r.purgedAt || (r.kind !== 'image' && r.kind !== 'pdf' && !r.data)) {
        expired.push(r.name);
        continue;
      }
      if (r.kind === 'image') {
        images.push({ mime: r.mime, data: r.data });
      } else if (r.kind === 'pdf') {
        documents.push({ mime: r.mime || PDF_MIME, data: r.data, name: r.name });
      } else {
        textParts.push(`----- TỆP ĐÍNH KÈM: ${r.name} -----\n${r.data}`);
        texts.push({ name: r.name, content: r.data });
      }
    }
    if (expired.length) {
      textParts.push(
        `----- TỆP KHÔNG CÒN ĐỌC ĐƯỢC -----\n` +
          `${expired.join(', ')} đã bị xoá vì quá hạn lưu trữ ${RETENTION_DAYS} ngày. ` +
          `KHÔNG được suy đoán nội dung của (các) tệp này. Hãy nói với người dùng rằng tệp đã hết ` +
          `hạn và đề nghị họ tải lại.`,
      );
    }
    // Cap totals to keep the request sane.
    return {
      text: textParts.join('\n\n').slice(0, MAX_TEXT),
      images: images.slice(0, 6),
      documents: documents.slice(0, 5),
      texts: texts.slice(0, 6),
    };
  }
}
