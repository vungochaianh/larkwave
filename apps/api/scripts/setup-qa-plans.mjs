/**
 * Provision the QA test accounts with plans so the 24/7 QA agent can exercise plan-gated LOGIC.
 * Replicates the field set UsersService.setPlan writes (plan + FRESH credit window), so each
 * granted plan behaves exactly like a settled payment. Idempotent — safe to re-run.
 *
 * Tiers (so the agent can cover every path):
 *   qabot01 → enterprise (top tier — full features, no limit friction)
 *   qabot02 → pro        (mid paid tier)
 *   qabot03 → free       (left as free — free/trial experience + upgrade gating)
 *
 * Run on the server:
 *   cd /home/app/toolswave/apps/api && set -a && . /home/app/toolswave/.env && set +a \
 *     && node scripts/setup-qa-plans.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MONTHS = 12; // long window so QA plans don't expire mid-testing

/** Mirror of UsersService.cycleEnd (UTC + N months). */
function cycleEnd(from, months) {
  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
    ),
  );
}

const GRANTS = [
  { email: 'qabot01@toolswave.net', plan: 'enterprise' },
  { email: 'qabot02@toolswave.net', plan: 'pro' },
  // qabot03 intentionally stays 'free'
];

async function main() {
  const now = new Date();
  for (const g of GRANTS) {
    const u = await prisma.user.findUnique({ where: { email: g.email }, select: { id: true } });
    if (!u) {
      console.log('skip (absent):', g.email);
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        plan: g.plan,
        quotaUsed: 0,
        quotaResetAt: cycleEnd(now, MONTHS),
        quotaWindowAt: now,
      },
    });
    console.log(`GRANTED ${g.email} -> ${g.plan} (window ${MONTHS}mo)`);
  }
  const all = await prisma.user.findMany({
    where: { email: { startsWith: 'qabot' } },
    select: { email: true, plan: true },
    orderBy: { email: 'asc' },
  });
  console.log('QA accounts now:', JSON.stringify(all));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
