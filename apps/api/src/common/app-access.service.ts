import { Injectable } from '@nestjs/common';
import type { AppRole } from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user';

/**
 * Single source of truth for app-level authorization across modules. Resolves a
 * user's role on an app considering ownership, admin, and collaboration members.
 */
@Injectable()
export class AppAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** 'owner' | 'editor' | 'viewer' | null. Admins are treated as owner. */
  async roleOf(user: AuthUser, appId: string): Promise<AppRole | null> {
    if (user.role === 'admin') return 'owner';
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { ownerId: true },
    });
    if (!app) return null;
    if (app.ownerId === user.id) return 'owner';
    const member = await this.prisma.appMember.findUnique({
      where: { appId_userId: { appId, userId: user.id } },
      select: { role: true },
    });
    return member ? (member.role as AppRole) : null;
  }

  /** Any access (owner/editor/viewer). */
  async canRead(user: AuthUser, appId: string): Promise<boolean> {
    return (await this.roleOf(user, appId)) !== null;
  }

  /** Owner or editor (can build/iterate). */
  async canWrite(user: AuthUser, appId: string): Promise<boolean> {
    const role = await this.roleOf(user, appId);
    return role === 'owner' || role === 'editor';
  }
}
