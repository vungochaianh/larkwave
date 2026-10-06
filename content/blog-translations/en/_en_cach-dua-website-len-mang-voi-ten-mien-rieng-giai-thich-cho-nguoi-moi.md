title: Getting a website online with your own domain, explained for beginners
excerpt: I used to think "putting a site online" was a job for technical people. It turns out to be three pieces — a domain, somewhere to host it, and DNS.
seoTitle: Get a website online with your own domain: a guide
seoDescription: Putting a website online comes down to three pieces: a domain name, somewhere to host it, and DNS. Here is how I finally understood each one.
---
A few years ago I finished a small site for my cousin's coffee shop. The HTML file sat obediently in a Desktop folder, looked good when opened in a browser, and she nodded approvingly at it. Then she asked the question that froze me: **"So what do customers type to get there?"**

I had no answer. I knew how to make a web page, but I had no idea how to make it *exist on the internet*. Those are two different things, and nobody had told me that.

## The three pieces I wish someone had drawn for me sooner

![The three pieces I wish someone had drawn for me sooner](https://apia.toolswave.net/uploads/images/1789671020371-2bbedfed.png)

After a few weeks of fumbling, I worked this out: getting a website online involves exactly three things. No more.

### 1. The domain name — your street address

The **domain name** is what people type into a browser: `mycoffeeshop.com`. You don't *buy* it outright, you **rent it by the year**, usually a modest annual fee for a `.com`, and you have to remember to renew. I once watched a bakery lose its website purely because nobody paid the domain fee.

A small tip: pick something short that a person can type correctly after hearing it over the phone, and avoid hyphens and digits.

### 2. Somewhere to host it — the plot of land

The domain is only a nameplate. You need **a server running 24/7** to hold the content and serve it to visitors. This is where beginners most often spend money in the wrong place: buying an enormous hosting plan for a site with 30 visitors a day.

### 3. DNS — the signpost

**DNS** is what connects the two. You go into the domain's control panel and add one line (an `A` or `CNAME` record) pointing the domain at where the site lives. The change takes two minutes, but **can take up to 24 hours** to propagate worldwide. The first time I did it, I was convinced I had made a mistake and redid it five times — patience was the only thing needed.

One more thing that is now mandatory: an **SSL certificate**, so the address shows `https://` and browsers don't label it "Not secure". Most modern services issue these free and automatically.

## The path I took, and the one I take now

![The path I took, and the one I take now](https://apia.toolswave.net/uploads/images/1789671094921-3d328d25.png)

### The traditional route

At first I did it by the book: wrote the code, rented a server, configured everything myself. The payoff was total control, at a cost of three weeks for a coffee shop's brochure page.

The more common choices are a **drag-and-drop builder** or **hiring someone**. Drag-and-drop is quick for a static page, but when my cousin asked "can we add a cart and an order page?", things got awkward — because that is no longer a *web page*, it is a **web application**: it needs a database and an API. And with the hire-someone route, changing a single line of text means sending a message and waiting.

### What I do these days

Now I start by typing the idea out in plain language. With [Toolswave](/create-website), I describe it the way I would say it out loud: *"build a coffee shop with a cart and an order admin page"*. The AI **writes the code, builds a real database and API**, runs the build, shows me a preview, then deploys it to a public link that works immediately.

The difference worth stating: this is **not drag-and-drop**, and **not a prebuilt template** where you swap the photos and text. It produces a real application with a real backend. And because the deployment sits on **Cloudflare**, the site is fast, has HTTPS, and needs no server configuration from you.

The last step — the one my cousin cared about — is **attaching your own domain**. You still buy the domain wherever you prefer, then point DNS at the deployment. Same three pieces as always; the "somewhere to host it" piece is just handled for you.

## A few honest caveats

I don't think any tool removes the need to learn. You should still understand what a domain is and what DNS does, because that knowledge is what saves you when something breaks. Toolswave has a **free tier with no credit card**, so the cheapest way to learn is to build something and point a domain at it.

And brace yourself: the first time you change a DNS record, you will be sure you have broken it. Go and make a coffee, come back in a few hours.

## What I took away

That question — "what do customers type to get there?" — embarrassed me at the time, but it was exactly the right question. A website only truly exists once a stranger can type an address and find it.

The gap between "a file on my Desktop" and "a website with its own domain" is far smaller than I imagined. It isn't a technical wall. It is three pieces, and one free afternoon.
