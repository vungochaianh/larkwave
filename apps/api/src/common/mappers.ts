import { AuditLog as PAuditLog, User as PUser } from '@prisma/client';
import { AuditLogEntry, User } from '@larkwave/shared';
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toUser(u: PUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    plan: u.plan,
    avatarUrl: u.avatarUrl ?? null,
    discoverable: u.discoverable,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

export function toAudit(a: PAuditLog): AuditLogEntry {
  return {
    id: a.id,
    actorId: a.actorId,
    actorEmail: a.actorEmail,
    action: a.action,
    target: a.target,
    meta: (a.meta as Record<string, unknown>) ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}
