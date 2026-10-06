title: Building a bilingual Vietnamese-English website: a step-by-step guide
excerpt: A practical guide to a bilingual site: choosing a URL structure, extracting interface strings, designing the database for translated content, and the switcher.
seoTitle: Build a bilingual Vietnamese-English website
seoDescription: A practical guide to bilingual sites: URL structure, extracting interface strings, storing translated content, and a switcher that works.
---
Many people assume a bilingual website just means translating the words. The hard part is elsewhere: which URL the English version gets, how to store two languages in the database, and what happens when an article only exists in Vietnamese. Here are the steps in order, with the places people usually go wrong.

## 1. Decide what genuinely needs to be bilingual

Split your content into three groups before doing anything:

- **Interface strings**: menus, buttons, form labels, error messages. A fixed set, translated once.
- **Content you author**: articles, products, about pages. This grows over time and costs the most effort.
- **User-generated data**: comments, reviews. Usually **not** translated — leave them in the original language.

Honest advice: don't try to translate the whole site at once. A carelessly written English version, or raw machine translation, does more harm than having none. Start with the home page, your main product or service pages, and contact.

## 2. Choose a URL structure

![Choose a URL structure](https://apia.toolswave.net/uploads/images/1789711559157-d16649d0.png)

Three common patterns:

1. **Subdirectories**: `yourdomain.com/vi/...` and `yourdomain.com/en/...` — easiest to manage, and it concentrates all domain authority in one place. This is the right choice in most cases.
2. **Subdomains**: `en.yourdomain.com` — sensible when the two versions have genuinely different content and teams.
3. **Query parameters**: `?lang=en` — best avoided; search engines handle it poorly and shared links look messy.

### Declare hreflang

Every page needs to declare its own language versions in the `<head>`, including `hreflang="vi"`, `hreflang="en"` and an `x-default` pointing at the default. Without this, Google readily treats the two versions as duplicate content.

## 3. Extract text out of the interface

Never write text directly into code or into design blocks. Keep it in two dictionary files, say `vi.json` and `en.json`, one key per string.

The commonly forgotten parts:

- **Dates**: `18/09/2026` in Vietnamese, `September 18, 2026` in English.
- **Numbers and currency**: `1.250.000 ₫` versus `$49.90`. The decimal and thousands separators are reversed.
- **Never concatenate strings** like `"Còn " + n + " sản phẩm"` — English grammar breaks when n = 1.

## 4. Design the database for translated content

With exactly two languages, the simple and sufficient approach is **a column per language**: `title_vi`, `title_en`, `content_vi`, `content_en`. Only if you plan to expand to five or six languages does a separate `translations` table become necessary.

Two details not to skip:

- Each language should have **its own slug** (`/vi/ca-phe-rang-xay` and `/en/roasted-coffee`), far friendlier than sharing one Vietnamese slug.
- You need a clear **fallback rule**: when a post has no English version, do you hide it entirely, or show the Vietnamese with a note? Decide early, and never leave a blank page.

## 5. Build the language switcher properly

- Show **language names** ("Tiếng Việt / English"), not flags — a flag represents a country, not a language.
- When switching, stay on the current page rather than bouncing to the home page.
- Store the choice in a cookie so returning visitors don't have to click again.
- Don't hard-redirect based on IP. Vietnamese people abroad get pushed to the English version with no way back.

## 6. Choosing how to build

**Hiring someone** gives you full control, but changing one line of English means waiting for somebody else.

**Drag-and-drop builders** produce a static page quickly, but the bilingual part usually means duplicating pages by hand and remembering to keep both in sync on every edit.

Another route is describing the requirement in plain language and letting AI generate the code. On [Toolswave](/create-website) you type exactly what you mean — for example "build a bilingual Vietnamese-English company site with a blog where each post stores both language versions, plus an admin page to enter them side by side" — and the AI generates the code, builds a real database and API, runs the build, shows a preview and deploys to a public link. This is not drag-and-drop, not a prebuilt template, and needs no programming. There is a free tier with no credit card, real deployment on Cloudflare, and custom domain support.

The meaningful difference is at step 4: this approach gives you a real data structure with bilingual fields from the outset, rather than two separate pages you must synchronise yourself. That said, Toolswave builds the frame — writing English that actually reads well is still your job.

## 7. Check before launch

- Do the fonts render Vietnamese diacritics fully (stacked tone and vowel marks often break).
- Vietnamese text runs 20–30% longer than English; check buttons and menus don't overflow.
- Do automated emails, form error messages and the 404 page exist in both languages?
- Title tags and meta descriptions written individually per language, not machine-translated.
- Does the sitemap contain URLs for both versions?
- Try the language switch from any sub-page, not just the home page.

## Conclusion

A bilingual website succeeds on three early decisions: the URL structure, how content is stored in the database, and the fallback rule. Get those right and adding content later is just typing. Get them wrong and you will spend months patching one page at a time.
