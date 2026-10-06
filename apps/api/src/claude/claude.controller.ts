import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import type { ClaudeDataOverview, ClaudeReport, ClaudeUserData } from '@larkwave/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { ClaudeService } from './claude.service';
import { ClaudeQueryDto } from './claude.dto';

/** Admin-only hosted-Claude (MAIC) usage/health report + per-account data management. */
@Roles('admin')
@Controller('admin/claude')
export class ClaudeController {
  constructor(private readonly claude: ClaudeService) {}

  @Get()
  report(@Query() q: ClaudeQueryDto): Promise<ClaudeReport> {
    return this.claude.report(q.period);
  }

  /** Platform-wide Claude data volume + top accounts. */
  @Get('data')
  data(): Promise<ClaudeDataOverview> {
    return this.claude.dataOverview();
  }

  /** One account's conversations + projects. */
  @Get('users/:id')
  userData(@Param('id') id: string): Promise<ClaudeUserData> {
    return this.claude.userData(id);
  }

  /** Delete a conversation (data management). */
  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string): Promise<{ ok: boolean }> {
    return this.claude.deleteConversation(id);
  }
}
