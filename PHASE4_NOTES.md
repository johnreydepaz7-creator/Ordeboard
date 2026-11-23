# OrderBoard Phase 4 — Reports & Analytics

## Included
- Owner-only `GET /api/reports/overview?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Server validation, bounded dates (approximately one year), no-store cache policy.
- Sales revenue from completed + fully paid orders using the first `paidCompletedAt` event.
- Expenses from recorded expense date; peso cents summed to reduce floating-point error.
- Daily trend, source and category breakdown, top products, order counts and average order value.
- Responsive React report with bars, date filters, explanatory notes and CSV export.

## Limitations
- Historic completed and paid orders lacking `paidCompletedAt` are excluded until reconciled.
- The sales figure counts completed, paid orders and is not independently reconciled to actual deposits, tax or refunds.
- The balance is sales minus recorded expenses, not net profit.
- Daily chart shows only dates with qualifying activity; it does not plot zero-activity dates.
- Full browser and MongoDB tests have NOT been run in this environment.
- npm install/build could not run because packages were unavailable in the offline npm cache.
- Stock adjustments from Phase 3 still require replica-set-supported transactions.

## Test locally
1. Preserve your existing `server/.env` and `client/.env` privately; don't overwrite them from ZIP.
2. Run `npm install`, `npm install --prefix server`, `npm install --prefix client`, and `npm run dev`.
3. Log in as Owner; open Reports & Analytics and generate a current-month report.
4. Create a completed, paid order and verify the report counts it exactly once; then edit a note and check that its report date doesn't change.
5. Record an expense; verify its category, date and total.
6. Test empty dates, reversed dates and a range over one year (should reject invalid ranges).
7. Export CSV and inspect its contents in Excel.
8. Log in as Staff and confirm the reports screen is absent and `/api/reports/overview` denies access.
9. Verify previous order, inventory, reservation, finance, scheduling, staff and session flows.
10. Check iPhone/Safari and desktop responsive layouts.
