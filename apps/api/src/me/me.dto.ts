import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { PlanId } from '@larkwave/shared';
import { PLAN_IDS } from '@larkwave/shared';

export class ActivityQueryDto {
  /** Size of the contribution window, in days (ending today, inclusive). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days = 365;
}

export class SetPlanDto {
  @IsIn(PLAN_IDS as readonly string[])
  plan!: PlanId;

  /** Admin-only: target another user. Defaults to the current user. */
  @IsOptional()
  @IsString()
  targetUserId?: string;
}

/** `PATCH /v1/me/profile` — self-edit the current user's display name + privacy. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  /** Whether to appear in the public "discover users" directory. */
  @IsOptional()
  @IsBoolean()
  discoverable?: boolean;
}

/** `PATCH /v1/me/avatar` — set a direct avatar URL (e.g. revert to Google). */
export class UpdateAvatarUrlDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  avatarUrl!: string;
}

/** `POST /v1/me/password` — change own password with the emailed 6-digit code. */
export class ChangePasswordDto {
  @IsString()
  @Length(6, 6, { message: 'Mã xác thực gồm 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã xác thực gồm 6 chữ số' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(128)
  newPassword!: string;
}
