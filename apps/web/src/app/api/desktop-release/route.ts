import { NextResponse } from "next/server";

/**
 * Same-origin proxy for the desktop code-push manifest, so the /download page can read
 * the live latest version + installer URLs without a CORS hit (the manifest is on a
 * different origin which sends no CORS headers).
 *
 * The manifest is the SINGLE source of truth shared with code-push: publishing a new
 * desktop release (bump `latestVersion` + add `downloads`) lights up this page with no
 * website redeploy. `downloads` is optional — absent → the page shows "sắp có".
 */
// Larkwave chưa có kênh phát hành riêng: KHÔNG lùi về manifest của Toolswave (sẽ trỏ trang tải về
// sang bộ cài của sản phẩm khác). Chưa đặt LARKWAVE_RELEASE_URL ⇒ trang hiện "sắp có".
const MANIFEST_URL = process.env.LARKWAVE_RELEASE_URL || "";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!MANIFEST_URL) return NextResponse.json({ version: null, notice: null, mac: null, win: null });
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
