import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SendRequestDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: 'Tin nhắn trống' })
  @MaxLength(4000)
  body!: string;
}
