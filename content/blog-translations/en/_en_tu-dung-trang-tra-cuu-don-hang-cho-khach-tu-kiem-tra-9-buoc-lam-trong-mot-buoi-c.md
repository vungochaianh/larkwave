title: Build an order tracking page customers can check themselves: 9 steps in one afternoon
excerpt: Nine steps to build an order tracking page so customers can check delivery status themselves: safe lookup keys, order statuses, and an admin page that gets used.
seoTitle: Build an order tracking page customers check themselves
seoDescription: Nine steps to an order tracking page customers use themselves: a safe lookup key, clear statuses, and an admin page staff will actually update.
---
How much time do you spend each day answering "where's my order?". For a small online shop, messages asking about order status often fill nearly half the inbox — and most of them can be automated away with **a single tracking page**.

Here are nine steps to build one yourself, even without knowing how to code.

## 1. Work out exactly what the customer needs to know

Customers don't need to see all the order data. They need three things: **what status the order is in**, **the expected delivery date**, and **who to contact if something is wrong**. Keep to those three and the page stays compact and understandable within five seconds.

## 2. Choose a lookup key that is both memorable and safe

![Choose a lookup key that is both memorable and safe](https://apia.toolswave.net/uploads/images/1789711950899-87021c34.png)

Don't allow lookup by a sequential order number alone (1001, 1002…), because anyone can guess somebody else's order. A good balance is requiring **the order code plus the last 4 digits of the phone number**, or generating a long random code like `TW-8KD24M`. You trade a little convenience for a great deal of safety.

## 3. Map the status lifecycle before building anything

Write the order statuses on paper, matching how you genuinely operate, for example:

1. Received
2. Preparing
3. Handed to courier
4. Out for delivery
5. Complete / Returned

Each status should come with **one plain-language sentence** so customers don't have to guess. This list is the backbone of both the tracking page and the admin page.

## 4. Settle the minimum data to store

A workable orders table usually needs only: order code, customer name, phone, item list, status, tracking number, expected delivery date, internal notes. Keep **internal notes** (visible only to you) strictly separate from **customer notes** (shown publicly). Mixing those two fields is a very common mistake and a painful one to unpick later.

## 5. Build the page by describing it, rather than dragging blocks

This is the step most people expect to be hardest and is now the fastest. Instead of assembling blocks in a drag-and-drop tool, or hiring someone and waiting weeks, you can describe it in plain language on [Toolswave](/create-website): "build an order tracking page where customers enter an order code and the last 4 digits of their phone to see the status, plus an admin page where I update order statuses".

### How is that different from the traditional route?

A drag-and-drop tool gives you a handsome interface while the data stays out of reach — real tracking needs **a real database and API**. Toolswave generates the code, builds the database, runs the build, shows a preview and deploys to a public link, so the page works immediately rather than stopping at a mockup. There is a free tier with no credit card, and custom domains when you want `tracking.yourshop.vn`.

## 6. Build the admin page before opening it to customers

A tracking page is only useful if statuses are updated promptly. You need a simple admin screen: find an order, change status in one click, paste a tracking number, adjust the expected date. If updating takes more than 10 seconds per order, staff will skip it and the tracking page becomes useless.

## 7. Block scraping and hide sensitive details

Show a shortened address ("District 3, HCMC") rather than the full one, and mask the phone as `09****789`. Add a **limit on failed lookups** per IP, say 10 in 5 minutes, to stop anyone enumerating codes. Small details, but they are the line between a convenient page and a customer-data leak.

## 8. Put the tracking link where customers will look

A good page nobody finds still won't reduce your messages. Put the link in the **order confirmation message**, in your shop's auto-reply, your email signature and your page's cover image. Include the order code in the message so customers just tap and look.

## 9. Measure after two weeks

Count status-enquiry messages for the two weeks before and the two weeks after launching. If they haven't dropped noticeably, it is usually one of three causes: customers can't find the link, statuses are updated too slowly, or the status wording is confusing. Fix the actual cause rather than adding features.

## To sum up

An order tracking page is not a big project — it is **one data table, one lookup box and an admin page**. Get the lookup key, the status lifecycle and the updating habit right and you will win back hours every week. The technical build, which used to be the largest barrier, is now just a matter of describing clearly what you want.
