import { Global, Module } from '@nestjs/common';
import { AppAccessService } from './app-access.service';

/** Global so any module (apps, builds, …) can inject AppAccessService. */
@Global()
@Module({
  providers: [AppAccessService],
  exports: [AppAccessService],
})
export class AppAccessModule {}
