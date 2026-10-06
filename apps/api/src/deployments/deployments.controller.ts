import { Controller, Get, Param, Query } from '@nestjs/common';
import { Deployment, Paginated } from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { DeploymentsService } from './deployments.service';
import { DeploymentQueryDto } from './deployments.dto';

@Controller('deployments')
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: DeploymentQueryDto,
  ): Promise<Paginated<Deployment>> {
    return this.deployments.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<Deployment> {
    return this.deployments.get(user, id);
  }
}
