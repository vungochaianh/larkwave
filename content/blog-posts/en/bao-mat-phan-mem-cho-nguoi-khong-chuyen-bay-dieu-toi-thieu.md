title: Software security for non-specialists: the seven minimums
excerpt: Seven basic security practices a small business owner can check without technical knowledge — and why most incidents come from very simple failures.
seoTitle: Software security for non-specialists: seven minimums
seoDescription: Seven security basics a small business owner can verify without technical knowledge, plus a 15-minute self-check that finds most real problems.
---
Most data incidents at small businesses don't come from sophisticated attacks. They come from one password shared across the company, an admin page that never asks anyone to log in, or an employee who left while their account kept full access.

The seven items below need no programming knowledge. They are questions you can check yourself, or put to whoever builds your software.

## 1. One account per person

A shared admin account is the most common mistake, because it destroys any possibility of tracing things. When something happens — an order altered, data missing — you cannot tell who did it.

What to do: a separate account for each employee, and **revoke access on their last working day**, not "sometime when I get around to it".

## 2. Permissions by job, not by trust

A salesperson needs to view orders, not delete them. Accounting needs to see revenue, not edit product prices.

The principle is **the minimum access needed to work**. This isn't about suspecting anyone — it is about limiting the damage when an account is compromised, and reducing accidental clicks.

## 3. Turn on two-factor authentication where it matters

Email, the domain registrar account, banking, and the software admin page. A password can leak without your knowledge; a second factor blocks nearly all of those cases.

The most important and most forgotten one: **email**. Whoever controls your email can reset the password on everything else.

## 4. The admin page needs an actual door

It sounds obvious, yet it still happens: an admin page that is merely "hard to guess" rather than genuinely requiring a login. An obscure address is not security — it leaks through browser history, shared links and logs.

Check it yourself: open the admin page in a private window. If you get in without logging in, that is a hole.

## 5. Customer data: collect only what you use

Every field you store is another thing you must protect. Why ask for a customer's date of birth if you never use it?

And for what you must store — phone numbers, addresses — **mask it on display** wherever the full value isn't needed. An order tracking page shown to customers only needs `09****789`.

## 6. Passwords must never be stored as readable text

This is a question to put to whoever builds your software: *how are user passwords stored?* The correct answer is "hashed with a dedicated algorithm". The wrong answer is anything that allows the original password to be read back.

The easiest tell: if the system can **email you your old password**, it is storing it readably. A system doing this correctly only ever lets you **set a new one**.

## 7. Updates and backups are part of security

Most automated intrusions exploit vulnerabilities that were patched long ago. Not updating is leaving the door open.

And backups are the final net: when everything else fails, the backup is what brings you back. Remember two things — the copy must sit **separate from the running server**, and you must **test a restore at least once**. A backup you have never restored doesn't really exist.

## Who is responsible for what

If you **hire a developer**, put these seven into the requirements from the start, and demand handover of infrastructure access once you have paid. A great many cases of "losing a website" are really losing access, not being attacked.

If you use a **drag-and-drop builder**, the provider handles infrastructure, but permissions and customer data remain yours.

When building with [Toolswave](/create-website), you describe the idea in plain language and the system generates the code, builds a real database and API, then deploys onto Cloudflare infrastructure — so HTTPS and operating system patching stop being your job. But state the security requirements in your description: *"the admin page must require login"*, *"staff can only see their own orders"*. Toolswave builds what you describe, so what you don't say won't be added for you. There is a free tier with no credit card.

## A 15-minute self-check

1. Open the admin page in a private window — are you blocked?
2. List the accounts with admin rights — has anyone on it left the company?
3. Does your main email have two-factor authentication enabled?
4. Try the forgotten-password flow — does it email your old password or make you set a new one?
5. When was the most recent backup, and where does it live?

Those five find most of the real problems, and none requires technical knowledge.

## In summary

Security for a small business isn't about buying expensive equipment. It is a few habits: one account per person, just enough permissions, two-factor where it matters, and a backup you have actually restored.

Do that much and you are ahead of most businesses your size.
