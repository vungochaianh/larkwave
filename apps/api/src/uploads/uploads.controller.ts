import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { UploadContent, UploadListPage, UploadRef } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { UploadsService, type UploadedFileLike } from './uploads.service';

/** Nhãn mục đích hợp lệ. Chỉ 'chat' bị dọn theo hạn 30 ngày — xem PURGEABLE_PURPOSE. */
const ALLOWED_PURPOSE = new Set(['chat', 'feedback', 'marketing', 'build']);

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** `POST /v1/uploads` (multipart, field "file") — attach an image/PDF/doc/text. */
  @Post()
  @UseInterceptors(
    // Hard cap BEFORE buffering the whole body into memory (20MB covers office docs);
    // the service still enforces the per-kind size checks after.
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike,
    @Query('purpose') purpose?: string,
  ): Promise<UploadRef> {
    // Danh sách trắng: `purpose` quyết định tệp có bị dọn theo hạn hay không, nên một giá trị lạ
    // (hoặc do người dùng tự bịa) phải rơi về null = giữ lại, chứ không được biến thành nhãn
    // xoá được.
    const p = ALLOWED_PURPOSE.has(purpose ?? '') ? purpose : undefined;
    return this.uploads.upload(user, file, p);
  }

  /**
   * `GET /v1/uploads` — the user's own files, newest first. Metadata only.
   *
   * Declared BEFORE `:id` on purpose — Nest matches routes in order, and a later literal path
   * would be shadowed by the parameter route above it.
   */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<UploadListPage> {
    return this.uploads.listMine(user.id, {
      ...(limit ? { limit: Number(limit) || undefined } : {}),
      ...(cursor ? { cursor } : {}),
    });
  }

  /**
   * `GET /v1/uploads/:id/raw` — the ORIGINAL bytes, base64 inside JSON.
   *
   * JSON chứ không phải nhị phân, dù nhị phân gọn hơn 33%: cầu nối `accountFetch` của bản
   * desktop chỉ trả về TEXT, nên một endpoint nhị phân sẽ hỏng ở desktop và phải thêm kênh IPC
   * mới — mà bản desktop đã cài sẵn ở máy người dùng thì không có kênh đó. Một đường duy nhất
   * chạy được cả web lẫn desktop đáng giá hơn 33% băng thông cho một lần bấm tải.
   */
  @Get(':id/raw')
  raw(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ id: string; name: string; mime: string; dataBase64: string }> {
    return this.uploads.rawFile(user.id, id);
  }

  /** `DELETE /v1/uploads/:id` — the user removing their own file early. */
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.uploads.remove(user.id, id);
  }

  /** `GET /v1/uploads/:id` — full stored content (owner-only) for previewing. */
  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<UploadContent> {
    return this.uploads.getOne(user.id, id);
  }
}
