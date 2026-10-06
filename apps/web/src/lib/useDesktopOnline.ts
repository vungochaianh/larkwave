"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Is the user's desktop app currently online (holding the relay connection)? Polls `/agent/devices`
 * (each device carries a derived `online` flag = lastSeenAt within the 45s heartbeat window). Used by
 * the remote-chat pages to block the composer when the machine is offline — so users don't fire
 * requests that would only time out. Assumes online until the first check completes (no false block flash).
 */
export function useDesktopOnline(): { online: boolean; checked: boolean } {
  const [online, setOnline] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const devices = await api.listDevices();
        if (!alive) return;
        setOnline(devices.some((d) => d.online));
        setChecked(true);
      } catch {
        // Network/API hiccup — don't flip to "offline" on a transient error; keep the last value.
        if (alive) setChecked(true);
      }
    };
    void check();
    const id = setInterval(check, 15000);
    const onFocus = () => void check(); // re-check when the user returns to the tab
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { online, checked };
}
