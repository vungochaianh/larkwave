import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AppStatus, Track } from '@larkwave/shared';
import { PaginationDto } from '../common/dto/pagination.dto';

/** Body for the in-workspace DB admin insert/update: a column→value map. */
export class DbRowDto {
  @IsObject()
  values!: Record<string, unknown>;
}

const APP_STATUS: AppStatus[] = [
  'draft',
  'building',
  'live',
  'failed',
  'archived',
  'suspended',
];

const APP_TRACKS: Track[] = ['web', 'mobile', 'extension', 'desktop', 'game'];

export class AppQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(APP_STATUS)
  status?: AppStatus;

  /** Filter by app type (website/mobile/desktop/game/extension). */
  @IsOptional()
  @IsIn(APP_TRACKS)
  track?: Track;

  /** admin-only: filter by owner. */
  @IsOptional()
  @IsString()
  ownerId?: string;

  /** admin-only: only return apps flagged by the banned-keyword heuristic. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  flagged?: boolean;

  /** Only return the user's pinned apps (sidebar quick-access). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  pinned?: boolean;
}

export class SuspendAppDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class UpdateAppDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(['live', 'archived', 'draft'] as AppStatus[])
  status?: AppStatus;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

const MEMBER_ROLES = ['editor', 'viewer'] as const;

export class AddMemberDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @IsOptional()
  @IsIn(MEMBER_ROLES)
  role?: 'editor' | 'viewer';
}

export class UpdateMemberDto {
  @IsIn(MEMBER_ROLES)
  role!: 'editor' | 'viewer';
}
