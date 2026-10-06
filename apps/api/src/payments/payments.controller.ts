import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import type { CreatePaymentResponse, Payment } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './payments.dto';
import type { SepayWebhookBody } from './payments.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Open a pending bank-transfer payment and return VietQR + bank details. */
  @Post('create')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentDto,
  ): Promise<CreatePaymentResponse> {
    return this.payments.create(user, dto);
  }

  /** Mua thêm dung lượng (1 GB / đơn vị, tính theo tháng). Áp dụng cho mọi gói kể cả Miễn phí. */
  @Post('storage')
  createStorage(@CurrentUser() user: AuthUser, @Body() body: { units?: number }) {
    return this.payments.createStorageOrder(user, Number(body?.units) || 1);
  }

  /**
   * SePay bank-transfer webhook. PUBLIC (no JWT). Trust is the `Apikey` header:
   * `Authorization: Apikey <SEPAY_WEBHOOK_APIKEY>`.
   */
  @Public()
  @Post('sepay/webhook')
  @HttpCode(200)
  sepayWebhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() body: SepayWebhookBody,
  ): Promise<{ ok: boolean; matched?: boolean }> {
    return this.payments.sepayWebhook(authHeader, body);
  }

  /** Poll a single payment (owner-or-admin). */
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Payment> {
    return this.payments.get(user, id);
  }
}
