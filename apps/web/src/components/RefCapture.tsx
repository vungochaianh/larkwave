"use client";

import { useEffect } from "react";

/**
 * Capture a referral token (?ref=…) into localStorage on ANY page, before any
 * redirect can drop it. It's applied once the user reaches an authed page
 * (AppShell drains it via POST /me/referral). Renders nothing.
 */
export default function RefCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("tw_ref", ref);
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
