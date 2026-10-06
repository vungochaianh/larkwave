'use client';
import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useRuntime } from '../RuntimeProvider';
import { accountApi } from '../account/api';

/**
 * Offline-first (Phase 0) status banner. Polls the apia liveness probe (GET /health,
 * which the cache never serves stale) — the recent outage took BOTH tailscale and the
 * cloudflared tunnel down, so `navigator.onLine` is insufficient; a real /health probe
 * is the source of truth. When apia is unreachable, the account views are now served
 * the LAST-KNOWN cached data (read-through cache in main), and this banner tells the
 * user so. Desktop-only (web talks to its own server directly).
 */
export function NetworkBanner() {
  const runtime = useRuntime();
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (runtime.kind !== 'desktop') return; // web: no proxy/cache layer
    let dead = false;
    let fails = 0;
    const check = async () => {
      try {
        await accountApi.health();
        if (!dead) {
          fails = 0;
          setOffline(false);
          setDismissed(false); // recovered → let a FUTURE real outage show again
        }
      } catch {
        // THREE strikes (~60s) before flagging offline — a deploy/restart blip (server reboots in
        // <60s) should NOT pop the banner; only a genuine outage does.
        fails += 1;
        if (!dead && fails >= 3) setOffline(true);
      }
    };
    void check();
    const id = setInterval(check, 20000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [runtime]);

  if (!offline || dismissed) return null;
  return (
    <Alert
      type="warning"
      showIcon
      banner
      closable
      onClose={() => setDismissed(true)}
      style={{ marginBottom: 12, borderRadius: 8 }}
      message="Mất kết nối máy chủ — đang hiển thị dữ liệu đã lưu. Sẽ tự cập nhật khi có mạng trở lại."
    />
  );
}
