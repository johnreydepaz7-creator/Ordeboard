# Phase 5 — Demand forecasting and offline safety

## Implementation
- Added Owner-only `GET /api/forecast?days=7|14`, with authenticated sessions and no-store cache.
- Uses 56 fully completed Philippine calendar days and first paid-completed timestamp; zeros on days without sales count in weekday averages.
- Requires 14 qualifying orders and activity on 7 separate dates to avoid showing projections from very sparse history.
- Shows 7- or 14-day expected order counts and sales using day-of-week averages; top historical products for reference.
- New responsive React forecast page and offline connectivity warning.

## Offline scope and limits
- This version intentionally **does not** cache customer/financial data or queue updates while offline. Doing so requires encrypted device storage, conflict management and additional security testing. A detected disconnection displays a warning. Business actions require the server.
- Forecasting is a simple descriptive average, not trained predictive AI, and does not account for holidays, promotions, or seasonality.
- Past orders lacking `paidCompletedAt` are not included; reconcile any historical records first.
- Phase 3 stock adjustments still require MongoDB replica set transaction support.

## Local acceptance tests
1. Sign in as Owner and view the Demand Forecast navigation item. Choose 7 and 14 days.
2. In a database with fewer than 14 qualifying orders, confirm the insufficient data notice and no numeric projection.
3. With at least 14 qualifying orders spanning 7 different selling dates within the last 56 complete days, verify projected values using weekday averages (including zero-sales days).
4. Change notes on an old order; ensure the historical report date does not shift.
5. Sign in as Staff; confirm forecast page hidden and `/api/forecast` returns 403.
6. Try `/api/forecast?days=21` and invalid values; confirm 400.
7. Disconnect Wi-Fi; confirm offline warning and safe failure of server-backed actions (no queued writes).
8. Verify inventory, orders, reservations, cake production, schedules, financial summaries, accounts, and sessions still function.
9. Test UI on iPhone/iPad Safari and desktop; check overflow and data formatting.

## Verification
Syntax checking performed locally for JavaScript backend files. Frontend production build and live MongoDB/browser testing should be completed on your development PC.
