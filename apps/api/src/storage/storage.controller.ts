import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { StorageService, type StorageCategory, type StorageItem, type StorageUsage } from './storage.service';

const CATEGORIES: StorageCategory[] = ['uploads', 'chat'];

/** Trang "Dung lượng lưu trữ" — xem đang chiếm bao nhiêu, ở đâu, và tự dọn. */
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('usage')
  usage(@CurrentUser() user: AuthUser): Promise<StorageUsage> {
    return this.storage.usage(user.id);
  }

  @Get('items')
  items(@CurrentUser() user: AuthUser, @Query('category') category: string): Promise<StorageItem[]> {
    const c = CATEGORIES.includes(category as StorageCategory) ? (category as StorageCategory) : 'uploads';
    return this.storage.items(user.id, c);
  }

  @Delete('items/:category/:id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('category') category: string,
    @Param('id') id: string,
  ): Promise<{ freedBytes: number }> {
    const c = CATEGORIES.includes(category as StorageCategory) ? (category as StorageCategory) : 'uploads';
    return this.storage.remove(user.id, c, id);
  }
}
