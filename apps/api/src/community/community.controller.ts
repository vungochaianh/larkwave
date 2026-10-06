import {
  Body,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import {
  CommunityService,
  type CommunityAttachment,
  type CommunityCommentView,
  type CommunityFeed,
  type CommunityPostView,
  type UploadedAttachmentFile,
} from './community.service';

/** "Cộng đồng" — dòng thời gian bài đăng ngắn, thích và bình luận. */
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('feed')
  feed(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    /** Tìm trong nội dung bài VÀ tên người đăng. Rỗng = dòng thời gian như thường. */
    @Query('q') q?: string,
  ): Promise<CommunityFeed> {
    return this.community.feed(user, cursor || undefined, q || undefined);
  }

  /**
   * `POST /v1/community/uploads` (multipart, trường "file", tối đa 20MB) → `{url, name, mime, size}`
   * — đúng hình dạng để nhét thẳng vào `attachments` của `POST posts`.
   */
  @Post('uploads')
  // Chặn kích thước TRƯỚC khi multer đệm cả thân vào bộ nhớ; service kiểm lại lần nữa.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedAttachmentFile,
  ): Promise<CommunityAttachment> {
    return this.community.storeAttachment(user, file);
  }

  @Post('posts')
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: { content?: string; attachments?: CommunityAttachment[] },
  ): Promise<CommunityPostView> {
    return this.community.createPost(user, body?.content ?? '', body?.attachments);
  }

  @Delete('posts/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.community.deletePost(user, id);
  }

  @Post('posts/:id/like')
  like(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    return this.community.toggleLike(user, id);
  }

  @Get('posts/:id/comments')
  comments(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<CommunityCommentView[]> {
    return this.community.comments(user, id);
  }

  @Post('posts/:id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { content?: string; parentId?: string | null },
  ): Promise<CommunityCommentView> {
    return this.community.addComment(user, id, body?.content ?? '', body?.parentId);
  }

  @Delete('comments/:id')
  removeComment(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.community.deleteComment(user, id);
  }
}
