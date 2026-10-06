import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { PlatformConfigService } from './platform-config.service';

@Global()
@Module({
  providers: [AppConfigService, PlatformConfigService],
  exports: [AppConfigService, PlatformConfigService],
})
export class ConfigModule {}
