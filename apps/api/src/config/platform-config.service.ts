import { Injectable } from '@nestjs/common';
import { DEFAULT_CONFIG, PlatformConfig } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reads/writes the single `Setting` row holding the editable platform config
 * (tracks, prompt templates, limits). Seeds DEFAULT_CONFIG on first access.
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

  /**
   * Fill gaps from DEFAULT_CONFIG so a config saved BEFORE a new track/prompt was added still exposes
   * it at runtime (the stored row is not deep-merged on save). Stored values still win; defaults only
   * fill missing keys. Critical for new tracks (desktop/game) — codegen reads cfg.tracks[track].
   */
  private withDefaults(stored: PlatformConfig): PlatformConfig {
    if (!stored || typeof stored !== 'object') return DEFAULT_CONFIG;
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      tracks: { ...DEFAULT_CONFIG.tracks, ...(stored.tracks ?? {}) },
      prompts: { ...DEFAULT_CONFIG.prompts, ...(stored.prompts ?? {}) },
      limits: { ...DEFAULT_CONFIG.limits, ...(stored.limits ?? {}) },
    };
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
