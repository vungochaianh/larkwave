import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { PlanId, Role, UserStatus } from '@larkwave/shared';
import { PLAN_IDS } from '@larkwave/shared';
import { PaginationDto } from '../common/dto/pagination.dto';

const ROLES: Role[] = ['admin', 'user'];
const STATUSES: UserStatus[] = ['active', 'suspended'];

export class UserQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsIn(STATUSES)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}

/**
 * `POST /v1/users/:id/plan` — admin kích hoạt gói cho một người dùng, ghi đúng
 * bộ trường mà một thanh toán thành công ghi (gói + chu kỳ hạn mức tháng).
 */
export class SetUserPlanDto {
  @IsIn(PLAN_IDS as readonly string[])
  plan!: PlanId;

  /** Số tháng của chu kỳ hạn mức (mặc định 1). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;

  /** Đặt lại hạn mức đã dùng của tháng về 0 (mặc định true). */
  @IsOptional()
  @IsBoolean()
  resetQuota?: boolean;
}

/**
 * `POST /v1/users/:id/message` — người vận hành tự soạn một tin nhắn gửi cho MỘT người dùng.
 *
 * KHÔNG có trường địa chỉ người nhận. Địa chỉ luôn đọc từ CSDL theo `:id` — nhận từ đầu vào là
 * biến hệ thống thành relay gửi thư tới bất kỳ ai, chỉ cần một phiên admin bị chiếm.
 *
 * `body` là VĂN BẢN THUẦN. Máy chủ escape rồi mới đặt vào khung HTML của thư (`MailService.sendNotice`),
 * nên gõ dấu `<` trong một câu bình thường không làm vỡ thư, và HTML dán nhầm vào không thành thẻ thật.
 *
 * Giới hạn độ dài chọn theo chỗ CHẬT nhất ở cuối đường: `NotificationsService.notify` cắt tiêu đề còn
 * 200 ký tự. Thân thư được phép dài hơn (4000) vì thư không bị cắt; phần thông báo trong app bị cắt ở
 * 1000 thì kết quả trả về NÓI RA, chứ không âm thầm mất chữ.
 */
export class MessageUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  body!: string;

  @IsBoolean()
  email!: boolean;

  @IsBoolean()
  inApp!: boolean;

  /**
   * Đường dẫn NỘI BỘ để thông báo và nút trong thư trỏ tới, ví dụ `/apps`.
   *
   * Phải bắt đầu bằng `/`: một địa chỉ ngoài đặt vào đây là biến thư của Larkwave thành bệ phóng
   * tới một trang bất kỳ — đúng thứ một phiếu lừa đảo cần.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\//, { message: 'link phải là đường dẫn nội bộ, bắt đầu bằng /' })
  link?: string;
}
