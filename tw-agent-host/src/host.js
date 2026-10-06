/**
 * host.js — the long-running loop.
 *
 * Every tick: pull the admin's queued shared-assistant turns, run each `agentchat` turn through
 * the admin's Claude CLI (SAFE flags, see claude.js), report the result. Only ONE turn runs at a
 * time (a burst of requests can't stampede the box). Non-agentchat (Lark) turns are left alone —
 * those still belong to the admin's desktop app.
 */
import { config } from './config.js';
import { login, queuedTurns, reportTurn } from './api.js';
import { runTurn } from './claude.js';

export async function runHost(log = console.log) {
  log(`tw-agent-host khởi động · api=${config.apiBase} · poll=${config.pollIntervalSec}s · claude=${config.claudeBin}`);
  if (await login()) log('✅ đăng nhập admin OK — đang phục vụ Trợ lý AI chia sẻ.');
  else log('⚠️ đăng nhập admin thất bại — sẽ thử lại ở lượt sau.');

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      let res = await queuedTurns();
      if (!res.auth) {
        // Token expired → re-login, then retry once this tick.
        if (!(await login())) { running = false; return; }
        res = await queuedTurns();
      }
      // Only serve the shared general assistant (agentchat). Leave Lark turns for the desktop.
      const turns = res.turns.filter((t) => t.kind === 'agentchat').slice(0, config.batchPerTick);
      for (const t of turns) {
        try {
          await reportTurn(t.id, { status: 'running' });
          const r = await runTurn(t.prompt);
          await reportTurn(t.id, {
            status: r.ok ? 'succeeded' : 'failed',
            result: r.ok ? r.text : undefined,
            error: r.ok ? undefined : r.error,
          });
          log(`turn ${t.id}: ${r.ok ? `ok (${r.text.length} ký tự)` : 'lỗi — ' + r.error}`);
        } catch (e) {
          try { await reportTurn(t.id, { status: 'failed', error: e?.message || 'Lỗi máy chủ' }); } catch { /* retry next tick */ }
        }
      }
    } catch (e) {
      log('lỗi tick: ' + (e?.message || e));
    } finally {
      running = false;
    }
  };

  setInterval(() => void tick(), Math.max(2, config.pollIntervalSec) * 1000);
  void tick();

  const shutdown = (sig) => { log(`nhận ${sig} — dừng.`); process.exit(0); };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
