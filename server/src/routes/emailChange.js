// Verify the NEW inbox before moving any Owner/Staff account to that address.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { requireAuth } from '../middleware/auth.js';
import { tokenHash, clearSessionCookie } from '../security/sessionHelpers.js';
import { emailIsConfigured, sendEmailChangeVerification, sendEmailChangeNotice } from '../security/mailer.js';

const router = Router();
const EXPIRATION = 15 * 60 * 1000;
const inputSchema = z.object({
  newEmail: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  currentPassword: z.string().min(1).max(128),
}).strict();
const confirmSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const clearPending = { pendingEmail: '', emailChangeTokenHash: '',
  emailChangeExpiresAt: '', emailChangeRequestedAt: '' };

// POST /api/auth/email-change/request (signed-in accounts only)
router.post('/request', requireAuth, async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const parsed = inputSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: 'Enter a valid new email and current password.' });
    if (!emailIsConfigured()) return response.status(503).json({ message: 'Email verification is not configured.' });
    const user = await User.findById(request.user.id).select('+passwordHash +emailChangeRequestedAt');
    if (!user || !user.active || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return response.status(401).json({ message: 'Current password is incorrect.' });
    }
    if (user.email === parsed.data.newEmail) return response.status(400).json({ message: 'Choose a different email address.' });
    if (await User.exists({ email: parsed.data.newEmail })) return response.status(409).json({ message: 'That email is already in use.' });
    if (user.emailChangeRequestedAt && Date.now() - user.emailChangeRequestedAt.getTime() < 60_000) {
      return response.status(429).json({ message: 'Try again in one minute.' });
    }
    const token = randomBytes(32).toString('base64url');
    const hashed = tokenHash(token);
    const now = new Date();
    const changed = await User.updateOne({ _id: user._id, email: user.email, passwordHash: user.passwordHash,
      $or: [{ emailChangeRequestedAt: { $exists: false } },
        { emailChangeRequestedAt: { $lt: new Date(now.getTime()-60_000) } }] }, {
      $set: { pendingEmail: parsed.data.newEmail, emailChangeTokenHash: hashed,
        emailChangeExpiresAt: new Date(now.getTime() + EXPIRATION), emailChangeRequestedAt: now },
    });
    if (!changed.modifiedCount) return response.status(409).json({ message: 'Request changed. Please retry shortly.' });
    const link = new URL(process.env.RESET_LINK_BASE_URL);
    link.hash = `verify-email=${token}`;
    try { await sendEmailChangeVerification(parsed.data.newEmail, link.toString()); }
    catch (err) {
      await User.updateOne({ _id: user._id, emailChangeTokenHash: hashed }, { $unset: clearPending });
      console.error('Email-change confirmation could not be sent:', err.message);
      return response.status(503).json({ message: 'Unable to send verification email. Try again later.' });
    }
    response.json({ message: 'Verification link sent to the new email address. Your sign-in email has not changed yet.' });
  } catch (error) { next(error); }
});

// POST /api/auth/email-change/confirm (link possession + previous password verification)
router.post('/confirm', async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: 'Invalid confirmation link.' });
    const condition = { emailChangeTokenHash: tokenHash(parsed.data.token),
      emailChangeExpiresAt: { $gt: new Date() }, active: true };
    const account = await User.findOne(condition).select('+pendingEmail');
    if (!account?.pendingEmail) return response.status(400).json({ message: 'The link is expired or already used.' });
    const oldEmail = account.email;
    let changed;
    try {
      changed = await User.updateOne({ _id: account._id, ...condition }, {
        $set: { email: account.pendingEmail }, $inc: { sessionVersion: 1 },
        $unset: { ...clearPending, resetTokenHash: '', resetExpiresAt: '', resetRequestedAt: '' },
      });
    } catch (error) {
      if (error.code === 11000) return response.status(409).json({ message: 'That email is no longer available. Request another verification link.' });
      throw error;
    }
    if (!changed.modifiedCount) return response.status(400).json({ message: 'The link is expired or already used.' });
    await Session.updateMany({ userId: account._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    clearSessionCookie(response);
    // Security notification is best effort: old inbox may be inaccessible.
    sendEmailChangeNotice(oldEmail).catch(err => console.error('Old email notification failed:', err.message));
    response.json({ message: 'New email confirmed. Sign in again with your updated email address.' });
  } catch (error) { next(error); }
});
export default router;
