import type { MetadataRoute } from "next";

const SITE = "https://toolswave.net";

/**
 * robots.txt — allow crawling the public marketing surface; keep the authed
 * workspace, the admin panel, the API and every SHARE link out of the index.
 *
 * robots.txt is advisory only: a scraper that ignores it is not stopped by anything here.
 * The enforcing layers are the `X-Robots-Tag` the middleware stamps on gated pages
 * (apps/web/src/proxy.ts), the per-route `robots: { index: false }` layouts under the share
 * paths, and the rate limits at nginx (deploy/nginx-toolswave.conf).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pricing", "/download", "/support"],
      disallow: [
        "/admin",
        "/api",
        "/overview",
        "/assistant",
        "/agent",
        "/agents-chat",
        "/remote",
        "/profile",
        "/billing",
        "/storage",
        "/friends",
        "/community",
        // Share links — one user's artifact / transcript / assistant behind a slug. Indexing
        // them would turn every share into a permanently discoverable, scrapeable page, and
        // for /g it would invite anonymous LLM turns billed to the owner.
        "/a/",
        "/s/",
        "/g/",
        "/lark/s/",
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
