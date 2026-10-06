title: What a database is, and which kind your software needs
excerpt: A database is where software remembers things. The two common types, how to choose between them, and three design mistakes that force a rebuild.
seoTitle: What a database is and which kind you need
seoDescription: A database is where software remembers things. The two common types, how to choose, and three design mistakes that force you to start over.
---
Turn the machine off and on again, and yesterday's orders are still there. That is what a database does: **remember**. It sounds simple, but this is what decides whether your software stays fast, scales, or has to be rewritten.

This isn't about teaching you to write queries. It is enough to choose correctly and ask your developer the right questions.

## How is it different from a spreadsheet

Plenty of people start with a spreadsheet, and a spreadsheet is entirely fine with one user. It breaks in three places, and all three arrive together with growth:

- **Several people editing at once.** Two staff open the same file and whoever saves last overwrites the other. A database handles this with locks and transactions.
- **Searching large volumes.** Finding one order among 50 rows works by eye; among 50,000 it needs an index.
- **Constraints.** A spreadsheet lets you type "abc" into a money field. A database refuses.

In short: a spreadsheet *holds* data, a database *protects* it.

## The two types you will hear about

### Relational databases

Data lives in **tables** with fixed columns, and tables link to each other through keys. Orders link to customers, order lines link to products.

The strength is **consistency**: you declare "every order must belong to a real customer", and the database won't allow a violation. For anything involving money, stock or seats, this is nearly always the right choice.

### Non-relational databases

Data lives as free-form documents, and each record may have a different shape. Flexible when the structure isn't settled or changes constantly, and easier to scale horizontally.

In exchange, keeping the data clean becomes your responsibility, because nothing stops you writing a record with a missing field.

### Which to pick

For **almost every small or mid-sized business system** — selling, bookings, inventory, CRM — choose relational. Your data genuinely is relational (orders belong to customers, lines belong to orders), and you will want aggregate reports.

Non-relational makes sense for event logs, sensor data, or content where every record differs. Don't choose it because it sounds more modern.

## Three decisions that force a rebuild

### 1. Not storing the price at the time of the transaction

This is the classic mistake. The order-lines table only points at the products table for the price. You raise prices next month and **every historical order rises with them** — the books are wrong throughout, with no way to reconstruct them.

The rule: anything that is *a fact at a point in time* must be **copied**, not referenced. The price, the product name as sold, the delivery address as given.

### 2. Deleting instead of flagging

Deleting a product that has ever been sold corrupts every past order pointing at it. Add a status column and mark it "discontinued". The general principle: data tied to history is never deleted, only hidden.

### 3. Stuffing several things into one field

Storing an address as one long text field, then later needing to filter by province. Storing an order's items as one line of text, then needing to count which product sells best. Every case means separating the data by hand afterwards.

Ask first: **will this ever need filtering, counting or sorting?** If yes, it needs its own column, or its own table.

## Who handles this for you

If you **hire a developer**, ask to see the table diagram before they write code. You don't need to read queries, but you can read table and column names — and you are the only person who knows whether the business logic is right.

If you use a **drag-and-drop builder**, the data layer is usually confined to a fixed shape. Fine for simple lists, awkward when your operation differs from the majority.

A third route is describing it in plain language and letting AI build it. On [Toolswave](/create-website) you type roughly *"build a coffee shop with a cart and an order admin page"*, and the system **builds a real database and API** then deploys to a public link. What matters for this topic: you get a genuine relational database with clear tables and relationships, not a data store hidden behind an interface — so when you need another field or table, you simply describe it. Toolswave has a free tier with no credit card.

Whichever route you take, the three decisions above remain yours. State them explicitly in your description: *"store the price at the time of ordering"*, *"discontinued products are hidden, not deleted"*. No machine knows your business rules on its own.

## A few things to do early

- **Back up regularly and test a restore once.** A backup you have never restored doesn't really exist.
- **Index the columns you search on** — phone number, order code. That is the difference between instant lookup and a few seconds of waiting.
- **Never store passwords as plain text.** Store only a hash, and don't write that part yourself.

## In summary

A database is where software remembers. Choose relational for most business work, copy the facts that were true at transaction time, never delete anything with history, and separate out whatever you will later need to filter.

Those four decisions determine whether your software lasts three years or needs rewriting in six months.
