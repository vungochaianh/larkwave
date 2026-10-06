import { Global, Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

/**
 * Content categories (danh mục). @Global so MarketingDeliveryService (DeliveryModule) can resolve a
 * category's channels without an import cycle.
 */
@Global()
@Module({
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
