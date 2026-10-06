import { Module } from '@nestjs/common';
import { LarkShareService } from './lark-share.service';
import { LarkShareController, PublicLarkShareController } from './lark-share.controller';

@Module({
  controllers: [LarkShareController, PublicLarkShareController],
  providers: [LarkShareService],
})
export class LarkShareModule {}
