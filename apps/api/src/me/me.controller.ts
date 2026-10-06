import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MeActivity, MeOverview, MeSubscription, Payment, User } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PaymentsService } from '../payments/payments.service';
import { MeService } from './me.service';
import type { UploadedImageFile } from './me.service';
import {
  ActivityQueryDto,
  ChangePasswordDto,
  SetPlanDto,
  UpdateAvatarUrlDto,
  UpdateProfileDto,
} from './me.dto';

@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly payments: PaymentsService,
  ) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthUser): Promise<MeOverview> {
    return this.me.overview(user);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthUser, @Query() query: ActivityQueryDto): Promise<MeActivity> {
    return this.me.activity(user, query.days);
  }

  @Get('subscription')
  subscription(@CurrentUser() user: AuthUser): Promise<MeSubscription> {
    return this.me.subscription(user);
  }

  /** Set a plan (STUB — no payment yet). Self for users; any user for admins. */
  @Post('plan')
  setPlan(@CurrentUser() user: AuthUser, @Body() dto: SetPlanDto): Promise<MeSubscription> {
    return this.me.setPlan(user, dto.plan, dto.targetUserId);
  }

  /** The current user's bank-transfer payments, newest first. */
  @Get('payments')
  payments_list(@CurrentUser() user: AuthUser): Promise<Payment[]> {
    return this.payments.listMine(user);
  }

  // ── Referral ────────────────────────────────────────────────
  @Get('referral')
  referral(
    @CurrentUser() user: AuthUser,
  ): Promise<{ code: string; link: string; referrals: number; rewardPerReferral: number }> {
    return this.me.referral(user);
  }

  /** Capture a referral code shortly after signup (OAuth + email). */
  @Post('referral')
  @HttpCode(200)
  captureReferral(
    @CurrentUser() user: AuthUser,
    @Body() body: { ref?: string },
  ): Promise<{ applied: boolean }> {
    return this.me.captureReferral(user, body?.ref ?? '');
  }

  // ── Self profile editing (current user only — NOT admin) ─────────────────────

  /** `PATCH /v1/me/profile` — edit own display name. Returns the updated user. */
  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    return this.me.updateProfile(user, dto.name, dto.discoverable);
  }

  /**
   * `POST /v1/me/avatar` — multipart/form-data, field `file`. Validates image
   * type (png/jpeg/webp/gif) and size (<= 3MB), stores it, sets avatarUrl.
   */
  @Post('avatar')
  // Avatar is <=3MB (service-enforced); cap at 5MB before buffering into memory.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedImageFile,
  ): Promise<User> {
    return this.me.updateAvatarFromUpload(user, file);
  }

  /** `PATCH /v1/me/avatar` — set a direct avatar URL (e.g. revert to Google). */
  @Patch('avatar')
  setAvatarUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAvatarUrlDto,
  ): Promise<User> {
    return this.me.updateAvatarUrl(user, dto.avatarUrl);
  }

  // ── Change password (OTP, logged in) ─────────────────────────────────────────

  /**
   * `POST /v1/me/password/request-code` — email the current user a 6-digit code
   * (60s cooldown). Returns { ok, sentTo } with the masked email.
   */
  @HttpCode(200)
  @Post('password/request-code')
  requestPasswordCode(
    @CurrentUser() user: AuthUser,
  ): Promise<{ ok: true; sentTo: string }> {
    return this.me.requestPasswordCode(user);
  }

  /** `POST /v1/me/password` — verify the emailed code and set a new password. */
  @HttpCode(200)
  @Post('password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    return this.me.changePassword(user, dto.code, dto.newPassword);
  }
}
