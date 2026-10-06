title: What a webhook is, and when to use one instead of asking repeatedly
excerpt: A webhook lets another system tell you the moment something happens, instead of you asking every minute. When to use one, and four things to get right.
seoTitle: What a webhook is and when to use one
seoDescription: A webhook lets another system notify you the moment something happens instead of polling. When to use it, and four things to get right or lose data.
---
You need to know the moment a customer transfers money. There are two ways. The first: ask the bank every minute, "any new transactions?". The second: give the bank an address and say "call me when something happens".

The second is a **webhook**. It reverses the direction of the call, and that reversal alone changes both the cost and the latency of your system.

## Polling versus being called

**Polling** means you actively call the other side's API on a schedule. Easy to build, easy to reason about, and it works everywhere.

The drawback appears once you do the arithmetic. Asking every minute means **1,440 calls a day**, almost all of which return "nothing new". You pay bandwidth and rate limits for empty answers. And the worst-case latency is still a full minute — the customer paid 59 seconds ago and the order is still pending.

**A webhook** reverses it: the other side holds an address of yours, and when an event occurs they send a request to it. No empty calls, and latency measured in seconds.

## When to use which

Use a **webhook** when events are **infrequent and need immediate attention**: money received, delivery completed, new message, build finished.

Use **polling** when:

- The other side **doesn't support webhooks** — still the most common reason.
- You need a **full sync** rather than individual events. For example pulling the entire price list overnight.
- Your system has **no public address** for them to call.

In practice many systems use both: webhooks for immediacy, plus a periodic sync to catch anything that slipped through. That isn't redundant — see below.

## Four things to get right

Webhooks sound simple enough that people skip the following four, and then lose data.

### 1. Verify the sender

Your webhook address sits publicly on the internet. Anyone can send it a forged request saying "order paid".

Every serious service signs its requests with a secret key, usually in the request headers. **Always check the signature before trusting any of the data.** Skipping this lets people mark their own orders as paid.

### 2. Tolerate duplicates

A sender that doesn't get a response within a few seconds will **send it again**. One network hiccup and you receive the same event twice.

Handled naively, a customer pays once and the order records it twice. The fix: each event carries an identifier, **store the ones you have processed**, and ignore repeats. This is mandatory, not an optimisation.

### 3. Answer fast, process afterwards

Senders typically wait only a few seconds. If you receive the webhook and then sit there sending email, updating stock and calling three more APIs, you exceed the timeout, the other side considers it failed, and resends.

The correct shape: receive it, check the signature, **write it to a queue, return 200 immediately**, and process in a separate worker.

### 4. Log everything you receive

Including requests matching no order, and requests with bad signatures. When a dispute arises — "I already transferred the money" — the log is the only thing that can answer.

## Why you still want a periodic sync

Webhooks can be lost. Your server restarts exactly as the event arrives, the sender retries a few times and gives up, or they have an outage and send nothing at all.

A nightly reconciliation — pull the day's transactions and compare against what you recorded — catches precisely those cases. It costs little, and it is the difference between "nearly always correct" and "always correct".

## Building the receiving end

The practical obstacle: a webhook needs a **public address that is always running**. Your laptop can't do that, and this is where many small projects stall.

If you **hire a developer**, state the four points above in the requirements — especially duplicate handling, because it is the most commonly missed and the consequences are financial.

With a **drag-and-drop builder**, webhook receiving usually doesn't exist, or requires a third-party add-on.

If you build with [Toolswave](/create-website), you describe it in plain language, along the lines of *"build a shop with a cart, bank transfer payment, and an address that receives bank notifications to mark orders as paid"*. The system generates the code, builds a real database and API and deploys to a public link that runs continuously — so the "somewhere for them to call" part is ready. Do state the signature check and duplicate handling in your description: Toolswave builds what you describe, so what you leave out won't be added for you. There is a free tier with no credit card.

## In summary

A webhook replaces asking "anything new?" 1,440 times a day with one well-timed message. It is faster and cheaper, but in exchange you take on four responsibilities: verify the sender, tolerate duplicates, answer fast and process later, and log thoroughly.

Those four aren't advanced extras. Miss any one and your webhook will behave perfectly in testing and fail once real money is passing through it.
