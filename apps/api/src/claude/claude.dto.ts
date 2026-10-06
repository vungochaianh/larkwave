import { IsIn, IsOptional } from 'class-validator';
import { REPORT_PERIODS, type ReportPeriod } from '@larkwave/shared';

export class ClaudeQueryDto {
  @IsOptional()
  @IsIn(REPORT_PERIODS as unknown as string[])
  period: ReportPeriod = 'all';
}
