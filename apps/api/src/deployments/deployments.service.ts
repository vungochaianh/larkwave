import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Deployment, Paginated } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { toDeployment } from '../common/mappers';
import { DeploymentQueryDto } from './deployments.dto';

@Injectable()
export class DeploymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, q: DeploymentQueryDto): Promise<Paginated<Deployment>> {
    const where = {
      ...(user.role === 'admin' ? {} : { app: { ownerId: user.id } }),
      ...(q.appId ? { appId: q.appId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.deployment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.pageSize,
      }),
      this.prisma.deployment.count({ where }),
    ]);
    return { items: items.map(toDeployment), total, page: q.page, pageSize: q.pageSize };
  }

  async get(user: AuthUser, id: string): Promise<Deployment> {
    const dep = await this.prisma.deployment.findUnique({ where: { id }, include: { app: true } });
    if (!dep) throw new NotFoundException('Không tìm thấy deployment');
    if (dep.app.ownerId !== user.id && user.role !== 'admin') {
      throw new ForbiddenException('Deployment không thuộc về bạn');
    }
    return toDeployment(dep);
  }
}
