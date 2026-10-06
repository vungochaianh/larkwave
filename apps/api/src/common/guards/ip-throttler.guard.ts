import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limit key = the REAL client IP.
 *
 * Why this class has to exist: the default tracker is `req.ip`, and Express is behind
 * cloudflared → nginx, both on loopback. Without `trust proxy` (and even with it, XFF is
 * appended to by every hop) `req.ip` is `127.0.0.1` for every request on the planet, so the
 * global limiter collapsed into ONE shared bucket: no protection against an abuser, and a
 * self-DoS for everyone else once that single bucket filled.
 *
 * `CF-Connecting-IP` is the right source here — Cloudflare SETS it and OVERWRITES anything the
 * client sent, so it cannot be spoofed as long as traffic arrives through the tunnel. We fall
 * back to the left-most X-Forwarded-For hop and then to `req.ip`, so direct LAN/tailnet access
 * and local development still key on something sane instead of throwing.
 *
 * NOTE the fallback is spoofable by a client that reaches the origin WITHOUT passing Cloudflare.
 * That is acceptable for a rate limiter (worst case an attacker who can already bypass the edge
 * also evades throttling) but it is NOT an authorization signal — never use it as one.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as unknown as Request;
    const cf = r.headers?.['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();

    const xff = r.headers?.['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;

    return r.ip || 'unknown';
  }
}
