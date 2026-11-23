# OrderBoard — Lean, Fast-Paced UI/UX (October 27, 2026)

## Purpose
Maximize space for active bakery work. Avoid large decorative blocks and repeated controls, while keeping essential actions easy to reach, especially on phones and busy workstations.

## Updated files
- `client/src/main.jsx`: header title replaces repeated page introduction; slim sidebar plus desktop collapse toggle; simpler sign-in; shortcut keys Alt+B, Alt+R and /; avoids repeated creation controls within the order module.
- `client/src/styles.css`: compact, responsive layout; denser data rows; a wider work area; fewer shadows, gradients, animations, excess margins and external font requests; quicker forms and inline inventory presentation.
- `client/src/WorkflowUI.jsx`: reusable OperationsHeader/OperationsRow layout for consistent queues.
- `client/src/Orders.jsx`, `client/src/Reservations.jsx`, `client/src/CakeProduction.jsx`: full-width list rows with short stage actions, details, timing and compact metadata; create/edit/status handlers unchanged.
- `client/src/Dashboard.jsx`: lean shift header, smaller status tiles, smaller work queue cards, and direct links.
- `README.md`: navigation and setup notes.

## Keyboard (only while logged in and not editing a field)
| Key | Behavior |
|---|---|
| Alt+1 | Dashboard |
| Alt+2 | Orders and reservations |
| Alt+3 | Cake production |
| Alt+N | Create new order |
| Alt+R | Create reservation |
| Alt+B | Collapse / expand desktop navigation |
| / | Focus the current queue's search field (when visible) |

## What was intentionally preserved
- Existing backend routes, database models, permissions, cookie/session rules, staff restrictions and audit history.
- Search queries, server pagination, status transitions, idempotency keys, and Save & new workflows.
- Confirmation before completing, collecting or cancelling work.
- All other Owner and Staff modules and access rules.

## Suggested manual checks on your actual server + MongoDB
1. Owner and Staff sign in/out and revisit all allowed pages. Staff must not see or reach owner-only functions.
2. Create several orders, reservations and cake jobs using Save & new; check that each record is stored only once.
3. Find names with the / shortcut, try all filters and page changes. On desktop, rows should remain aligned; on phone, rows should stack and actions should stay visible.
4. Use next-stage action on pending/in-progress/ready records. Cancel or complete only after the confirmation prompt.
5. Check sidebar collapse and refresh. Verify Alt+B, Alt+N and Alt+R while focus is outside forms, and verify the shortcuts do not steal keystrokes inside forms.
6. Test inventory stock-in, stock-out, reason/history and low-stock visibility using the full-width layout.
7. Review schedule reminders, finance, reports, forecasting, Account Security, staff accounts and password-change session invalidation.
8. Check screen widths 320, 375, 768, 1024 and 1440 pixels; test Safari on a real iPhone/iPad.
9. Check screen-reader names for icon-only navigation controls. Press Escape in open edit dialogs and use keyboard Tab to reach actions.
10. Simulate a disconnected API; error feedback should remain readable and no transaction should be silently accepted.

## Validation in this environment
- TypeScript compiler successfully parsed/transpiled all frontend JSX files to JavaScript (syntax check; no dependency-based build).
- Generated frontend JavaScript files passed `node --check`.
- Backend JS files passed `node --check`; they were not modified.
- CSS delimiter counts were checked. Full Vite production compilation, browser layout interaction tests and MongoDB integration tests were not possible here. Perform the manual checks above before a live deployment.

## Upgrade
Make a backup before replacing files. Use either the complete package or copy only the changed files, keeping the folder structure. Keep your existing `client/.env`, `server/.env` and MongoDB data; no new schema migration is needed. Do not commit secrets to a repository.
