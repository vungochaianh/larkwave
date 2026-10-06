import { Role } from '@larkwave/shared';

/** Shape attached to `req.user` after JWT verification. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** Set only on impersonation tokens: the admin id acting AS this user (traceability). */
  impersonatorId?: string;
  /** Current login-session (device) id — present on device-tracked tokens. */
  sid?: string;
}
