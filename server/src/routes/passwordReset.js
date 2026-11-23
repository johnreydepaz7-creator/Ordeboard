// Password recovery for Owner and Staff: one-time token, emailed to account holder.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { tokenHash } from '../security/sessionHelpers.js';
import { sendResetEmail, emailIsConfigured } from '../security/mailer.js';

const router = Router();
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const requestSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
const confirmSchema = z.object({
  token: tokenSchema,
  newPassword: z.string().min(12).max(128),
}).strict();
const genericMessage = 'If this is an active OrderBoard account, a reset link will be emailed shortly.';

// POST /api/auth/password-reset/request
router.post('/request', async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: 'Enter a valid email address.' });
    // This response is identical for existing, missing and disabled accounts.
    if (!emailIsConfigured()) {
      return response.status(503).json({ message: 'Email recovery is not configured. Contact your administrator.' });
    }
    const email = parsed.data.email.toLowerCase();
    const user = await User.findOne({ email, active: true }).lean();
    if (!user) return response.json({ message: genericMessage });

    const token = randomBytes(32).toString('base64url');
    const hashed = tokenHash(token);
    const now = new Date();
    // One email per minute per account, even when requests use different IPs.
    // Atomically replace the prior link: only the newest link remains usable.
    const updated = await User.updateOne({
      _id: user._id, active: true,
      $or: [
        { resetRequestedAt: { $exists: false } },
        { resetRequestedAt: { $lt: new Date(now.getTime() - ONE_MINUTE) } },
      ],
    }, { $set: {
      resetTokenHash: hashed,
      resetExpiresAt: new Date(now.getTime() + FIFTEEN_MINUTES),
      resetRequestedAt: now,
    } });
    if (!updated.modifiedCount) return response.json({ message: genericMessage });

    // Explicit, trusted URL from the server configuration (never from HTTP Host).
    const link = new URL(process.env.RESET_LINK_BASE_URL);
    if (!['https:', 'http:'].includes(link.protocol)) throw new Error('Invalid RESET_LINK_BASE_URL.');
    if (process.env.NODE_ENV === 'production' && link.protocol !== 'https:') {
      throw new Error('Production password reset links must use HTTPS.');
    }
    link.hash = `reset=${token}`; // Fragment isn't sent to web servers or access logs.
    try {
      await sendResetEmail(user.email, link.toString());
    } catch (error) {
      // Remove this unsent token, but do not remove a newer token.
      try {
        await User.updateOne({ _id: user._id, resetTokenHash: hashed }, {
          $unset: { resetTokenHash: '', resetExpiresAt: '', resetRequestedAt: '' },
        });
      } catch (cleanupError) {
        console.error('OrderBoard recovery-token cleanup failed:', cleanupError.message);
      }
      console.error('OrderBoard password reset email could not be sent:', error.message);
    }
    return response.json({ message: genericMessage });
  } catch (error) { next(error); }
});

// POST /api/auth/password-reset/confirm
router.post('/confirm', async (request, response, next) => {
  try {
    response.set('Cache-Control', 'no-store');
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ message: 'Enter a valid reset link and a 12–128 character password.' });
    const hashed = tokenHash(parsed.data.token);
    const condition = { resetTokenHash: hashed, resetExpiresAt: { $gt: new Date() }, active: true };
    const user = await User.findOne(condition).select('+passwordHash');
    if (!user) return response.status(400).json({ message: 'This reset link has expired or has already been used. Request a new link.' });
    if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) {
      return response.status(400).json({ message: 'Choose a password different from your current one.' });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    // Atomic condition: parallel requests cannot redeem the same token twice.
    const changed = await User.updateOne({ _id: user._id, ...condition }, {
      $set: { passwordHash },
      $inc: { sessionVersion: 1 },
      $unset: { resetTokenHash: '', resetExpiresAt: '', resetRequestedAt: '' },
    });
    if (!changed.modifiedCount) return response.status(400).json({ message: 'Reset link is no longer valid. Request a new link.' });
    // The session version also protects against a still-running request on another device.
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    response.json({ message: 'Password reset successfully. Sign in with your new password.' });
  } catch (error) { next(error); }
});

export default router;
