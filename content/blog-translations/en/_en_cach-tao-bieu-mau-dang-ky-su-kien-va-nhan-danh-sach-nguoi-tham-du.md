title: How to build an event registration form and get an attendee list
excerpt: A step-by-step guide to building an event registration form: choosing fields, storing the data, sending confirmations, checking people in and exporting the list.
seoTitle: Build an event registration form and attendee list
seoDescription: Build a proper event registration form: choose the right fields, store data you can query, send confirmations, check attendees in and export the list.
---
When you organise a workshop, a seminar or a meetup, the first thing you need is **somewhere for people to register**. Sending a Google Form link and copying the data into Excel works, but it starts falling apart the moment you need confirmation emails, check-in at the door, or a 100-seat limit.

This guide walks through building a proper event registration setup: a public sign-up page, somewhere to store the list, and an admin page where you can view and export it.

## 1. Work out what you genuinely need to collect

![Work out what you genuinely need to collect](https://apia.toolswave.net/uploads/images/1789650727666-26a3cfee.png)

Don't start with a tool. Start with a sheet of paper and the question: *after the event, what do I need to know about these people?*

The minimum set for most events:

- **Full name** — for badges and for calling people at check-in
- **Email** — the channel for confirmations and reminders
- **Phone** — a fallback when email lands in spam
- **Organisation** (optional) — useful if you need to know your audience

A practical rule: **every unnecessary field costs you a few percent of completions**. If you don't know what you'd do with the data, drop it. "How did you hear about this event?" sounds useful but is rarely read afterwards.

If the event has several sessions or ticket types, add a **session choice** as a dropdown — don't let people type it freely.

## 2. Decide where the data will live

This is the difference between a makeshift form and a usable system.

Registration data needs to sit in a **database you can query**, not a spreadsheet you paste into by hand. Because:

- You need to **count remaining seats** in real time
- You need to **block duplicate email registrations**
- You need an **admin page** to filter, search and mark people checked in

A spreadsheet does none of these reliably once several people are working in it at once.

## 3. Build the sign-up page and the admin page

Three common routes:

**Write it yourself.** Total control, but you have to write a backend, set up a database, rent hosting and deploy. For an event in two weeks, that usually doesn't fit.

**A drag-and-drop builder.** Fast on the interface, but the business logic — seat limits, QR check-in, a dedicated admin page — usually means buying add-ons or going without.

**Describe it to an AI that builds the app.** This is how [Toolswave](/create-website) works: you write what you want in plain language, the AI generates the code, builds a real database and API, runs the build, shows you a preview and deploys to a public link.

A description like this is enough:

> "Build an event registration page: a form for name, email, phone, and a morning or afternoon session choice. Cap it at 100 people and show a message when full. Include an admin page listing registrations, searchable by name, with a check-in flag and CSV export."

The difference from drag-and-drop is that you aren't assembling interface blocks — you are describing **system behaviour**, and what you get back is a web app with a real backend. You aren't picking from a template gallery either; the app is generated from your description.

## 4. Handle confirmations and reminders

After hitting submit, the registrant should immediately see **a thank-you page repeating the time and place**. This detail gets skipped often and it prevents a great many follow-up messages.

Then:

- Send a **confirmation email** with a registration code
- Send a **reminder one day before** — no-shows drop noticeably
- If the event is paid, state the payment deadline in that first email

### On QR check-in

Each registration should have its own code. At the door you scan or type it and the system marks the person as arrived. This is faster than scanning a printed list for a name, and it tells you exactly how many people actually came versus how many registered.

## 5. Test before you announce

Never send the link without registering yourself first. The checklist:

1. Fill in the form on a **phone**, not just a desktop — most people register from phones
2. Leave a required field empty and check the error message is clear
3. Register a duplicate email and see how the system handles it
4. Check whether the confirmation email lands in **spam**
5. Log into the admin page, export the file, and open it in Excel to check the accented characters survive

Broken encoding on CSV export is a frequent problem. Exporting once tells you immediately.

## 6. Export and hand over the list

The day before the event, export the list to a file and **print a paper backup** — venue wifi doesn't always cooperate.

After the event, keep two numbers: **registrations** and **actual attendance**. The ratio between them is what lets you forecast accurately next time, and it matters more than any other metric.

## Conclusion

A good registration form isn't a pretty form, it is one that **collects the right data, stores it somewhere queryable, and gives you an admin page to work in**. If you'd rather not touch code, describing the requirement in plain language to Toolswave shortens this from days to tens of minutes — there is a free tier with no credit card, so trying costs nothing. Whichever route you take, spend ten minutes registering yourself before you send the link to anyone else.
