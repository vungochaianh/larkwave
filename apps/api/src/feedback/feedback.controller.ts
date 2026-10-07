import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  AdminUpdateFeedbackRequest,
  Feedback,
  FeedbackSimilar,
  MyFeedbackResponse,
  Paginated,
  SubmitFeedbackRequest,
  UploadContent,
} from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/auth-user';
import { FeedbackService } from './feedback.service';

/** Any signed-in user submits + tracks their own in-app bug/error reports. */
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitFeedbackRequest): Promise<Feedback> {
    return this.feedback.submit(user, dto);
  }

  /** The signed-in user's own reports (listed on /support). */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser): Promise<MyFeedbackResponse> {
    return this.feedback.mine(user);
  }

  /** Preview an attachment on one of the user's OWN reports. */
  @Get(':id/attachment/:uploadId')
  attachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ): Promise<UploadContent> {
    return this.feedback.getAttachment(id, uploadId, user.id);
  }
}

/** Admins triage user-reported bugs in /admin/feedback. */
@Roles('admin')
@Controller('admin/feedback')
export class AdminFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<Paginated<Feedback>> {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const ps = Math.min(50, Math.max(1, parseInt(pageSize ?? '20', 10) || 20));
    return this.feedback.adminList(status, p, ps);
  }

  /** All matching reports (no pagination) for CSV export. */
  @Get('export')
  exportAll(@Query('status') status?: string): Promise<Feedback[]> {
    return this.feedback.exportAll(status);
  }

  /** Candidate duplicates for a report (Claude-assisted). */
  @Get(':id/similar')
  similar(@Param('id') id: string): Promise<FeedbackSimilar[]> {
    return this.feedback.findSimilar(id);
  }

  /** Admin one-click: resolve all open reports. */
  @Post('resolve-all')
  resolveAll(): Promise<{ count: number }> {
    return this.feedback.resolveAllOpen();
  }

  /** Admin can view any report's attachment. */
  @Get(':id/attachment/:uploadId')
  attachment(
    @Param('id') id: string,
    @Param('uploadId') uploadId: string,
  ): Promise<UploadContent> {
    return this.feedback.getAttachment(id, uploadId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateFeedbackRequest,
  ): Promise<Feedback> {
    return this.feedback.adminUpdate(id, dto);
  }
}
