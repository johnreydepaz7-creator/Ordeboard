// Account email uses Resend over HTTPS on Render and Gmail SMTP in local setups.
import tls from 'node:tls';

const EMAIL_PATTERN = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

function usesResend() {
  return process.env.RENDER === 'true' || process.env.EMAIL_PROVIDER === 'resend';
}

export function emailIsConfigured() {
  const hasCredentials = usesResend()
    ? process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim()
    : process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim();
  if (!hasCredentials || !process.env.RESET_LINK_BASE_URL) return false;
  try {
    const url = new URL(process.env.RESET_LINK_BASE_URL);
    if (!['https:', 'http:'].includes(url.protocol)) return false;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    return true;
  } catch { return false; }
}

// Read SMTP replies, which can be single lines or several lines starting with "250-".
// The queue prevents losing a reply if Gmail sends it before the next read starts.
function createReplyReader(socket) {
  let remainder = '';
  let current = [];
  const complete = [];
  const waiting = [];
  let failure = null;

  function rejectAll(error) {
    failure = error;
    while (waiting.length) waiting.shift().reject(error);
  }

  socket.on('data', chunk => {
    remainder += chunk.toString('utf8');
    let newline;
    while ((newline = remainder.indexOf('\n')) !== -1) {
      const line = remainder.slice(0, newline).replace(/\r$/, '');
      remainder = remainder.slice(newline + 1);
      if (!/^\d{3}[ -]/.test(line)) {
        rejectAll(new Error('Invalid SMTP server response.'));
        socket.destroy();
        return;
      }
      current.push(line);
      if (line[3] === ' ') {
        const result = { code: Number(line.slice(0, 3)), message: current.join('\n') };
        current = [];
        if (waiting.length) waiting.shift().resolve(result);
        else complete.push(result);
      }
    }
  });
  socket.on('error', rejectAll);
  socket.on('close', () => rejectAll(new Error('SMTP connection closed.')));

  function read() {
    if (complete.length) return Promise.resolve(complete.shift());
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
  }
  async function expect(command, expectedCode) {
    if (command !== null) socket.write(command + '\r\n');
    const reply = await read();
    if (reply.code !== expectedCode) {
      // Do not log server responses: they could include details about auth.
      throw new Error(`Gmail SMTP rejected a step (code ${reply.code}).`);
    }
  }
  return { expect };
}

async function sendWithGmail(recipient, subject, lines) {
  const sender = process.env.GMAIL_USER.trim();
  if (!EMAIL_PATTERN.test(sender)) {
    throw new Error('Invalid email address for password recovery.');
  }
  const host = process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.GMAIL_SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Gmail SMTP port.');

  const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
  const reader = createReplyReader(socket);
  socket.setTimeout(15_000, () => socket.destroy(new Error('Gmail SMTP timed out.')));
  try {
    await reader.expect(null, 220); // Initial greeting from Gmail.
    await reader.expect('EHLO orderboard.local', 250);
    // SMTP AUTH PLAIN sends the app password ONLY through the verified TLS connection.
    const appPassword = process.env.GMAIL_APP_PASSWORD.replace(/\s/g, '');
    const credentials = Buffer.from(`\0${sender}\0${appPassword}`).toString('base64');
    await reader.expect(`AUTH PLAIN ${credentials}`, 235);
    await reader.expect(`MAIL FROM:<${sender}>`, 250);
    await reader.expect(`RCPT TO:<${recipient}>`, 250);
    await reader.expect('DATA', 354);

    // All message text is server-controlled. Never accept subject/body from a public API.
    const body = lines.join('\r\n');
    const message = [
      `From: OrderBoard <${sender}>`,
      `To: <${recipient}>`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      'Auto-Submitted: auto-generated',
      '', body,
    ].join('\r\n');
    // SMTP reserves a line containing only a dot as the message terminator.
    const safeMessage = message.replace(/(^|\r\n)\./g, '$1..');
    await reader.expect(`${safeMessage}\r\n.`, 250);
    // A successful DATA acknowledgment means Gmail accepted the email.
    // QUIT is best-effort; a premature close here must not mark delivery failed.
    try { await reader.expect('QUIT', 221); } catch { /* Already accepted by Gmail. */ }
  } finally {
    socket.end();
    socket.destroy();
  }
}

async function sendMessage(recipient, subject, lines) {
  if (!emailIsConfigured()) throw new Error('Account email is not configured.');
  if (!EMAIL_PATTERN.test(recipient)) throw new Error('Invalid recipient email address.');
  if (!usesResend()) return sendWithGmail(recipient, subject, lines);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM.trim(),
      to: [recipient],
      subject,
      text: lines.join('\n'),
    }),
    signal: AbortSignal.timeout(10000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Resend rejected the email (HTTP ${response.status}).`);
}

// Every link is generated by the server using its trusted, configured frontend URL.
export async function sendResetEmail(recipient, link) {
  return sendMessage(recipient, 'Reset your OrderBoard password', [
    'A password reset was requested for your OrderBoard account.', '',
    'Open this link to create a new password:', link, '',
    'This link expires in 15 minutes and can only be used once.',
    'If you did not request this, you can ignore this email.',
    'Your current password will not change unless the link is used.',
  ]);
}

export async function sendEmailChangeVerification(recipient, link) {
  return sendMessage(recipient, 'Confirm your new OrderBoard email', [
    'An email address change was requested for an OrderBoard account.', '',
    'Confirm that you control this new email address:', link, '',
    'The link expires in 15 minutes and can only be used once.',
    'If this was not you, do not open the link.',
  ]);
}

export async function sendEmailChangeNotice(recipient) {
  return sendMessage(recipient, 'OrderBoard account email updated', [
    'The sign-in email for your OrderBoard account was changed.',
    'If you did not authorize this change, contact your bakery system administrator immediately.',
    'All previously active login sessions have been revoked.',
  ]);
}
