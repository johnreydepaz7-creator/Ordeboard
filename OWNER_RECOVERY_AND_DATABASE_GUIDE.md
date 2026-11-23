# OrderBoard — Database Reset and Lost-Email Recovery

This update adds safe recovery paths **without** creating a public "become Owner" button. The process assumes the system installer controls the local Node.js server and `server/.env`.

## First: protect your existing data

- **Deleting a MongoDB database deletes the stored records.** Recreating an Owner account does not restore orders, reservations, inventory, cake jobs, sales, or login history.
- Plan regular, encrypted, access-controlled backups using `mongodump` or a managed MongoDB backup service. Keep a copy **outside** the database/server and practice a restore on a test database. Never include backups in GitHub.
- Keep `server/.env`, MongoDB credentials, and your saved OFFLINE recovery key safe and separate from source-code ZIP files.
- Database backups contain personal/customer information. Limit access, use encryption at rest, and follow applicable retention requirements.

### Example local MongoDB backup and restore (Windows PowerShell)

The MongoDB **Database Tools** must be installed separately and `mongodump`/`mongorestore` available on PATH. Stop OrderBoard writes or plan a consistent snapshot before backing up an active standalone database. These examples assume the local database name is `orderboard` and MongoDB is running on the same PC.

```powershell
# Make a backup. Choose a protected destination outside the OrderBoard project.
New-Item -ItemType Directory -Force "C:\OrderBoardBackups" | Out-Null
mongodump --uri="mongodb://127.0.0.1:27017/orderboard" --gzip --archive="C:\OrderBoardBackups\orderboard-backup.archive.gz"

# AFTER confirming the destination database is empty, restore the same archive:
mongorestore --uri="mongodb://127.0.0.1:27017/orderboard" --gzip --archive="C:\OrderBoardBackups\orderboard-backup.archive.gz"
```

**Do not** use `--drop` casually; it erases existing collections before restoration. For remote MongoDB or Atlas, use your actual secured connection and the provider's backup/restore facilities. Do not put passwords in shared screenshots or terminal history.

## Scenario A: the entire OrderBoard MongoDB database is empty

1. The login screen displays a warning when `/api/setup/status` detects **zero account records**. The web application does NOT accept public Owner registration.
2. **Restore a database backup first** if you need historical orders/records. If restored successfully, existing accounts return and no new Owner setup is needed.
3. If this is intentionally a new installation and there is no backup, on the **server computer**, run:

```powershell
cd "path\to\OrderBoard\server"
npm.cmd run create-owner -- "Bakery Owner" "new-owner@example.com"
```

4. Enter a new strong password at the hidden terminal prompt. Restart/refresh OrderBoard, then sign in. The `create-owner` script **refuses to run if any account already exists** (including Staff). This avoids using "initial setup" as a shortcut for taking over an existing database.
5. Recreate Staff accounts, inventory, and operational records if the old data could not be restored.

## Scenario B: Owner is signed in but cannot access the old email

1. While signed in, open **Account Security → Change sign-in email**.
2. Enter a **new accessible email address** and your **current OrderBoard password**.
3. Open the one-time confirmation link sent to the **new email** (valid 15 minutes).
4. Confirm it. Your login email changes only now. All old sessions are revoked, and you sign in again using the new email and existing password.
5. A security notice is attempted to the old email; that inbox may no longer be reachable.

Important: Gmail SMTP credentials in `server/.env` must be configured, and `RESET_LINK_BASE_URL` must point to the frontend URL reachable by the email recipient. This feature does **not** require access to the old email.

## Scenario C: Owner is fully locked out, forgot email, or lost both email and password

OrderBoard does **not** reveal the registered Owner email to unauthenticated visitors, answer "security questions", or let an anonymous person register a new Owner. The authorized installer must use the **separate offline recovery key** from the server terminal.

**One-time preparation — do this now, before the emergency:**

```powershell
# Run from the project ROOT (not the server folder):
npm.cmd run recovery-key --prefix server
```

This command prints:
- The **private recovery key**: write it down, store offline or in a password manager, and **do not put it in `.env`, chats, emails, screenshots, or GitHub**.
- A one-way SHA-256 hash: put ONLY the hash as `OWNER_RECOVERY_KEY_HASH=...` inside `server/.env`. The hash alone cannot authorize recovery.

**During a lockout:**

```powershell
# Run from the project ROOT on the trusted server computer:
npm.cmd run recover-owner --prefix server
```

The local command prompts for the offline recovery key, a replacement email, and a new password (password/key keystrokes are hidden). It updates only the existing Owner account; orders/other business records remain. It revokes all Owner sessions and outstanding reset/verification tokens. Restart the web app if its environment settings were changed.

**If the offline recovery key is lost and the Owner is locked out:** there is intentionally no unsecured website bypass. Use your organization's documented authorized database/hosting administration process, and involve the legitimate administrator. A backup may restore older credentials/data, but it does not prove who owns the account. Configure a fresh offline key after control has been legitimately re-established.

## Scenario D: Staff email is no longer available

- If Staff can still sign in: use **Account Security → Change sign-in email**, with their current password and a confirmation link sent to the new mailbox.
- If Staff cannot sign in: contact the Owner. The existing Staff Accounts page lets the Owner deactivate the inaccessible account and create a replacement after verifying staff identity. Existing records and audit associations for the original Staff account are not automatically transferred to the new one.

## Security details and limits

- Email change checks the current password and confirms control of the **new** inbox with an unpredictable, one-time token valid for 15 minutes. Tokens are stored hashed and revoked after use.
- Password and email changes revoke existing sessions; the Owner still supports multiple simultaneous sessions during normal login, while each Staff account is limited to one active session.
- Local recovery requires the saved offline recovery key and local server-console access; there is no public recovery endpoint.
- An attacker who already controls the Windows administrator account, MongoDB credentials, or server environment can compromise the installation. Protect the computer and backups appropriately.
- The empty-database check only detects **zero account records**. It cannot tell you whether orders were lost when accounts remain; proper backup monitoring is still required.
- This update does **not** implement automated backups or a guaranteed recovery from an unbacked-up database deletion.

## Basic manual checks

1. With existing Owner and Staff, `/api/setup/status` should return `initialSetupRequired: false`.
2. With a **separate disposable test database**, no accounts should result in `initialSetupRequired: true`. Verify first-time setup is performed ONLY by the local script.
3. Sign in, request an email change, verify the old email still signs in **before** confirmation, then confirm using the new inbox. Old sessions should be rejected afterward.
4. Confirm expired/reused links fail and wrong current passwords cannot request changes.
5. Generate and store a recovery key/hash. Using a **test Owner**, verify that the correct key can recover email/password and a wrong key changes nothing.
6. Make a test backup and test restore in a **different** database. Never delete the real business database merely to test this feature.
