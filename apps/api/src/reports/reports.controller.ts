import { Controller, Get, Query } from '@nestjs/common';
import type { AdminReport } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './reports.dto';

/** Admin profit / cost / revenue dashboard. */
@Roles('admin')
@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  report(@Query() q: ReportQueryDto): Promise<AdminReport> {
    return this.reports.report(q.period);
  }
}
