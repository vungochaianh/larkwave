title: What an API is, and why every piece of software needs one
excerpt: An API is how two programs talk to each other. Explained with everyday examples, the places beginners get it wrong, and when you actually need to care.
seoTitle: What an API is and why every software needs one
seoDescription: An API is how two programs talk to each other. Explained in plain terms, with the three things beginners get wrong and what to ask before you build.
---
You open your banking app and the balance appears within half a second. Your phone was not storing that balance — it just **asked** the bank's server and got an answer back. That structured asking and answering is an API.

The acronym turns up in every software quote and every technical meeting, and usually nobody stops to explain it. This explains the part you need in order to make decisions, not the part you need in order to write code.

## A definition you can use

An **API** is a contract between two pieces of software: side A asks in this exact shape, side B answers in that exact shape.

The closest analogy is **a restaurant menu**. You don't walk into the kitchen and cook. You read the menu, order by the names printed on it, and the kitchen sends out a dish. The menu defines what you can order and how — while hiding entirely how the cooking happens.

Three things follow from that analogy, and all three matter in practice:

- **You can only order what's on the menu.** An API allows exactly what it publishes, no more.
- **You don't need to know how the kitchen works.** That is the big win: the other system can change its internals without affecting you, as long as the menu stays the same.
- **If the menu changes, you change too.** This is the most painful part in reality, covered below.

## What it looks like

Most APIs today are **web APIs**: one side sends a request over the internet, the other returns data, usually as JSON — a text format both humans and machines can read.

A typical request has four parts:

1. **An address**: `https://api.example.com/v1/orders/1042`
2. **A verb**: `GET` (fetch), `POST` (create), `PATCH` (modify), `DELETE` (remove)
3. **Identification**: a key or token proving you are allowed to ask
4. **A payload**: when creating or modifying something

And the response carries a **status code** (200 means done, 404 not found, 401 not permitted, 500 the other side broke) plus the data. Knowing that much is enough to read most API documentation.

## Why all software touches APIs

Even a small online shop typically calls out in several places:

- **Payment** — asking a bank or gateway whether the money has arrived
- **Shipping** — fetching a delivery fee for an address, checking a parcel's status
- **Messaging** — confirmation emails, appointment reminders
- **Sign in with an existing account** — asking a third party whether this person is who they claim

More importantly: **your own software has an API inside it too**. The website you see (the interface) asks the server for the product list, submits orders, updates statuses. That is also an API — it just happens that both sides belong to you.

This is the real dividing line between two kinds of product: a static brochure page needs no API because the content is already in the page. But anything that **remembers data** — a cart, a booking, a user account — must have an API to read and write its data store.

## Three things beginners get wrong

### "If it has an API, integration is automatic"

No. Two systems that both have APIs still need someone to write the piece between them, because the names and data shapes on each side almost never match. One calls it `customer`, the other calls it `partner_id`. That translation is real work with a real cost.

### "A public API means anyone can call it"

Public means *documented*, not *unrestricted*. Almost every API requires an access key, limits how many calls you may make per minute, and may charge by volume.

### "Once it's connected, it's done"

This is the most expensive misconception. Third-party APIs **have versions and retirement dates**. The other side upgrades, the old version is switched off, and your integration breaks on a day you touched no code at all. Treat every integration as something to maintain, not a one-off task.

## What about when you build software yourself

If you hire a developer, ask two questions before signing: *does this software have an API for connecting to other systems later?* and *do I get documentation for it?* Without both, every future integration starts with someone re-reading the source code.

If you use a **drag-and-drop builder**, the API is usually hidden — convenient at first, but when you need to connect to accounting or warehouse software there is nowhere to plug in.

Another route is describing what you need in plain language and letting AI build it. On [Toolswave](/create-website) you type roughly *"build a coffee shop with a cart and an order admin page"*, and the system generates the code, **builds a real database and API**, runs the build, shows a preview and deploys to a public link. The relevant point for this article: the API isn't an upsell, it is part of the product from the start — so when you need to connect elsewhere, there is already something to connect to. Toolswave has a free tier with no credit card and supports custom domains.

To be clear so nobody expects the wrong thing: having an API does not make every integration free. Connecting to a payment gateway still needs a business licence; connecting to a courier still needs a contract. An API removes the technical barrier, not the paperwork.

## In summary

An API is how two pieces of software talk to each other under an agreed contract. You don't need to know how to write one, but you should know three things: whether your software **has** one, who **holds the documentation**, and **what happens when the other side changes version**.

Asking those three questions before you build is cheap. Asking them after an integration breaks is not.
