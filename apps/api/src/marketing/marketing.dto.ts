import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMarketingScheduleDto {
  @IsIn(['video', 'picture', 'blog'])
  kind!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  topic!: string;

  @IsString()
  @MaxLength(120)
  cron!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  template?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  palette?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  character?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  aspect?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;

  /** blog only: tự đăng bài sinh ra lên site blog công khai. Mặc định tắt. */
  @IsOptional()
  @IsBoolean()
  publishToBlog?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateMarketingScheduleDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cron?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  template?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  palette?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  character?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  aspect?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;

  /** blog only: tự đăng bài sinh ra lên site blog công khai. Mặc định tắt. */
  @IsOptional()
  @IsBoolean()
  publishToBlog?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
