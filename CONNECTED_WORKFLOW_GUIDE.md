# OrderBoard connected workflow update

## What is connected

1. **Orders → Cake Production.** Confirm an order and use **Send to cake**. The cake editor pre-fills customer, contact, product summary, quantity and optional needed-by date. Supply cake size, flavor, production due time and optional inventory usage. The server binds the cake job to the confirmed order, not to arbitrary browser-supplied customer details. Only one production job may be attached to each order. An existing link displays **Cake: [status]** instead of creating duplicates.
2. **Reservations → Cake Production.** Confirm a reservation and use **Send to cake**. The pickup time pre-fills the cake due time. Cake jobs link to reservation IDs, not just matching customer names. The reservation cannot be marked collected until its linked cake is Ready/Completed. Cancel production first if cancelling a linked reservation.
3. **Orders & Reservations → Schedules.** All noncancelled, uncompleted reservations and cakes appear in the calendar as before. Orders with the new optional **Needed by** date now appear as separate scheduled pickup/delivery items, along with overdue / 24-hour reminders. Unscheduled orders aren't shown in the schedule. Each schedule item has an **Open** shortcut to its module.
4. **Cake Production → Inventory.** A cake job has an optional list of inventory materials and **total whole-unit amounts for that job**. When it advances from Queued → Preparing, available inventory stock is deducted atomically, and an audited stock-movement record identifies the cake job. Multiple staff cannot cause the same job to consume stock twice. Stock shortage rejects the transition and leaves job and inventory unchanged. The inventory screen automatically refreshes on return. Cake module has an Inventory shortcut.
5. **Cake Production → Order status.** Linked cake Preparing sets its order to In production; linked cake Ready sets order to Ready. Order status cannot bypass Cake Production while linked. Marking the order Completed remains a separate order-processing step. For a cancelled cake, separately cancel the original order/reservation if appropriate.

## Important design decisions

- Creating an order does **not** automatically create a cake job: bakeries also sell bread and other items. The explicit **Send to cake** action ensures only work that needs custom production enters the production queue, while requiring no repeated customer entry.
- Production due times are independent from order needed-by times or reservation pickup times after creation. This allows a baker to set an earlier internal completion deadline. When changing a pickup date, review the linked cake's deadline too.
- Consumption is recorded when actual preparation **starts**, not when a cake job is created. Changing or cancelling a job does **not** automatically return ingredients; if stock is physically returned, make a documented Stock in adjustment.
- If a job has **no tracked materials**, starting it shows a warning that no inventory will be reduced. This allows old/exempt jobs to continue, while making the omission explicit.
- Stock quantities are **whole units** in the existing Inventory schema. Use units like eggs (pcs), whole bags, or measured batches. This update does not support fractional kilograms or recipe-based automatic conversions.
- MongoDB **Atlas or a replica set** is required for atomic multi-document transitions (stock consumption or synchronizing a linked order). This is consistent with the existing audited manual inventory movements. Unrelated status transitions with no inventory adjustments still work on standalone MongoDB.
- All new server endpoints continue to require the signed-in session. The existing Owner/Staff role checks, idempotency headers, and session rules are unchanged.
- Existing database records remain usable. New fields are optional and don't require deleting collections. Mongoose will create partial unique indexes for the new source references; ensure your MongoDB role permits index creation.

## Update instructions

1. Back up your source and MongoDB data.
2. Extract the **Changed Files Only** ZIP at the project root; preserve folder names and overwrite matching files. Do not delete other files, `.env` files or your database.
3. Stop and restart OrderBoard: `npm.cmd run dev`. For production, rebuild the frontend.
4. Verify that MongoDB supports transactions before testing inventory-linked prep. Check backend logs for connection or index errors.

## Browser and database verification checklist

- [ ] Sign in as Owner and Staff; confirm existing permissions still apply.
- [ ] Create an order (without needed-by): it does not appear on schedule. Add an order needed-by timestamp: it appears on schedule; cancel it: it disappears.
- [ ] Confirm an order → Send to cake: prefilled details are correct. Save cake with a due date and verify the original order now shows **Cake: Queued**.
- [ ] Try to send the **same confirmed order** to production again in another browser. No duplicate linked cake may be created.
- [ ] Confirm a reservation → Send to cake: pickup time pre-fills cake due time. Cannot mark collected before cake Ready.
- [ ] Inventory setup: create items, stock in several units, assign those items and quantities to a queued cake job.
- [ ] Start prep: verify **Cake → Preparing**, linked **Order → In production**, correct stock decreases, and one movement record per ingredient with the source cake ID.
- [ ] Attempt Start prep concurrently in two browser sessions. Exactly one status transition succeeds, and stock is deducted once.
- [ ] Create a cake requiring more materials than available. Start prep must fail without any stock, movement, order, or cake-status changes.
- [ ] Change linked cake Preparing → Decorating → Ready. Linked order should become Ready automatically.
- [ ] Open Schedules, and confirm order, reservation and cake entries and navigation shortcuts work.
- [ ] Cancel a queued linked cake, then cancel its order/reservation. Cancelling the source first should be blocked.
- [ ] Test fast switching, refresh, mobile layout, and session invalidation.

## Validation done here

All 37 JavaScript/JSX source files parsed without syntax errors and the changed server modules passed `node --check`. A full browser build and live MongoDB integration test were **not** possible here because dependencies aren't present in the local npm cache. The checklist above is required before live bakery deployment.
