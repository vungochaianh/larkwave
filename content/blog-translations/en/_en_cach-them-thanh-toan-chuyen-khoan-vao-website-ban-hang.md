title: How to add bank transfer payment to your online shop
excerpt: Bank transfer is still the cheapest and most common way to collect money for online shops in Vietnam. The standard flow, QR codes, and how to reconcile payments.
seoTitle: Add bank transfer payment to your online shop
seoDescription: Bank transfer is the cheapest way to collect money online in Vietnam. The standard payment flow, generating QR codes, and three levels of reconciliation.
---
Bank transfer remains one of the two payment methods Vietnamese buyers use most when shopping online, alongside cash on delivery. For a shop owner it is also the cheapest way to collect money: **no payment gateway fees**, money straight into your account, no waiting for a T+1 or T+3 settlement cycle.

But "adding bank transfer" isn't just pasting an account number onto the checkout page. The hard part is **knowing which order has been paid**. Here is what to prepare and the levels of automation you can choose between.

## Preparation

### Receiving account details

The minimum: bank name, account number, account holder name (exactly as the bank has it, unaccented). If you issue invoices, use a **business account** rather than a personal one — it also makes connecting to a bank API easier later.

### A convention for the transfer reference

This is the most important detail and the one most often skipped. Each order needs a **unique reference code**: short, unaccented, no special characters — for example `DH1042` or `TW1042`. The buyer puts this in the transfer description, and you use it to match money to orders.

A practical note: many banking apps truncate or alter the transfer description, so the shorter the code the safer. Avoid using a phone number as the code — they collide and are hard to look up.

### The QR code

**VietQR** is the shared QR payment standard used across banks via the Napas 247 system. You can generate a QR image that already contains the account number, amount and transfer description, so the customer only has to scan and confirm. This substantially reduces mistyped amounts and forgotten order codes.

## The standard payment flow

![The standard payment flow](https://apia.toolswave.net/uploads/images/1789694271766-1cb75ff7.png)

A bank transfer flow that works usually has five steps:

1. The customer orders and selects **Bank transfer**.
2. The system creates the order in a `pending payment` state with a reference code.
3. The thank-you page shows the QR code, account details, amount and transfer description — each with a copy button.
4. An email or message repeats that information, in case the customer closes the tab.
5. When the money arrives, the order moves to `paid` and the customer is notified.

Step 5 is where manual and automated approaches diverge.

## Reconciliation: three levels

![Reconciliation: three levels](https://apia.toolswave.net/uploads/images/1789694347076-7aa0e81f.png)

### Manual

You open your banking app, compare, and confirm in the admin page. Fine below roughly 20 orders a day. Cheap and dependent on nobody, but slow and easy to miss during a rush.

### Semi-automatic

Let customers upload a screenshot of the receipt, stored against the order so you can approve quickly on one screen. It doesn't verify anything automatically, but it cuts lookup time.

### Automatic via API

Some banks offer balance-change APIs for business accounts; there are also intermediary services that read transactions and fire a webhook at your system. On receiving a webhook you find the reference code in the transaction description, check the amount, and update the order.

Always **check the amount as well**, not just the order code — and log every transaction received, including those matching no order.

## How to implement it on the site

With a **drag-and-drop builder** you usually depend on whatever third-party add-on exists: fast if it fits, awkward when you want to change the reference format or the approval flow. With **hiring someone** you control everything but pay in time and money.

Another route is building it directly with AI. On [Toolswave](/create-website) you describe the requirement in plain language — for example *"build a coffee shop site with a cart, bank transfer payment generating a QR code per order, and an admin page to confirm payment received"* — and the AI generates the code, creates a real database and API, runs the build, shows a preview and deploys to a public link.

The difference from the traditional route: this is **not drag-and-drop and not a prebuilt template**. The orders table, the payment status and the webhook endpoint are real source code, so when you want to change the reference format or add an approval step, you simply describe the next requirement. Toolswave has a free tier with no credit card, deploys for real on Cloudflare, and supports custom domains.

## Common mistakes

- **Not stating the exact amount** — the customer transfers slightly less and nothing matches automatically.
- **Expiring orders too quickly.** Many people transfer hours later; allow at least 24 hours.
- **Showing the account number as an image**, so customers can't copy it.
- **Having no channel for exceptions** — wrong account, overpayment, or a missing reference.

## In summary

Bank transfer is easy to start with and costs almost nothing, but it only runs smoothly with clear reference codes, QR codes carrying the right amount, and a reconciliation process matched to your volume. Start manual, measure how long confirming orders takes each day, and automate once that number starts to hurt.

## Read more

- [How to build an online shop without knowing how to code](/blog/cach-tao-website-ban-hang-online-khong-can-biet-lap-trinh)
