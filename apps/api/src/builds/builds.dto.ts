import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { Blueprint, BuildPreset, BuildStatus, ModelChoice, SiteSurface, Track } from '@larkwave/shared';
import { BUILD_PRESETS, MODEL_CHOICES, SITE_SURFACES } from '@larkwave/shared';
import { PaginationDto } from '../common/dto/pagination.dto';

/**
 * One manually-edited project file. MUST be a validated nested class — without it
 * the global ValidationPipe (whitelist:true) strips path/content from the plain
 * objects, leaving empty `[]` entries (which then crash the build prep).
 */
export class BuildFileDto {
  @IsString()
  path!: string;

  @IsString()
  content!: string;
}

/** Concrete app features chosen in the composer (validated nested object). */
export class FeatureSpecDto {
  @IsOptional()
  @IsIn(['both', 'light', 'dark'])
  theme?: 'both' | 'light' | 'dark';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages?: string[];

  @IsOptional() @IsBoolean() blog?: boolean;
  @IsOptional() @IsBoolean() faq?: boolean;
  @IsOptional() @IsBoolean() testimonials?: boolean;
  @IsOptional() @IsBoolean() gallery?: boolean;
  @IsOptional() @IsBoolean() payments?: boolean;
  @IsOptional() @IsBoolean() reviews?: boolean;
  @IsOptional() @IsBoolean() booking?: boolean;
  @IsOptional() @IsBoolean() search?: boolean;
  @IsOptional() @IsBoolean() contactForm?: boolean;
  @IsOptional() @IsBoolean() newsletter?: boolean;
  @IsOptional() @IsBoolean() chat?: boolean;
  @IsOptional() @IsBoolean() socialShare?: boolean;
  @IsOptional() @IsBoolean() auth?: boolean;
  @IsOptional() @IsBoolean() analytics?: boolean;
  @IsOptional() @IsBoolean() notifications?: boolean;
  @IsOptional() @IsBoolean() cookieConsent?: boolean;
}

/**
 * Danh sách này TỪNG bỏ sót 'desktop' và 'game', trong khi apps.dto.ts (APP_TRACKS) cho phép cả
 * năm và giao diện tạo app vẫn hiện đủ năm lựa chọn. Hậu quả: người dùng chọn "App desktop" hoặc
 * "Game", tạo được bản ghi app, rồi bấm dựng thì bị chặn ngay ở tầng kiểm tra dữ liệu — một tính
 * năng được quảng cáo nhưng không bao giờ chạy.
 *
 * Codegen đã có sẵn scaffold cho cả hai (DESKTOP_SYSTEM / GAME_SYSTEM trong codegen.service.ts),
 * nên chỗ thiếu đúng là ở đây. Kiểu `Track` được khai ở packages/shared: khi thêm track mới, nhớ
 * cả ba nơi — kiểu chung, APP_TRACKS, và danh sách này.
 */
const TRACK_VALUES: Track[] = ['web', 'mobile', 'extension', 'desktop', 'game'];
const STATUS_VALUES: BuildStatus[] = [
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'failed',
  'canceled',
];
const MODEL_VALUES = MODEL_CHOICES as readonly ModelChoice[];
const PRESET_VALUES = BUILD_PRESETS as readonly BuildPreset[];

export class CreateBuildDto {
  @IsString()
  @MinLength(3, { message: 'Mô tả quá ngắn' })
  @MaxLength(4000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(TRACK_VALUES)
  track?: Track;

  /** Iterate an existing app instead of creating a new one. */
  @IsOptional()
  @IsString()
  appId?: string;

  /**
   * Force the app's backend kind (overrides the AI's static/fullstack guess):
   * 'fullstack' = real DB (D1) + API (Pages Functions). On an existing app this
   * UPGRADES it. Only meaningful for web apps.
   */
  @IsOptional()
  @IsIn(['static', 'fullstack'])
  backend?: 'static' | 'fullstack';

  /** Request an admin/CMS area (implies full-stack). On an existing app, upgrades it. */
  @IsOptional()
  @IsBoolean()
  cms?: boolean;

  /** Ids of uploaded files (images/text) to attach as context for this build. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  attachmentIds?: string[];

  /**
   * Per-build model choice. 'opus' (5 credits) is smarter; 'sonnet' (1 credit)
   * is cheaper. Defaults to 'opus' when omitted.
   */
  @IsOptional()
  @IsIn(MODEL_VALUES)
  model?: ModelChoice;

  /** Concrete features to build in from the start (dark mode, languages, blog…). */
  @IsOptional()
  @ValidateNested()
  @Type(() => FeatureSpecDto)
  features?: FeatureSpecDto;

  /**
   * Brand/primary color the generated app should use as its main accent.
   * Accepts `#rrggbb` or `rrggbb`; normalized to a lowercase `#rrggbb`.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const v = value.trim().replace(/^#/, '').toLowerCase();
    return v ? `#${v}` : undefined;
  })
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/, { message: 'primaryColor phải là mã hex #rrggbb' })
  primaryColor?: string;

  /**
   * Layout/canvas hint (e.g. 'dashboard'|'landing'|'form'|'store'|'minimal'|
   * 'auto'). Free-form, max 24 chars; trimmed + lowercased.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(24)
  style?: string;

  /**
   * Public website URL to CLONE. When set, the pipeline fetches the page and
   * feeds its layout/sections/copy/colours/images to codegen as a faithful
   * "rebuild this site" reference. http/https only; SSRF-guarded at fetch time.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\/.+/i, { message: 'sourceUrl phải là URL http(s) hợp lệ' })
  sourceUrl?: string;

  /**
   * Manually-edited project files. When present, the pipeline skips
   * classify/spec/codegen and builds + deploys these files directly (requires appId).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => BuildFileDto)
  files?: BuildFileDto[];

  /**
   * Quy trình build: 'turbo' bỏ qua phân loại/thiết kế/đặc tả và sinh code thẳng
   * từ yêu cầu (nhanh nhất), 'balanced' chạy đủ quy trình và tự duyệt thiết kế
   * (mặc định — y hệt hiện nay), 'thorough' dừng lại ở cổng duyệt thiết kế.
   * Bỏ trống ⇒ 'balanced', trừ khi có `sourceUrl` thì mặc định là 'turbo'
   * (bước thiết kế tự bịa ra giao diện mới, đi ngược mục tiêu sao chép).
   */
  @IsOptional()
  @IsIn(PRESET_VALUES)
  preset?: BuildPreset;

  /**
   * When the design stage runs, auto-approve the generated Blueprint and
   * continue immediately (default true). Set false to pause at the gate for
   * manual review/approval (only honoured on a new app's first design).
   * `preset: 'thorough'` forces this to false.
   */
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  /**
   * "Bộ site": tách hệ thống thành nhiều site độc lập, mỗi mặt một site + một lượt build riêng
   * (xem `builds/suite.ts`). Dưới 2 mặt thì bỏ qua — đó là app đơn như bình thường.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(SITE_SURFACES as unknown as string[], { each: true })
  surfaces?: SiteSurface[];

  /**
   * Tên dự án người dùng gõ ("truanayangi"). Là NGUỒN TÊN ĐÚNG NHẤT — đúng hơn hẳn tên suy ra
   * từ prompt hay từ tên miền nguồn, vì nó là thứ người ta tự chọn. Dùng cho tên app và cho
   * workspace "<tên>-workspace".
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  projectName?: string;
}

/** Body for `PATCH /builds/:id/blueprint` — the edited Blueprint payload. */
export class UpdateBlueprintDto {
  @IsObject()
  blueprint!: Blueprint;
}

export class BuildQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: BuildStatus;

  @IsOptional()
  @IsString()
  appId?: string;

  /** ADMIN-ONLY: scope the list to one user's builds (ignored for non-admins). */
  @IsOptional()
  @IsString()
  ownerId?: string;
}
