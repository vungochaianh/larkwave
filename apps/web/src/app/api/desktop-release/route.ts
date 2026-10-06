import { NextResponse } from "next/server";

/**
 * Same-origin proxy for the desktop code-push manifest, so the /download page can read
 * the live latest version + installer URLs without a CORS hit (the manifest is on a
 * different origin — twd-desktop-renderer.pages.dev — which sends no CORS headers).
 *
 * The manifest is the SINGLE source of truth shared with code-push: publishing a new
 * desktop release (bump `latestVersion` + add `downloads`) lights up this page with no
 * website redeploy. `downloads` is optional — absent → the page shows "sắp có".
 */
const MANIFEST_URL =
  process.env.LARKWAVE_RELEASE_URL || "https://twd-desktop-renderer.pages.dev/release.json";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    const m = (await res.json()) as {
      latestVersion?: string;
      notice?: string | null;
      downloads?: { mac?: string; win?: string };
    };
    return NextResponse.json(
      {
        version: m.latestVersion ?? null,
        notice: m.notice ?? null,
        mac: m.downloads?.mac ?? null,
        win: m.downloads?.win ?? null,
      },
      { headers: { "cache-control": "public, max-age=300, s-maxage=300" } },
    );
  } catch {
    return NextResponse.json({ version: null, notice: null, mac: null, win: null });
  }
}
