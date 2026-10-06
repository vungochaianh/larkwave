import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminMessageUserResult, ImpersonateResponse, Paginated, User } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { UsersService } from './users.service';
import { CreateUserDto, MessageUserDto, SetUserPlanDto, UpdateUserDto, UserQueryDto } from './users.dto';

@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: UserQueryDto): Promise<Paginated<User>> {
    return this.users.list(query);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto): Promise<User> {
    return this.users.create(actor, dto);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<User> {
    return this.users.get(id);
  }

  /** Admin support drill-down summary (counts). Opening it is audited ('admin viewed user'). */
  @Get(':id/support-summary')
  supportSummary(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.users.supportSummary(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.users.update(actor, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() actor: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.users.remove(actor, id);
  }

  /** Mint a session token to impersonate this user (admin diagnostics). Audited. */
  @Post(':id/impersonate')
  impersonate(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
  ): Promise<ImpersonateResponse> {
    return this.users.impersonate(actor, id);
  }

  /** Kích hoạt gói cho người dùng + mở chu kỳ hạn mức mới. Audited. */
  @Post(':id/plan')
  setPlan(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetUserPlanDto,
  ): Promise<User> {
    return this.users.setPlan(actor, id, dto);
  }

  /**
   * Nhắn cho một người dùng: thư và/hoặc thông báo trong app, do người vận hành tự soạn.
   *
   * Địa chỉ người nhận KHÔNG nằm trong thân yêu cầu — nó được đọc từ CSDL theo `:id`.
   * Có ghi nhật ký kiểm toán, kèm nguyên văn nội dung đã nói với họ.
   */
  @Post(':id/message')
  message(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: MessageUserDto,
  ): Promise<AdminMessageUserResult> {
    return this.users.messageUser(actor, id, dto);
  }
}
