import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogEntry, Paginated } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AuditService } from './audit.service';

@Roles('admin')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@Query() q: PaginationDto): Promise<Paginated<AuditLogEntry>> {
    const { items, total } = await this.audit.list(q.skip, q.pageSize);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}
