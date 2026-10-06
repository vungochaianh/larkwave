import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { canCall, normalizeRoute } from '../../api-keys/api-scopes';

/**
 * Cửa của Developer API (`/v1/pub/*`): đòi `Authorization: Bearer tw_...`, đối chiếu với kho key,
 * rồi gắn chủ key vào `req.user` (cùng hình dạng với guard JWT).
 *
 * Guard này làm BA việc, và thứ tự quan trọng:
 *   1. Key có thật và chưa thu hồi không.
 *   2. Key có QUYỀN gọi tuyến này không (`scopes`).
 *   3. Key còn HẠN MỨC tháng không (`monthlyLimit`).
 *
 * Kiểm hạn mức SAU phạm vi có chủ ý: một lượt gọi bị từ chối vì thiếu quyền thì không nên bị tính
 * vào hạn mức — nếu không, một chương trình cấu hình sai sẽ đốt sạch hạn mức tháng bằng những lượt
 * gọi chưa bao giờ được phép chạy.
 *
 * Ghi sổ nằm ở `res.on('finish')` chứ không ghi ngay: chỉ ở đó mới biết MÃ TRẠNG THÁI thật và thời
 * gian xử lý. Ghi trước thì mọi dòng trong sổ đều là "200", kể cả những lượt đã nổ.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request & { user?: unknown }>();
    const res = http.getResponse<Response>();

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Thiếu API key — gửi header "Authorization: Bearer tw_..."');
    }
    const raw = header.slice('Bearer '.length).trim();
    const found = await this.apiKeys.verify(raw);
    if (!found) throw new UnauthorizedException('API key không hợp lệ hoặc đã bị thu hồi');

    const routeKey = normalizeRoute(req.method, (req.originalUrl || req.url || '').replace(/^\/v1/, ''));

    if (!canCall(found.scopes, routeKey)) {
      throw new ForbiddenException(
        `API key này không có quyền gọi ${routeKey}. Sửa phạm vi của key ở trang Developer API.`,
      );
    }

    const over = await this.apiKeys.overMonthlyLimit(found.keyId);
    if (over) {
      throw new ForbiddenException(
        `API key đã dùng hết hạn mức ${over.limit} lượt trong tháng này (đã gọi ${over.used}). ` +
          'Nâng hạn mức của key, hoặc chờ sang tháng.',
      );
    }

    req.user = found.user;

    // Ghi một dòng vào sổ khi phản hồi đã gửi xong. `once` chứ không `on`: một phản hồi có thể bắn
    // 'finish' nhiều lần trong vài trường hợp (stream bị huỷ), và khi đó sổ sẽ đếm dư.
    const startedAt = Date.now();
    res.once('finish', () => {
      void this.apiKeys.logCall(found.keyId, routeKey, res.statusCode, Date.now() - startedAt);
    });
    return true;
  }
}
