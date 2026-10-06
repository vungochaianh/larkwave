import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LarkHostedService } from './lark-hosted.service';
import { LarkHostedController } from './lark-hosted.controller';

@Module({
  // AuthModule: cần AuthService để ký token ngắn hạn cho tiến trình runner.
  imports: [AuthModule],
  controllers: [LarkHostedController],
  providers: [LarkHostedService],
})
export class LarkHostedModule {}
