import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_CONFIG } from '@larkwave/shared';
import { loadEnv } from './config/env';
import { ensureIdentity } from './common/identity';

/**
 * Canonical platform admins that must always have the admin role, regardless of
 * how they signed up (Google OAuth, etc.). The primary admin (ADMIN_EMAIL) keeps
 * its configured password; these extras have no preset password and sign in via
 * Google / "forgot password". The ADMIN_EMAILS env is merged on top.
 */
const CANONICAL_ADMIN_EMAILS = ['dbrainv.ai@gmail.com'];

/**
 * Ensure `email` is an admin. Existing accounts are PROMOTED (role → admin);
 * missing ones are created. A null password means "locked" — a random un-guessable
 * hash so password login is disabled until the user resets / uses OAuth.
 */
async function ensureAdmin(
  prisma: PrismaClient,
  email: string,
  password: string | null,
): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
      console.log(`[seed] promoted ${email} → admin`);
    } else {
      console.log(`[seed] admin ${email} already exists`);
    }
    return;
  }
  const pwd = password ?? randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(pwd, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: 'Administrator',
      role: 'admin',
      status: 'active',
    },
  });
  console.log(
    `[seed] created admin ${email}${password ? '' : ' (no password — use Google / reset)'}`,
  );
}

/**
 * Idempotent seed: ensures the admin users (ADMIN_EMAIL + ADMIN_EMAILS +
 * canonical list) and the default platform config exist. Safe to run every deploy.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const prisma = new PrismaClient();
  try {
    const primary = env.ADMIN_EMAIL.toLowerCase();

    // 1. Primary admin — created WITH the configured password if missing.
    await ensureAdmin(prisma, primary, env.ADMIN_PASSWORD);

    // 2. Additional admins — promoted/created without a known password.
    const extras = new Set(
      [...CANONICAL_ADMIN_EMAILS, ...env.ADMIN_EMAILS.split(',')]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
        .filter((e) => e !== primary),
    );
    for (const email of extras) {
      await ensureAdmin(prisma, email, null);
    }

    await prisma.setting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', config: DEFAULT_CONFIG as unknown as object },
      update: {},
    });
    console.log('[seed] platform config ready');

    // Backfill handle + referral code for existing users (new users get them at register).
    const missing = await prisma.user.findMany({
      where: { OR: [{ handle: null }, { referralCode: null }] },
      select: { id: true },
    });
    for (const u of missing) await ensureIdentity(prisma, u.id);
    if (missing.length) console.log(`[seed] backfilled identity for ${missing.length} user(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
