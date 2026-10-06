import { randomBytes } from 'node:crypto';
import { slugify } from '@larkwave/shared';
import type { PrismaClient } from '@prisma/client';

/** New referred user gets this many bonus credits at signup. */
export const SIGNUP_REF_BONUS = 5;
/** Referrer gets this when the referred user's FIRST paid plan settles (anti-abuse). */
export const REFERRER_BONUS = 5;

async function uniqueHandle(
  prisma: PrismaClient,
  name?: string | null,
  email?: string | null,
): Promise<string> {
  const base =
    (slugify((name ?? '').trim()) || slugify((email ?? '').split('@')[0]) || 'user').slice(0, 24) ||
    'user';
  for (let i = 0; i < 6; i += 1) {
    const h = i === 0 ? base : `${base}${randomBytes(2).toString('hex')}`;
    const ex = await prisma.user.findFirst({ where: { handle: h }, select: { id: true } });
    if (!ex) return h;
  }
  return `${base}-${randomBytes(3).toString('hex')}`;
}

async function uniqueCode(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 6; i += 1) {
    const c = randomBytes(4).toString('hex');
    const ex = await prisma.user.findFirst({ where: { referralCode: c }, select: { id: true } });
    if (!ex) return c;
  }
  return randomBytes(6).toString('hex');
}

/** Ensure a user has a unique public handle + referral code. Idempotent (no-op if set). */
export async function ensureIdentity(prisma: PrismaClient, userId: string): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { handle: true, referralCode: true, name: true, email: true },
  });
  if (!u) return;
  const data: { handle?: string; referralCode?: string } = {};
  if (!u.handle) data.handle = await uniqueHandle(prisma, u.name, u.email);
  if (!u.referralCode) data.referralCode = await uniqueCode(prisma);
  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id: userId }, data }).catch(() => undefined);
  }
}

/**
 * Resolve a `ref` token (a referralCode OR a userId)
 * to the referrer's user id. Returns null for unknown / self-refer.
 */
export async function resolveReferrer(
  prisma: PrismaClient,
  ref: string | null | undefined,
  newUserId: string,
): Promise<string | null> {
  const token = (ref ?? '').trim();
  if (!token) return null;
  const r = await prisma.user.findFirst({
    where: { OR: [{ referralCode: token }, { id: token }] },
    select: { id: true },
  });
  if (!r || r.id === newUserId) return null;
  return r.id;
}

/**
 * Apply a referral at signup: link the new user to the referrer and grant the new
 * user a starter bonus. The referrer's reward is deferred to the new user's first
 * paid plan (see `rewardReferrerOnce`, called from PaymentsService.settle). Best-effort.
 */
export async function applySignupReferral(
  prisma: PrismaClient,
  newUserId: string,
  ref: string | null | undefined,
): Promise<void> {
  const referrerId = await resolveReferrer(prisma, ref, newUserId);
  if (!referrerId) return;
  await prisma.user
    .update({
      where: { id: newUserId },
      data: { referredById: referrerId, bonusCredits: { increment: SIGNUP_REF_BONUS } },
    })
    .catch(() => undefined);
}

/**
 * Referral reward: when a REFERRED user's first paid plan settles, grant the referrer
 * bonus credits — once (an atomic flag claim prevents a double grant). Returns the
 * referrer id when a reward was granted (so the caller can notify), else null.
 * Best-effort; never throws.
 */
export async function rewardReferrerOnce(
  prisma: PrismaClient,
  userId: string,
): Promise<string | null> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredById: true, referralRewarded: true },
    });
    if (!u?.referredById || u.referralRewarded) return null;
    const claim = await prisma.user.updateMany({
      where: { id: userId, referralRewarded: false },
      data: { referralRewarded: true },
    });
    if (claim.count !== 1) return null; // someone else already claimed
    await prisma.user.update({
      where: { id: u.referredById },
      data: { bonusCredits: { increment: REFERRER_BONUS } },
    });
    return u.referredById;
  } catch {
    return null;
  }
}
