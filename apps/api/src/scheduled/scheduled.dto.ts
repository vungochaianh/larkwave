import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const DELIVER_MODES = ['notification', 'telegram', 'both'] as const;

/** Shape returned to the web. */
export interface ScheduledTaskDto {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  deliver: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  runCount: number;
  createdAt: string;
}

export class CreateScheduledTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt!: string;

  /** 5-field cron expression (minute hour day month weekday), interpreted in `timezone`. */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cron!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsIn(DELIVER_MODES as readonly string[])
  deliver?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateScheduledTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cron?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsIn(DELIVER_MODES as readonly string[])
  deliver?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
