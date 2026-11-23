# OrderBoard — Complete Phases 1–5 + Lean Operations UI

OrderBoard is a responsive bakery operations website for **Bakes & Bites**. It includes working orders, reservations, cake production, scheduling, inventory, finance, reporting and forecasting workflows, subject to the setup and testing notes below.

## Faster page switching (new)

The app now fetches the first page of each authorized workspace immediately after sign-in, keeping screens mounted for instant-feeling navigation. The daily work lists update quietly while visible, and Refresh always checks the server. Cached data stays **in browser memory only** and is discarded when signing out or when a session is invalidated. See `WORKSPACE_PRELOAD_NOTES.md` for details and live testing steps. Startup may take longer while preparing the workspace; page switching should be faster afterward.

## What's new in this version

**Lean operations update:** The previous large dashboard banner and card-heavy lists are now compact. Orders, reservations and cake production use aligned action rows that fill the available desktop width. On phones, the rows rearrange vertically. Inventory adjustments are presented in full-width rows. The navigation is narrower and can be collapsed on desktop with **Alt+B**. Press **/** when not typing to focus a visible list search. **Alt+R** opens a new reservation, and **Alt+N** opens a new order. The sign-in page has fewer decorative elements.


- **Live operations dashboard:** actionable totals for pending/active/ready orders, pickups due within 24 hours, active cake jobs and low-stock items. Includes quick links to the matching workflow.
- **Quick actions:** create an order or reservation from the dashboard; create orders and reservations from the dashboard and their corresponding work lists. Keyboard shortcuts: **Alt+1** dashboard, **Alt+2** orders, **Alt+3** cake production, **Alt+N** new order (when not typing).
- **Faster queues:** search requests are debounced, old responses cannot overwrite newer ones, filters can be selected directly, and records use easy-to-scan status badges and next-step buttons.
- **Fewer taps:** routine status advancement needs one click, while final completion/collection and cancellation require confirmation.
- **High-volume entry:** **Save & new** creates an entry and resets the form for the next customer. The server continues to use unique idempotency keys to prevent duplicate creation.
- **Responsive layout:** readable mobile cards, scrollable filters, simplified nav on small screens, touch-friendly buttons, consistent forms, and keyboard-accessible pop-ups.
- **Quiet dashboard refresh:** updates every 45 seconds when its page is open and visible, without wiping out the screen. A manual refresh button is also provided.

The new `/api/dashboard` endpoint checks authentication before returning the operational summary. It deliberately does **not** return owner-only sales or expense data to Staff.

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB Community Server or MongoDB Atlas
- A modern browser such as Chrome, Edge, or Safari

## First-time setup

1. Extract the project ZIP and open the extracted folder in VS Code or PowerShell.
2. In the project folder, run `npm.cmd install` and `npm.cmd run install:all` (PowerShell/Windows) or `npm install` and `npm run install:all` (macOS/Linux).
3. Copy `server/.env.example` to `server/.env`. Configure `MONGODB_URI`, `JWT_SECRET` (at least 32 characters), and `CLIENT_ORIGIN` (the exact frontend origin, such as `http://localhost:5173`).
4. Copy `client/.env.example` to `client/.env`. Set `VITE_API_URL` to your API origin, such as `http://localhost:4000` for a local PC.
5. **Only for a first-time database with no owner:** run `cd server` then `npm run create-owner -- "Bakery Owner" owner@example.com (enter the password at the hidden prompt)`, then `cd ..`. Replace the example values first.
6. From the project root, run `npm.cmd run dev` (Windows) or `npm run dev` (macOS/Linux).
7. Open `http://localhost:5173` in the browser and sign in.

### Updating an existing OrderBoard installation

Back up your working source and database first. Replace your project source with this version, **keep your existing `server/.env` and `client/.env` files**, and run the two install commands above. **Do not re-create the owner account** or drop MongoDB collections. This refresh adds one authenticated read-only dashboard endpoint; no existing database migration is required.

Do not commit `.env`, JWT secrets, connection strings, or passwords to GitHub.

## Deploy on Render with MongoDB Atlas

The included [Render Blueprint](render.yaml) builds the Vite client and serves it with the Express API from one HTTPS URL. The browser uses relative `/api` requests, so leave `VITE_API_URL` unset for the hosted build. Render supplies the service URL and generates a `JWT_SECRET` during setup.

1. Create a MongoDB Atlas Free cluster and a database user with read/write access to the `orderboard` database. Use the Atlas driver connection string and include `/orderboard` as the database name before the query string. Use a separate database for the thesis demo.
2. Push the contents of this project folder to a Git repository with `render.yaml` at its root. In Render, choose **New → Blueprint**, connect that repository, and supply the Atlas connection string as `MONGODB_URI`.
3. In the Render service dashboard, copy the ranges from **Connect → Outbound** into the Atlas project's IP access list. If the first deploy timed out while connecting to Atlas, redeploy after adding the ranges. Check that `/api/health` returns HTTP 200 and that the service URL opens the sign-in page.
4. For an empty database, temporarily add your computer's public IP to the Atlas access list. From the `server` folder, install dependencies with `npm ci` and run `npm run create-owner -- "Bakery Owner" owner@example.com` with `MONGODB_URI` set locally to that same Atlas database. Enter the password at the hidden prompt. Verify sign-in and remove your temporary IP entry when finished. For existing data, sign in with the existing owner account.

For hosted password resets and account email changes, set `RESEND_API_KEY` and `RESEND_FROM` in the Render dashboard. Use a sender on a domain verified in Resend for delivery to staff and owner addresses. The default email link points to the Render service URL. For a custom domain, set `CLIENT_ORIGIN` to its HTTPS origin with no trailing slash and use that same domain when signing in. Set `RESET_LINK_BASE_URL` only if the account links need an explicit frontend URL. Local development can continue using Gmail SMTP.

Render Free can take about a minute to wake after inactivity. Use sample data for the demo, and arrange separate database backups before storing bakery records. See the [Render Free limits](https://render.com/docs/free), [Atlas connection guide](https://render.com/docs/connect-to-mongodb-atlas), and [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).

## Main sections and role access

| Page | Owner | Staff |
| --- | :---: | :---: |
| Dashboard; Orders & Reservations; Cake Production; Schedules; Inventory | Yes | Yes |
| Sales & Expenses; Reports & Analytics; Demand Forecast | Yes | No |
| Staff Accounts | Yes | No |
| Account Security | Yes | Yes |

**Account session rules:** An Owner can sign in on multiple devices. Each Staff account has only one active session; a later sign-in invalidates the earlier one at the server. Deactivated Staff cannot sign in or use protected routes. Account Security supports session revocation, sign-in history, and password changes.

## Mobile / Apple device access

The interface is a responsive website, not a native iOS application. It works in modern Safari and other mobile browsers when the frontend and API are reachable. On an iPhone, `localhost` means **the iPhone**, not your development computer. For a local network, set the frontend API address to a reachable server address and configure `CLIENT_ORIGIN` to the exact frontend address. Use HTTPS and appropriate secure-cookie/site settings before real production or cross-site deployments.

## Scope and safety notes

- The dashboard displays recent priorities rather than every record. Individual modules remain the source for full records, with server pagination.
- Status transitions remain enforced on the **server**, not merely by hiding frontend buttons.
- For production, perform a deliberate security review (HTTPS, CORS/cookie settings, CSRF protections, secret management, access policies, backups, audit logging and automated tests). Local demo configuration must not be exposed to the public internet without this work.
- Forecasts are estimates based on qualifying historical paid and completed orders. They are not guaranteed.
- An offline warning is available; the app does **not** accept offline submissions or cache sensitive business/customer data for offline use.

See `LEAN_UI_CHANGELOG.md` for the latest design changes and a targeted regression checklist. See `UI_REFRESH_NOTES.md` for the previous UI update and broader manual tests. `PHASE3_NOTES.md`, `PHASE4_NOTES.md`, and `PHASE5_NOTES.md` are historical phase-specific references.


## Forgot password

Owner and Staff can reset their password from the login screen using an expiring, single-use email link. See the Render deployment instructions above for hosted email or [PASSWORD_RESET_SETUP.md](PASSWORD_RESET_SETUP.md) for local Gmail setup, test cases, and LAN deployment notes.


## Database resets and lost-email recovery (new)

The login page warns when the database has no accounts and directs installation to a LOCAL first-time setup; it never creates an Owner from an unauthenticated browser. Account Security now supports verified email changes when the original inbox is unavailable. The authorized installer can recover a locked-out Owner account using an offline recovery key configured in advance. See **[OWNER_RECOVERY_AND_DATABASE_GUIDE.md](OWNER_RECOVERY_AND_DATABASE_GUIDE.md)** for preparation, backup/restore, and full testing instructions. Backups are a separate operational responsibility and are NOT automatically created by this release.
