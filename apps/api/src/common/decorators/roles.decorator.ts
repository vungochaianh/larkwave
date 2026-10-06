import { SetMetadata } from '@nestjs/common';
import { Role } from '@larkwave/shared';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles (combined with RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
