# OrderBoard — Gmail Password Reset Setup

The app now has a **Forgot password?** button on its original sign-in screen.
Owner and Staff use the same recovery process. Only ACTIVE accounts can reset.
No customer-facing pages, workflow pages, or role permissions were removed.

## 1. Set up a sender Gmail account

1. Use a bakery-owned Gmail account (not a personal Staff account).
2. Enable **2-Step Verification** on that Google account.
3. If **App passwords** is available for that account, create an App Password for OrderBoard.
   Google may not offer this option for some accounts, such as certain managed or
   Advanced Protection accounts. You must use a supported Google account.
4. Treat the 16-character App Password like a secret. Never commit it to GitHub,
   paste it into source files, or send it through chat.

Official documentation: https://support.google.com/accounts/answer/185833

> This implementation uses Gmail's encrypted SMTP connection (`smtp.gmail.com:465`).
> It does NOT use Google sign-in. Users still sign in to OrderBoard using the
> Owner or Staff email and their own OrderBoard password.

## 2. Configure `server/.env`

Open the existing `server/.env` file (or copy `server/.env.example` if missing),
then add/fill in the following lines:

```dotenv
# Gmail account that sends reset messages
GMAIL_USER=yourbakery@gmail.com
GMAIL_APP_PASSWORD=your_16_character_google_app_password

# The OrderBoard website that opens on the recipient's device
RESET_LINK_BASE_URL=http://localhost:5173/

# Defaults, included here for clarity
GMAIL_SMTP_HOST=smtp.gmail.com
GMAIL_SMTP_PORT=465
```

The Gmail App Password may have spaces when copied; the app safely ignores those
spaces. Do NOT use your ordinary Google password.

**Important address examples:**

- For testing on the SAME PC: `RESET_LINK_BASE_URL=http://localhost:5173/`
- For testing on OTHER devices on the SAME Wi-Fi/LAN: use the actual computer's
  LAN IPv4 address, for example `http://192.168.1.15:5173/`. That is only an
  **example**; use your own computer's address. Also update `CLIENT_ORIGIN` to
  the address you actually visit and `client/.env` / `VITE_API_URL` to the
  backend address (for example, `http://192.168.1.15:4000`).
- For access from anywhere, deploy the frontend/backend at reachable HTTPS
  domain names and use `https://your-site.example/` for `RESET_LINK_BASE_URL`.
  When `NODE_ENV=production`, the backend requires reset links to use HTTPS.

The link must be accessible to the recipient. Sending a localhost link to a
phone will NOT work unless the site is running on that phone.

## 3. Start OrderBoard

Run your normal setup from the project root:

```shell
npm install
npm run install:all
npm run dev
```

No new npm package is required for Gmail SMTP; the mailer uses built-in Node.js TLS.
Keep Gmail environment variables only on the BACKEND (`server/.env`), never in
`client/.env` or source code.

## 4. Try password recovery

1. Open OrderBoard and select **Forgot password?**.
2. Enter the registered Owner or Staff account email and click **Email reset link**.
3. Open the email received and click the link.
4. Enter a new password of at least 12 characters and confirm it.
5. Sign in again with the new password. Old sessions are invalidated.

You may need to check Spam. If no email arrives, check the **server terminal**
for an `OrderBoard password reset email could not be sent:` message. This can
indicate a blocked SMTP connection, incorrect Gmail App Password, or a Gmail
account where App Passwords are not available.

## 5. Behavior and security checks

- [ ] Owner account can receive a reset link.
- [ ] Staff account can receive a reset link.
- [ ] Missing or inactive account receives the same generic response (no account enumeration message).
- [ ] Link becomes invalid after 15 minutes.
- [ ] Link becomes invalid immediately after being used once.
- [ ] Password confirmation must match and the password must contain 12–128 characters.
- [ ] The new password cannot be identical to the current password.
- [ ] Resetting signs out every browser for that account.
- [ ] Owner still supports several concurrent sessions AFTER signing in again.
- [ ] Staff still supports only ONE concurrent session AFTER signing in again.
- [ ] A password change while signed in cancels any pending email reset token.
- [ ] Deactivating/reactivating a Staff account cancels outstanding reset tokens.

**Deployment note:** The first update changes the version check to cover both
Owner and Staff. Browsers signed in *before* installing this version may be
signed out and need to sign in again. This is expected; it ensures future
password resets invalidate every role's sessions.

## Local validation performed

- Server JavaScript syntax checks passed.
- React JSX source parsing passed.
- SMTP protocol was tested successfully against a local encrypted mock server,
  including the rejection of invalid SMTP login credentials.
- Live Gmail delivery, MongoDB integration, full Vite build, and manual browser
  tests require your connected environment and **have not** been claimed as tested.
