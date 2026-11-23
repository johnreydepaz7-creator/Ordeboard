# OrderBoard Phase 3 — integration notes

New features: Inventory item creation and atomic audited stock movements, owner-only expenses and business summary, sales derived from completed fully paid orders. No data is automatically deducted from inventory when an order is completed because ingredient recipes are not configured.

## Important prerequisite
Stock adjustments run as **MongoDB transactions**, which require a replica set (including a single-node replica set in development) or MongoDB Atlas. On standalone MongoDB they return a clear HTTP 503 error and **will not change stock**. Do not disable transactions as a workaround.

## Limitations
- Financial totals are estimates, not a formal accounting ledger or proof of actual payment. Existing order payment status is not a cash receipt log.
- New sales are assigned an immutable first completed-and-paid date. Previously completed/paid orders lack this field and are excluded from date summaries unless safely migrated using independently verified payment records. A future payment ledger is still recommended for accounting use.
- Stock movements are audit records; no deletion endpoint is offered. An incorrect entry should be reversed with another reasoned movement.
- Inventory item editing, expense editing, and stock movement history are available in the interface.
- Expense list limited to 300 recent entries; analytics should use server-side aggregate pagination for high-volume use.

## Test plan
1. Sign in as Owner and visit Inventory, Sales & Expenses, Reports & Analytics.
2. Add an item, receive stock, issue stock, test insufficient stock and duplicate request key.
3. Create a paid order; advance to Completed; verify it appears once in period summary.
4. Add expense; verify operating balance estimate.
5. Sign in as Staff: inventory available, finance endpoints return 403 and navigation hidden.
6. Repeat prior authentication, reservation, cake production, and schedule tests.

## Verification status
Server-side JavaScript syntax checks passed. React production build and live MongoDB/browser integration tests were not completed in this environment (dependency installation timed out). Do not label this production verified until running the checklist below.

## Sales migration note
Older orders that were already completed and paid before the new paidCompletedAt field was introduced cannot be assigned a verified historical payment date automatically. They remain in the Orders module but do not appear in period-based sales totals until manually reconciled with actual business records. Do not backfill them using updatedAt without confirming the payment date.
