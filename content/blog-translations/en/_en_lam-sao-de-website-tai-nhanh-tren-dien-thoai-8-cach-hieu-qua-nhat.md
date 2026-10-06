title: How to make a website load fast on phones: the 8 most effective methods
excerpt: More than half of all traffic comes from phones, yet most sites are still tuned for desktops. Eight concrete ways to load fast on 4G, ordered by payoff.
seoTitle: Make your website load fast on phones: 8 methods
seoDescription: Eight concrete ways to make a website load fast on a phone over 4G, ordered by payoff — starting with images, the single biggest win on most sites.
---
Try opening your website on a phone, on 4G, somewhere with weak signal — not on office wifi on a 27-inch monitor. That is the real experience of most of your customers.

Google sets a fairly clear mark: a page's main content (the **LCP** metric) should appear within **2.5 seconds**. Past that, users start leaving before they even see what you sell. For a shop, every exit is an order that didn't happen.

Here are eight things that genuinely make a difference, ordered by what is worth doing first.

## 1. Deal with images first

On most websites, images are more than half the page weight — which makes this reliably the fastest win. Convert to **WebP** or **AVIF**, export at the size actually displayed (don't drop a 4000px image into a 400px frame), and use `srcset` so phones fetch the small version. This step alone usually cuts 40–70% of the weight with no visible difference.

## 2. Load only what the user can see

**Lazy loading** means images and video further down the page are only fetched when the user scrolls to them. In modern HTML, adding `loading="lazy"` to the image tag is enough for most cases. The reverse caveat: **do not** lazy-load the hero banner, because that is precisely what determines your LCP score.

## 3. Cut unused JavaScript and fonts

A mid-range phone processes JavaScript many times slower than a desktop, so every library you add is paid for. Audit honestly: do you really need a scroll-animation library, two form managers and four advertising trackers? For fonts, limit yourself to **1–2 families and 2–3 weights**, and add `font-display: swap` so text appears immediately instead of leaving the page blank while the font downloads.

## 4. Put content near the user with a CDN

A **CDN** is a distributed network of servers: a customer in Da Nang receives data from a nearby point of presence rather than waiting for packets to cross the Pacific. Physical distance is the one thing no code optimisation compensates for, which makes this a very high-return investment. Many platforms now enable a CDN by default — applications built with [Toolswave](/create-website), for instance, deploy straight onto Cloudflare infrastructure, so global distribution is there from the start rather than being configured afterwards.

## 5. Measure with real numbers, don't judge by feel

Your machine has a warm cache and good wifi — the feeling that "it seems fast" is almost always wrong. Run **PageSpeed Insights** or the Lighthouse tab in Chrome DevTools, and watch three figures: **LCP** (under 2.5s), **INP** (under 200ms), **CLS** (under 0.1). Measure before you change anything and again afterwards, or you won't know which change helped.

## 6. Reduce the number of data calls

A page that looks simple but makes 15 separate API calls will be markedly slower than one that consolidates into 2–3, because every round trip on a mobile network costs latency. Combine queries, add **indexes** to columns you filter or sort by, and cache data that rarely changes such as product categories. This is usually the real culprit when a page is "inexplicably slow" despite lightweight images.

## 7. Design mobile-first and reserve space for content

Designing for a small screen and expanding outwards produces something lighter than building a grand desktop version and trimming it down. At the same time, declare `width` and `height` on images, ads and banners so the browser reserves the space and content doesn't jump while loading. A page that jumps makes people tap the wrong thing, and that is exactly what the CLS metric penalises.

## 8. Choose a build approach that produces lean code

A great many slow websites are slow not for lack of optimisation, but because the underlying platform emits piles of code and extensions nobody uses — stacked plugins are the hardest kind of technical debt to unwind. A different approach is having AI generate code for exactly your needs: with Toolswave you describe it in plain language, such as "build a coffee shop with a cart and an order admin page", and the system generates the code, builds a real database and API, runs the build, shows a preview and deploys to a public link. Unlike a drag-and-drop tool or a prebuilt template, the result contains only the parts you asked for — and you can start on the free tier with no credit card and attach your own domain later.

## In summary

If you only have one afternoon, work in this order:

1. Measure first with PageSpeed Insights so you have a baseline.
2. Compress and convert images, and enable lazy loading below the first screen.
3. Strip out unused scripts and fonts.
4. Measure again.

Speed isn't a one-off task — but those four steps are usually enough to take a page from "annoyingly slow" to acceptable, and most of your time will go into step two.
