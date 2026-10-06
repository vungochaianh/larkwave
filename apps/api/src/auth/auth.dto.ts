import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'Mã xác thực gồm 6 chữ số' })
  @Matches(/^\d{6}$/, { message: 'Mã xác thực gồm 6 chữ số' })
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  @MaxLength(128)
  password!: string;
}

/**
 * Đầu vào của `POST /auth/service/link` — một hệ NGOÀI xin token thay mặt người dùng của nó.
 *
 * `email` và `name` chỉ để HIỂN THỊ. Khoá liên kết là `provider` + `externalId`; dùng email làm
 * khoá là mở đường chiếm tài khoản (xem `AuthService.linkServiceAccount`).
 */
export class ServiceLinkDto {
  /** Hệ gọi vào, vd `fbinbox`. Chỉ chữ thường, số, `-`, `_`. */
  @IsString()
  @Matches(/^[a-z0-9_-]{2,32}$/, { message: 'provider chỉ gồm chữ thường, số, - và _' })
  provider!: string;

  /** Id người dùng BÊN HỆ ĐÓ. Ổn định, không đổi khi họ đổi email. */
  @IsString()
  @MaxLength(128)
  externalId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}
