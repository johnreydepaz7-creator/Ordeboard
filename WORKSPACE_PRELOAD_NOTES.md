# OrderBoard fast navigation update

## What was changed

OrderBoard now prepares the main daily-operation screens after authentication, then **keeps the React pages mounted** for the life of that signed-in session. Changing between Orders & Reservations and Cake Production normally becomes a visibility change rather than a page remount.

- The first page of Orders, Reservations, Cake Jobs, Schedule, Inventory and Dashboard is fetched when the session starts. Owner-only reports, finance and staff data are prepared only for Owner accounts. Account Security is also loaded; the server always enforces permission checks.
- The startup read queue uses at most four simultaneous API requests. It waits for those initial reads, with a seven-second escape hatch if something is slow/unavailable; it cannot guarantee zero delay if the database, network or server is slow.
- A short-lived **in-memory-only** read cache shares simultaneous GET requests. No order, customer or security information is stored in localStorage or on disk.
- Switching pages keeps existing search/filter/pagination state and records displayed while requesting updated records from the server. The Orders, Reservations and Cake Production work lists also check for new information every 20 seconds **only while visible**, and pause while a form is open or a mutation is in progress.
- The Refresh buttons bypass the cache. Successful creation, edits, status changes, and other writes invalidate cached reads immediately.
- Pages with zero records don't return to a "Loading" placeholder on routine refreshes.
- Successful logout, account change, or server-side 401 session invalidation discards the complete cached workspace and signs the user out. Owner-only screens aren't mounted for Staff.
- Hidden order, reservation and cake forms close on navigation so they don't lock page scrolling.

## How to update an existing project

1. Back up your current source code and database first.
2. Extract **OrderBoard_Fast_Navigation_Changed_Files.zip** into the OrderBoard project root, preserving the folder structure. Allow the changed source files to overwrite their older versions. Do not delete any other files.
3. Keep your existing `client/.env`, `server/.env` and MongoDB database. There are **no database or backend changes** in this update.
4. Stop the development server and start it again from the project root:

   ```powershell
   npm.cmd run dev
   ```

5. Refresh OrderBoard and sign in again to start a new preload cycle. If using a production build, rebuild and redeploy the client.

## Manual checks (real browser + running API / MongoDB)

- Owner sign in: the main workspace appears after initial preparation; rapidly switch Orders -> Cake Production -> Reservations -> Orders without a blank list or page loader.
- Staff sign in: the fast workspaces load, and Owner-only finance/reporting/staff account screens remain unavailable.
- Create an order, change its status, then return to the orders list. Check that the newly saved data is visible and the list is not duplicated.
- From another browser, update an order or cake job. While the affected list is visible, verify it picks up the change within ~20 seconds, or immediately after using Refresh.
- Open a New Order popup, navigate to Cake Production, then confirm the new page can scroll and interact normally.
- Check search, pagination, Save & new, manual refresh, dashboard shortcut navigation, and keyboard shortcuts.
- Deactivate the signed-in staff account or sign it in from another browser. Within the next authenticated API check (up to ~20 seconds on an active work list), the first browser should return to sign-in and discard cached information.
- Disconnect the API and verify errors are shown rather than remaining on a permanent startup loading screen.
- Test in Chrome/Edge desktop and Safari mobile, including a narrow viewport.

## Validation completed here

- JavaScript/JSX syntax: 37 files passed using TypeScript's JSX parser.
- Automated simulated-network checks passed for concurrent request de-duplication, cached reads, forced fresh reads, write invalidation, Staff vs Owner initial reads, the four-request concurrency limit, and revoked-session handling.
- A full Vite production build and real MongoDB/browser workflows could **not** be completed in this environment because the required npm packages are not available in the local package cache. Complete the manual checks above before using it in a live bakery.
