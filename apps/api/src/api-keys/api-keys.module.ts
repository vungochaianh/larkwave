import { Module } from '@nestjs/common';
import { BuildsModule } from '../builds/builds.module';
import { AppsModule } from '../apps/apps.module';
import { MeModule } from '../me/me.module';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { PublicApiController } from './public-api.controller';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

/** Developer API: per-user API keys (management + verification) + the public /v1/pub/* endpoints. */
@Module({
  imports: [BuildsModule, AppsModule, MeModule],
  controllers: [ApiKeysController, PublicApiController],
  providers: [ApiKeysService, ApiKeyGuard],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
