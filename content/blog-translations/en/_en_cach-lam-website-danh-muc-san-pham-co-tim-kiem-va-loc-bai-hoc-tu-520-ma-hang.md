title: Building a searchable product catalogue: lessons from 520 SKUs
excerpt: I built a catalogue for a motorbike parts shop with 520 SKUs and learned the hard part isn't the interface — it's the data and how people actually search.
seoTitle: Product catalogue with search and filters: 520 SKUs
seoDescription: Lessons from building a searchable catalogue for 520 SKUs: the hard part is clean data, not the interface. What I got wrong and how to avoid it.
---
Last March, a friend who sells motorbike parts in Binh Duong sent me a 520-row Excel file and one very short question: "How do I let customers look this up themselves, so they stop messaging me all day?"

I thought it would take two evenings. It took three weeks. And almost none of that time went into "building a website".

## 520 rows of Excel and seven ways to spell "Honda"

The first thing I did was open the file. Across those 520 rows there were **seven different spellings** of the same manufacturer: Honda, HONDA, honda, Hon da, HD, H, and one blank cell. The "type" column was free text, so it held "air filter", "engine air filter", "air filtre" and "airfilter".

This is lesson number one, and it holds for every product catalogue: **a filter is only as good as the data is clean**. You cannot filter by manufacturer when the manufacturer column holds seven values for one thing.

The rules I took away:

1. Any field used for **filtering** must be a **fixed list** — chosen from a dropdown, never typed.
2. Any field used for **search** can be free text (name, description, notes).
3. Every product needs a **unique SKU**, even if the shop has never used codes before.

Three evenings spent standardising that spreadsheet were worth more than every line of code I wrote afterwards.

## Three things about the search box that I got wrong

### Vietnamese users type without diacritics

I tested by typing "lọc gió" and it worked nicely. My friend sent the link to a customer, who typed "loc gio" — and got nothing.

You must **strip diacritics on both sides**: normalise what the user typed, and normalise the stored data before comparing. This is not an advanced feature, it is the minimum for a Vietnamese site to be usable at all.

### SKUs need a different kind of matching

Customers type codes every possible way: `A-1234`, `a1234`, `A 1234`. I added a step: remove dashes and spaces, lowercase everything, then compare. And when the typed string **matches exactly one SKU**, I put that result first rather than burying it among 30 others.

### Don't let customers hit a dead end

A "0 results" screen is where people close the tab. Two cheap, effective fixes:

- **Show a count next to each filter option** (Honda 84, Yamaha 61) and grey out any option that would return nothing.
- When there is no match, show near-miss suggestions instead of an empty line of text.

One more detail: **put the filter state in the URL**. That let my friend send a customer a single link for "all Honda air filters", and it makes the browser's Back button behave the way people expect.

## How to build it

![How to build it](https://apia.toolswave.net/uploads/images/1789669688196-a2e1dcf5.png)

With 520 SKUs, you have three routes.

A **drag-and-drop builder** gets the interface up quickly, but filtering is usually a bolt-on add-on that runs in the browser and starts to crawl as the catalogue grows. **Hiring someone** is flexible, but every new filter field means another wait and another invoice.

The third route is describing the idea in plain language and letting AI build it. On [Toolswave](/create-website), you type exactly what you need — for example "build a motorbike parts catalogue, search by name and SKU, filter by manufacturer and part type, with an admin page to add and edit products" — and the AI writes the code, **builds a real database and API**, runs the build, shows you a preview, and deploys it to a public link.

The difference worth mentioning isn't the speed, it's the real database behind it. That means filtering runs on the server, and the page behaves much the same whether you have 520 SKUs or 5,000. This is not drag-and-drop and it is not a prebuilt template — you get a real application, really deployed on Cloudflare, with a custom domain and a free tier to try before you commit.

## What I think a year later

That page is still running. My friend's price-check messages dropped by about half — not because the page is pretty, but because customers find what they need in ten seconds.

If I had to compress it into one sentence: **a product catalogue is a data problem wearing a design problem's clothes**. Spend most of your effort standardising manufacturer names, assigning SKUs, and agreeing on categories. The rest — the search box, a few checkboxes, a load-more button — is the easy part now.

And never trust your own search box until you have tried it without diacritics.
