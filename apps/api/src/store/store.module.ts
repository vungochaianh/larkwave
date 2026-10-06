import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { AdminStoreController } from './admin-store.controller';
import { AdminStoreService } from './admin-store.service';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

/**
 * Cửa hàng — hai mặt trong cùng một module, hai lớp phục vụ TÁCH HẲN nhau:
 *
 *  - `StoreController` + `StoreService`: mặt tiền công khai (`/v1/store/*`), không cần đăng nhập.
 *  - `AdminStoreController` + `AdminStoreService`: mặt sau (`/v1/admin/store/*`), chỉ `admin`,
 *    đọc/ghi thẳng bảng `Listing` và là nơi DUY NHẤT chạm `Listing.deliveryEnc`.
 *
 * Hai service không gọi nhau. Chúng có hai luật đối lập — bên công khai phải chép ra đúng các
 * trường của `StoreListing`, bên quản trị phải đọc được cả phần nội bộ — nên dùng chung một
 * hàm nào đó giữa hai bên là cách chắc chắn nhất để một hôm nào đó trường nội bộ đi nhờ ra
 * ngoài. `PrismaService`, `AppConfigService` và `AuditService` đều là provider toàn cục (module
 * của chúng khai `@Global`), nên ở đây không phải khai lại.
 */
@Module({
  imports: [ConfigModule],
  controllers: [StoreController, AdminStoreController],
  providers: [StoreService, AdminStoreService],
  exports: [StoreService, AdminStoreService],
})
export class StoreModule {}
