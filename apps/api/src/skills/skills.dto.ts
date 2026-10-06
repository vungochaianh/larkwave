import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Runner ids a skill can be scoped to. Mirrors the desktop RUNNER_CATALOG. */
export const RUNNER_IDS = ['claude', 'grok', 'gemini', 'codex'] as const;

/** A reference file attached to a skill (like a Claude Skills bundle file). Text content only. */
export class SkillAttachmentDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(50000)
  content!: string;
}

/** Shape returned to the web — matches @larkwave/core `SkillInfo`. */
export interface SkillInfoDto {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scope: string[];
  tags: string[];
  /** Slash-command shortcut WITHOUT the leading "/" ('' = none) — the composer's "/" menu. */
  command: string;
  attachmentCount: number;
}

export class CreateSkillDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  /** Slash-command shortcut, without the leading "/". Sanitized + de-duplicated server-side. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  command?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(20000)
  instructions!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scope?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SkillAttachmentDto)
  attachments?: SkillAttachmentDto[];
}

/** "Create with Claude" (AI-draft): a short idea → the hosted assistant drafts a skill. */
export class DraftSkillDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  prompt!: string;
}

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  /** Slash-command shortcut, without the leading "/". '' clears it. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  command?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  instructions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scope?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SkillAttachmentDto)
  attachments?: SkillAttachmentDto[];
}
