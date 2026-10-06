import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ARTIFACT_KINDS = ['html', 'markdown', 'code', 'svg'] as const;
export const ARTIFACT_VISIBILITY = ['private', 'public'] as const;

export interface ArtifactDto {
  id: string;
  title: string;
  kind: string;
  language: string;
  content: string;
  visibility: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

/** Public view (by slug, no auth) — no owner id. */
export interface PublicArtifactDto {
  title: string;
  kind: string;
  language: string;
  content: string;
  updatedAt: string;
}

export class CreateArtifactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsIn(ARTIFACT_KINDS as readonly string[])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsString()
  @MaxLength(400000)
  content!: string;

  @IsOptional()
  @IsIn(ARTIFACT_VISIBILITY as readonly string[])
  visibility?: string;
}

export class UpdateArtifactDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsIn(ARTIFACT_KINDS as readonly string[])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400000)
  content?: string;

  @IsOptional()
  @IsIn(ARTIFACT_VISIBILITY as readonly string[])
  visibility?: string;
}
