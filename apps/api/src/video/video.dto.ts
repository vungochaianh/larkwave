import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PALETTE_IDS } from '../media/palettes';
import { CHARACTER_IDS } from '../media/characters';

export class CreateVideoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  topic!: string;

  @IsOptional()
  @IsIn(['game', 'pixel', 'draw'])
  template?: string;

  @IsOptional()
  @IsIn(['9:16', '16:9'])
  aspect?: string;

  @IsOptional()
  @IsIn(PALETTE_IDS)
  palette?: string;

  @IsOptional()
  @IsIn(CHARACTER_IDS)
  character?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class RefineDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;
}
