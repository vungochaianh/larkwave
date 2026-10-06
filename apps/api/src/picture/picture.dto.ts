import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PALETTE_IDS } from '../media/palettes';
import { CHARACTER_IDS } from '../media/characters';

export class CreatePictureDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  topic!: string;

  @IsOptional()
  @IsIn(['quote', 'announce', 'tip', 'promo'])
  template?: string;

  @IsOptional()
  @IsIn(['1:1', '4:5', '16:9'])
  aspect?: string;

  @IsOptional()
  @IsIn(PALETTE_IDS)
  palette?: string;

  @IsOptional()
  @IsIn(CHARACTER_IDS)
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
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
