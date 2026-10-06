import { IsIn, IsOptional } from 'class-validator';
import type { ReportPeriod } from '@larkwave/shared';
import { REPORT_PERIODS } from '@larkwave/shared';

/** Query for `GET /v1/admin/reports?period=all|30d|7d|today`. */
export class ReportQueryDto {
  @IsOptional()
  @IsIn(REPORT_PERIODS as unknown as string[])
  period: ReportPeriod = 'all';
}
