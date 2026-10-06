"use client";

import { useState } from "react";

/**
 * Free, server-cached screenshot of a PUBLIC url (WordPress mShots). Used to show
 * a real preview of a deployed app on its card instead of only a gradient cover.
 * The deployed apps are public (pages.dev / *.toolswave.net), so screenshotting
 * them via a public service exposes nothing that isn't already public.
 */
export function screenshotUrl(liveUrl: string, w = 640): string {
  return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(liveUrl)}?w=${w}`;
}

/**
 * Live screenshot overlay for an app cover. Absolutely fills its (relatively
 * positioned) parent. Renders nothing when there's no url or the image fails to
 * load, so the parent's gradient/glyph cover shows through as a graceful fallback.
 */
export function LiveThumb({ url, alt }: { url?: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external cross-origin screenshot; next/image adds no value here
    <img
      src={screenshotUrl(url)}
      alt={alt || ""}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "top center",
      }}
    />
  );
}
