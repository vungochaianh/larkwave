/**
 * One-off: reclaim the hoanam team accounts down to a single account.
 * - KEEP hoanam01 as the sole account and give it UNLIMITED devices (deviceLimit = 0).
 * - PERMANENTLY DELETE hoanam02..hoanam10 (cascades remove their apps/sessions/etc.).
 *
 * Run on the server (where DATABASE_URL + the generated Prisma client live):
 *   cd /home/app/toolswave && set -a && . ./.env && set +a \
 *     && node apps/api/scripts/reclaim-hoanam.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const KEEP = 'hoanam01@toolswave.net';
const DELETE = Array.from({ length: 9 }, (_, i) => `hoanam${String(i + 2).padStart(2, '0')}@toolswave.net`);

async function main() {
  // 1) Keep hoanam01 + lift its device cap (0 = unlimited).
  const keep = await prisma.user
    .update({ where: { email: KEEP }, data: { deviceLimit: 0 } })
    .catch((e) => {
      console.error('KEEP update failed:', e.message);
      return null;
    });
  console.log('KEEP', KEEP, keep ? `deviceLimit=${keep.deviceLimit} (0 = unlimited)` : 'NOT FOUND');

  // 2) Permanently delete the other nine.
  for (const email of DELETE) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) {
      console.log('skip (absent):', email);
      continue;
    }
    // Revoke sessions first (defensive), then delete — FK cascades handle the rest.
    await prisma.loginSession.updateMany({ where: { userId: u.id }, data: { revokedAt: new Date() } }).catch(() => {});
    try {
      await prisma.user.delete({ where: { email } });
      console.log('DELETED', email);
    } catch (e) {
      console.error('DELETE FAILED', email, e.message);
    }
  }

  // 3) Show the final state.
  const remaining = await prisma.user.findMany({
    where: { email: { startsWith: 'hoanam' } },
    select: { email: true, deviceLimit: true, status: true },
  });
  console.log('REMAINING hoanam*:', JSON.stringify(remaining));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
