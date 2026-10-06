import { Module } from '@nestjs/common';
import { LarkGrantService } from './lark-grant.service';
import { LarkGrantController } from './lark-grant.controller';
import { LarkConvService } from './lark-conv.service';
import { LarkConvController } from './lark-conv.controller';

@Module({
  // Hội thoại dùng chung nằm CÙNG module với grant có chủ ý: nó không có chính sách riêng, nó
  // mượn nguyên chính sách của grant. Tách ra module khác là mời người sau nghĩ nó độc lập.
  controllers: [LarkGrantController, LarkConvController],
  providers: [LarkGrantService, LarkConvService],
})
export class LarkGrantModule {}
