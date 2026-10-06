import { Controller, Get } from '@nestjs/common';
import { HealthResponse } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

const APP_VERSION = '1.0.0';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get()
  async health(): Promise<HealthResponse> {
    let database = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }
    return {
      status: database ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptime: Math.round(process.uptime()),
      checks: {
        database,
        anthropic: Boolean(this.config.env.ANTHROPIC_API_KEY),
        maic: Boolean(this.config.env.MAIC_URL && this.config.env.MAIC_TOKEN),
      },
    };
  }
}
