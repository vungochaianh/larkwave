import { Injectable } from '@nestjs/common';
import { DEFAULT_CONFIG, PlatformConfig } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reads/writes the single `Setting` row holding the editable platform config
 * (billing overrides). Seeds DEFAULT_CONFIG on first access.
 */
@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<PlatformConfig> {
    const row = await this.prisma.setting.findUnique({ where: { id: 'singleton' } });
    if (!row) {
      const created = await this.prisma.setting.create({
        data: { id: 'singleton', config: DEFAULT_CONFIG as unknown as object },
      });
      return this.withDefaults(created.config as unknown as PlatformConfig);
    }
    return this.withDefaults(row.config as unknown as PlatformConfig);
  }

  /** Fill gaps from DEFAULT_CONFIG (stored values win). */
  private withDefaults(stored: PlatformConfig): PlatformConfig {
    if (!stored || typeof stored !== 'object') return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...stored };
  }

  async update(config: PlatformConfig): Promise<PlatformConfig> {
    const row = await this.prisma.setting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', config: config as unknown as object },
      update: { config: config as unknown as object },
    });
    return row.config as unknown as PlatformConfig;
  }
}
