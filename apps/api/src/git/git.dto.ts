import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { GitProvider } from '../engine/git-providers.service';

const PROVIDERS: GitProvider[] = ['gitlab', 'github'];

/** `GET /v1/me/git/:provider/repos?q=&page=` — repo search query (paged). */
export class RepoQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

/** `POST /v1/apps/:id/services/build` — build one sub-project of an imported repo. */
export class BuildServiceDto {
  /** Sub-project directory prefix ('' = repo root). */
  @IsString()
  @MaxLength(300)
  path!: string;
}

/** `POST /v1/me/git/import` — import a connected repo as a Larkwave app. */
export class ImportRepoDto {
  @IsIn(PROVIDERS)
  provider!: GitProvider;

  /** Full repo path, e.g. 'user/repo'. */
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  repo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  branch?: string;
}

/** `POST /v1/apps/:id/git/push` — commit the app's current files back. */
export class GitPushDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
