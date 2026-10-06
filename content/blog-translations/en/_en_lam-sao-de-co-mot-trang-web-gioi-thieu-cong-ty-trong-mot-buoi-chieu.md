title: How to get a company website built in a single afternoon
excerpt: One Friday afternoon a friend urgently needed a company website to send a client. Here is how we finished before dark — and what we deliberately left undone.
seoTitle: Build a company website in a single afternoon
seoDescription: A friend needed a company website by Monday. Here is how we finished in one afternoon, what actually took the time, and what we deliberately left undone.
---
Friday afternoon, Tuan — a friend of mine who runs a small machining workshop in Binh Duong — rang with a note of urgency: "I'm meeting a Japanese partner on Monday, they asked about our website, and I don't have one. Can you help?"

I looked at the clock: 2pm. I said yes, on one condition: he had to sit with me for the first hour. He assumed I needed him to choose colours. What I actually needed was **content**.

## The hard part isn't building the website

I have watched people spend three weeks on a company website. Not because the tools are difficult, but because they opened the tools before knowing what they wanted to say. Then they fiddled with fonts, swapped the background image, dragged the contact block back and forth — and three weeks later the site still said "Content coming soon".

A good company website is genuinely simple. It only has to answer the five questions a stranger will ask in the first 30 seconds:

1. **What do you do?** One sentence, no jargon. "We do precision machining for the plastics industry" is plenty.
2. **Who have you done it for?** Client names, or years in business, or number of orders. Anything concrete.
3. **What services exactly?** Three to six items, two lines each.
4. **Where is the proof?** Photos of the workshop, of products, an ISO certificate, a real quote from a customer.
5. **How do I get in touch?** Phone, email, address, opening hours, a map.

Tuan and I wrote all of that into a Google Doc in 50 minutes. He dug through his phone and found 12 photos of the workshop taken on a phone camera — a bit dark, but real. Real always beats stock photography that looks like every other company.

### A note on photos

Don't try for magazine-quality images. B2B customers trust real workshop photos more than staged ones. Just get enough light, tidy the machines, and export under 300KB so the page loads fast.

## 3pm: building the site

Only now do the tools matter. There are two familiar routes: **hire someone** (a quote, and at least a week of waiting), or sit down with a **drag-and-drop builder** (cheaper, but you'll lose an evening working out why a button won't centre).

The third route, and the one I chose that day, is describing the site in plain language and letting AI write the code. I used [Toolswave](/create-website) and typed exactly this:

> "Build a company site for a precision machining workshop, with a home page, a services page with 5 items, a workshop photo gallery, a contact page with a quote-request form that saves to a database, and an admin page to view submitted requests."

The difference worth mentioning isn't "it's faster". It's that **the quote form actually works**. Toolswave generated the source, built a real database and API, ran the build and showed a preview — so when Tuan submitted a test request, the data went into a real table, and he opened the admin page and saw it sitting there. This is not a recoloured template and not drag-and-drop blocks; it is a web application written from the description.

We revised three times: reordered the services, added a "Machine capabilities" table, dropped the blog section because he knew he'd never write it. Each round was one sentence of plain language.

At 4:40 I hit deploy. The site ran for real on Cloudflare, with a public link he could send immediately. Free tier, no credit card — which mattered more to Tuan than I expected, because he didn't have to get anything approved by accounts.

### The domain

The only thing that cost money that day was his `.com.vn` domain, a modest annual fee. Pointing it at the site took another 20 minutes waiting for DNS to propagate. 5:15pm, done.

## What I did not finish that afternoon

Let me be honest: that afternoon produced a website that **works**, not one that is **finished**.

- The Japanese version for his partner went to a translator and arrived the following week.
- I did nothing for SEO beyond writing sensible page titles. Ranking for keywords is a matter of months.
- The photos are still a bit dark. He booked a photographer for the end of the month.

But all three of those could wait, and the Monday meeting could not. That is the whole point.

## Looking back

The thing that stayed with me wasn't finishing a website in three hours. It was that Tuan had put this off for **four years**. Not for lack of money or tools, but because in his head "building a website" was a large project needing lots of preparation, so it kept sliding down the list.

When the technical barrier drops to "describe it in plain language", what remains is a very human question: what do you want to say to your customers?

No AI answers that one for you. But it only takes 50 minutes and a Google Doc.
