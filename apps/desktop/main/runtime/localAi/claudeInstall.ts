/**
 * Cài Claude Code MỘT BẤM (0.1.24) — chạy trình cài CHÍNH THỨC của Anthropic, không cần Node/npm:
 *   macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`   (đặt `claude` vào ~/.local/bin)
 *   Windows:     `irm https://claude.ai/install.ps1 | iex`
 * PATH của app (claudeRunner.claudeEnv) đã gồm ~/.local/bin và ~/.claude/local, nên cài xong là dò thấy.
 * KHÔNG đóng gói sẵn Claude Code vào bản cài Larkwave: đó là phần mềm độc quyền của Anthropic.
 * Bước đăng nhập giữ nguyên nút có sẵn (`claude auth login` mở trình duyệt).
 */
import { spawn } from 'node:child_process';

export interface ClaudeInstallResult {
  ok: boolean;
  error?: string;
  /** Đuôi nhật ký trình cài (để hiện khi lỗi). */
  log?: string;
}

export function installCommand(platform: NodeJS.Platform = process.platform): { cmd: string; args: string[] } {
  return platform === 'win32'
    ? { cmd: 'powershell', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex'] }
    : { cmd: '/bin/bash', args: ['-c', 'curl -fsSL https://claude.ai/install.sh | bash'] };
}

export function installClaude(timeoutMs = 5 * 60_000): Promise<ClaudeInstallResult> {
  const { cmd, args } = installCommand();
  return new Promise((resolve) => {
    let log = '';
    const add = (b: Buffer) => { log = (log + b.toString()).slice(-6000); };
    const p = spawn(cmd, args, { env: process.env, windowsHide: true });
    const timer = setTimeout(() => { try { p.kill(); } catch { /* đã tắt */ } }, timeoutMs);
    p.stdout?.on('data', add);
    p.stderr?.on('data', add);
    p.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message, log }); });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true, log: log.slice(-1500) } : { ok: false, error: `Trình cài của Anthropic thoát với mã ${code}.`, log: log.slice(-1500) });
    });
  });
}
