title: Build your own order admin page for a small shop: a plan that fits a few weeks
excerpt: A step-by-step plan for a small shop owner to build an order admin page: settle the workflow, design the data, ship a working version, then test in parallel.
seoTitle: Build an order admin page for a small shop
seoDescription: A practical plan for your own order admin page: settle the status flow, design three tables correctly, then test it alongside your spreadsheet.
---
While orders are few, a spreadsheet is enough. But once you are handling dozens a day, have someone helping you sell, and customers asking "where's my order got to", the spreadsheet starts generating mistakes: people overwriting each other, statuses left unupdated, no idea who changed what.

This is a practical plan for a small shop to build its own order admin page in roughly 2–4 weeks of after-hours work, with no technical team.

## 1. Write out your real order flow before doing anything else

Don't start with the interface. Start with the question: **what statuses does an order pass through?**

Take a coffee shop doing takeaway plus delivery:

1. Customer orders → **New**
2. Confirmed, paid or COD → **Confirmed**
3. Being made and packed → **Preparing**
4. Handed to the courier → **Out for delivery**
5. Done → **Complete** or **Cancelled / Refunded**

A tip: write this flow on paper, then ask your staff "which cases don't fit?". There is almost always an exception — a customer swaps an item, something is missing from a delivery, a parcel comes back. Every exception you skip now becomes a manual task every day later.

### Fix the scope of version one

Version one only needs: view the order list, open an order, change its status, find an order by phone number. Reports, stock levels, granular permissions — later.

## 2. Designing the data: three tables is enough

This is the part that determines whether you have to start over.

- **Products**: name, price, image, whether still on sale.
- **Orders**: order code, customer name, phone, address, total, status, created time, notes.
- **Order lines**: which order, which product, quantity, **the price at the time of ordering**.

One important note: the price must be **copied into the order line**, not referenced from the products table. If you raise the price of coffee next month, every historical order will silently rise with it and your books will be wrong throughout. This mistake is extremely common in home-grown systems.

Likewise, never delete a product — just mark it "discontinued".

## 3. Build a working version

There are several routes, each with different trade-offs:

- **A drag-and-drop builder**: quick for a brochure page, but an admin page needs relational data and status logic — things drag-and-drop tends to constrain, or charge extra for via add-ons.
- **Hire someone**: the most flexible, but costly and slow to respond; changing one status label means waiting.
- **Describe it in natural language and let AI generate the app**: you write the requirement in plain language, and the system generates code, creates a real database and API, builds it and shows you a preview.

That third route is how [Toolswave](/create-website) works. You type something like: *"Build a coffee shop with a cart and an order admin page, orders have 5 statuses, searchable by phone number"*. The AI produces a real application — not a prebuilt template, not drag-and-drop — then deploys it to a public link on Cloudflare. There is a free tier with no credit card, and you can attach your own domain once you're satisfied.

What differs from the traditional route: you make changes by **restating the requirement**, rather than hunting for the right settings box or waiting for someone else to edit it.

### Phrasing the requirement so you get what you need

Whichever route you take, output quality depends on how clear your description is. Be specific: the status names, which fields are mandatory, who may change a status, what you need to search by. A vague brief like "a nice admin page" produces a vague result.

## 4. Run in parallel, don't switch over all at once

For the first week, enter orders into **both the old spreadsheet and the new system**. It is more work, but it is the only way to find gaps without disrupting actual trading.

Things that typically surface in this phase:

- No notes field for a customer's special request
- No way to enter an order that came in by phone
- Staff tapping the wrong status with no way to undo
- The screen is too cramped on a phone — and staff mostly use phones

Fix each one before you retire the spreadsheet.

## 5. Protect the data at a minimum level

An admin page holds customer names, phone numbers and addresses. At minimum, make sure you have:

- **A login requirement** for the whole admin area, not just an unguessable link
- **A separate account per person**, not one shared password
- **Regular data exports** to a file, so you hold an independent backup

## 6. Expand only where there is real demand

Once the page has been running smoothly for a few weeks, let actual need lead: daily revenue reports, stock levels, confirmation messages to customers, merging several sales channels. Any of those is fine — as long as it comes from something you are currently doing by hand every day, rather than from a feature list that sounds impressive.

## Finally

The compact plan has four parts: settle the status flow, design the three tables correctly, build a working version and run it in parallel, and expand only on real demand.

The hard part isn't technical. It is understanding how your own shop actually operates. Get that clear and the building step — whether you write it, hire it out, or describe it to an AI — is only the last one.
