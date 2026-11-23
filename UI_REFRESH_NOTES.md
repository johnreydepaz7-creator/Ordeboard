# OrderBoard — Fast-Paced UI/UX Update (October 27, 2026)

## What was changed

### Dashboard
- Replaced phase-one placeholder dashboard with authenticated operational totals and work lists.
- Quick creation buttons for orders and reservations, plus clickable summary cards and deadline rows.
- Queue for recently updated Pending and Ready orders; deadline list for active cakes/pickups due within 24 hours or overdue.
- Low-stock and cake-production summaries; manual refresh, plus quiet refresh every 45 seconds while visible.
- Server file: `server/src/routes/dashboard.js`; registration in `server/src/index.js`.
- UI file: `client/src/Dashboard.jsx`.

### Fast data entry and queue workflows
- Status filter chips for orders, reservations and cake production; more compact cards; easy-to-scan status and payment badges.
- Debounced search (300 ms) and ignored stale responses. Server pagination preserved.
- Primary next-step action separated from Edit and Cancel.
- Nonfinal status moves take one click. Final status changes and cancellations still confirm.
- **Save & new** makes consecutive submissions possible without reopening the modal. Each newly created record receives a **fresh idempotency key**.
- Duplicate prevention, session requirements and role checks remain server-side.
- Shared controls in `client/src/WorkflowUI.jsx`.

### Navigation / accessibility
- Sticky topbar and quick new-order action.
- Keyboard shortcuts (when not typing): Alt+1 Dashboard, Alt+2 Orders, Alt+3 Cake, Alt+N New Order.
- Closeable mobile navigation drawer, touch-friendly buttons, visible keyboard focus, mobile overflow handling, reduced-motion preference support.
- No analytics or sales figures are shown on the shared Staff dashboard.

## Manual regression checklist (complete with real MongoDB)

1. Sign in as Owner and Staff. Verify that Staff cannot access owner-only pages or APIs.
2. Dashboard counts: add an order, refresh dashboard, verify Pending increases. Move through Confirmed → In production → Ready → Completed and verify counts update on refresh. Verify Active includes Confirmed and In production.
3. Click a dashboard work item or summary. Confirm the correct page/tab/filter opens. Click New order from the top bar and Alt+N (outside text inputs). Test keyboard focus in each modal.
4. Create multiple orders using **Save & new**. Verify each is stored **once**. Repeat for reservations and cake jobs. Refresh the page and confirm persistence.
5. Search quickly for several names. Confirm the displayed result matches the last search. Test status filters and pagination.
6. Advance statuses with one click; verify final completion/collection and cancellation prompt for confirmation. Verify the server blocks impossible status jumps.
7. Check overdue and near-term cake/pickup deadlines, and inventory at/below reorder level.
8. Verify inventory movements, finance entries, reports/CSV, forecast, staff management, account security and logout are unchanged.
9. Test responsive layout at 320px, 375px, 768px, and desktop; test Safari on a real iPhone/iPad and Chrome or Edge on Windows.
10. Test a second Staff sign-in invalidates the first session, and that Owner can have concurrent sessions.
11. Disconnect the API or internet: confirm a clear failure message and that no offline transaction is silently recorded.

## Validation performed on this package

- All JSX sources passed TypeScript's JSX transpilation/syntax diagnostics.
- All backend JavaScript source files passed `node --check`.
- A full Vite production build, MongoDB integration tests and device/browser interaction tests were **not** completed in this environment. Before deploying, run `npm run build --prefix client`, then execute the manual checklist on your real configured installation.

## Intended behavior and limits

- Dashboard totals are read-only queries and do not change the existing collections. No database migration is necessary.
- Ordinary actions do not prompt, but completing/collecting an item remains an irreversible workflow step and therefore requires confirmation.
- The dashboard periodically refreshes **only while open and visible**; other lists refresh when opened, filtered, manually refreshed, or changed by the user.
