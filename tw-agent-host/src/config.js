/**
 * config.js — env for the shared "Trợ lý AI" host.
 *
 * This service runs 24/7 on a VM that has the ADMIN's Claude CLI logged in. It polls the
 * Larkwave backend for shared-assistant turns that granted users submitted, runs each one
 * through the admin's `claude -p` (a SAFE, read-only flag set — no shell/file access), and
 * reports the answer back. So granted users use the assistant freely, billed to the admin's
 * Claude subscription, with NOTHING running on the users' machines and no per-user token cost.
 */
export const config = {
  // Backend base (includes the /v1 prefix). Same host the desktop app talks to.
  apiBase: (process.env.TW_API_BASE || 'https://api.toolswave.net/v1').replace(/\/+$/, ''),

  // How the host authenticates AS THE ADMIN (grant owner). Either a long-lived token OR
  // email+password (the host logs in and refreshes the token when it expires).
  adminToken: process.env.TW_ADMIN_TOKEN || '',
  adminEmail: process.env.TW_ADMIN_EMAIL || '',
  adminPassword: process.env.TW_ADMIN_PASSWORD || '',

  pollIntervalSec: Number(process.env.TW_POLL_INTERVAL_SEC || 5),
  batchPerTick: Number(process.env.TW_BATCH || 3),

  // The admin's Claude CLI (must be on PATH / logged in on this VM).
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  model: process.env.TW_MODEL || '', // optional --model override
  turnTimeoutSec: Number(process.env.TW_TURN_TIMEOUT_SEC || 120),
  maxOutputChars: Number(process.env.TW_MAX_OUTPUT || 200000),
};

if (!config.adminToken && !(config.adminEmail && config.adminPassword)) {
  // Fail loud on boot rather than silently never serving anything.
  console.error('[tw-agent-host] Thiếu cấu hình đăng nhập admin: đặt TW_ADMIN_TOKEN hoặc TW_ADMIN_EMAIL + TW_ADMIN_PASSWORD.');
  process.exit(1);
}
