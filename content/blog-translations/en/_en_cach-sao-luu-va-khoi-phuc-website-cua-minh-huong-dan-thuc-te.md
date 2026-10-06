title: How to back up and restore your website: a practical guide
excerpt: Backing up a website isn't just downloading files — you need the code, the database and the domain configuration. What to save, where, and how to test it.
seoTitle: How to back up and restore your website properly
seoDescription: A website backup needs three layers: code, database and configuration. What to save, the 3-2-1 rule, and why an untested backup doesn't really exist.
---
Losing a website rarely comes down to hackers. Most incidents come from thoroughly ordinary things: an edit to the wrong config line, a deleted table, a forgotten domain renewal, or a hosting provider shutting down. What they share is that they happen at a moment when you have prepared nothing.

A backup means creating a copy of your website somewhere else. A restore means bringing that copy back into service. They sound similar but differ enormously in difficulty — and most people only ever do the first.

## What a complete backup contains

![What a complete backup contains](https://apia.toolswave.net/uploads/images/1789712245876-47576a7f.png)

Many people think a backup is downloading the website folder. That is only part of it. A running website really has **three layers** that need saving:

1. **Code and theme** — the files that make up the site, including your own modifications.
2. **The database** — where products, orders, articles and user accounts live. This is the most valuable layer and the one most often missed, because it isn't inside the file folder.
3. **Configuration** — where the domain points, environment variables, API keys, email settings.

Miss the second layer and you restore an empty website. Miss the third and the site runs but nobody can reach it.

## The 3-2-1 rule

This is the industry standard, simple enough for an individual to follow:

- **3** copies of the data (the live original plus 2 backups).
- **2** different kinds of media (for example a computer's hard drive and a cloud storage service).
- **1** copy physically elsewhere, separate from the running server.

The reason for that last point: if the backup sits on the same server as the website, a server failure takes both.

### How often

The right question isn't "how often should I back up" but **"how many days of data loss could I live with?"**. A personal blog with a weekly post: weekly is fine. A shop taking orders daily: daily, at minimum.

## When using an AI website builder

![When using an AI website builder](https://apia.toolswave.net/uploads/images/1789712422505-285709fe.png)

With newer-generation platforms, the backup story differs considerably from the traditional one.

On [Toolswave](/create-website) you describe the idea in plain language — say "build a coffee shop with a cart and an order admin page" — and the AI generates the code, builds a real database and API, runs the build, shows a preview and deploys to a public link. This is not a drag-and-drop tool and not a prebuilt template, and it requires no programming.

That affects backups in two ways:

- **The infrastructure burden is lighter.** The site deploys for real onto Cloudflare, so you aren't backing up a server, an operating system or web server configuration as you would when self-hosting.
- **The data is still yours.** Orders, customers, content — no platform can take responsibility for those on your behalf. Export them regularly to a file and keep it elsewhere.

The largest difference from the traditional route: while your original description and the history of change requests still exist, rebuilding the interface and features is no longer days of manual work. But data generated after the site went live cannot be "regenerated" — it exists only if you saved it.

## Don't forget the domain

A domain is an asset separate from the website. Make sure:

- The domain is registered **in your name**, not in the name of the developer you hired.
- You hold the login and password for the domain registrar.
- **Auto-renew** is on and the notification email address still works.

Many cases of "losing a website" are really losing control of a domain. Toolswave and similar platforms let you attach your own domain, but ownership stays with the registrar — that is what you need to control.

## An untested backup doesn't exist

This is the part almost everyone skips. A backup file can be corrupt, missing tables, or produced by a version that is no longer compatible — and you discover it at the worst possible moment.

Every few months, spend 30 minutes restoring a backup into a test environment, then check:

- Do the home page and main pages render correctly?
- Is the most recent data there?
- Do the critical functions work (ordering, form submission, login)?

## What to do this week

- Establish what data your website holds and where that data lives.
- Create one complete backup and store it away from the server.
- Record your domain registrar credentials somewhere safe.
- Put a recurring backup reminder in your calendar.

Backups are the kind of work that gives you no sense of achievement at all — until the day they save you.
