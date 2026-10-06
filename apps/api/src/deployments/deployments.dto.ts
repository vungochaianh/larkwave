import { IsIn, IsOptional, IsString } from 'class-validator';
import type { DeploymentStatus } from '@larkwave/shared';
import { PaginationDto } from '../common/dto/pagination.dto';

const STATUSES: DeploymentStatus[] = ['live', 'superseded', 'failed'];

export class DeploymentQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: DeploymentStatus;
}
