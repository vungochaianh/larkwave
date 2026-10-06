/**
 * Process-level Lark credential store.
 *
 * Shared between /api/lark/config-sync (writes) and any other server
 * route that needs access to the stored Lark credentials.
 *
 * Lives in a lib file (not a route file) so Next.js does not complain
 * about non-handler exports from route modules.
 */

export const larkConfigStore: Record<string, string> = {}
