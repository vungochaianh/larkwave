import { Module } from '@nestjs/common';
import { ClaudeController } from './claude.controller';
import { ClaudeService } from './claude.service';

// PrismaService (global PrismaModule) and MaicService (@Global MaicModule) are injected directly.
@Module({
  controllers: [ClaudeController],
  providers: [ClaudeService],
})
export class ClaudeModule {}
