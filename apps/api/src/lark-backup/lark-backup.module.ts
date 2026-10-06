import { Module } from '@nestjs/common';
import { LarkBackupService } from './lark-backup.service';
import { LarkBackupController } from './lark-backup.controller';

@Module({
  controllers: [LarkBackupController],
  providers: [LarkBackupService],
})
export class LarkBackupModule {}
