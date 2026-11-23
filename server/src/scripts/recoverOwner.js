// Offline recovery requires server-console access AND the separate, saved recovery key.
// Never expose this operation as a public API or website form.
import 'dotenv/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Session from '../models/Session.js';
import { promptVisible, promptHidden } from '../security/terminalPrompt.js';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Missing MONGODB_URI in server/.env.');
  const expected = process.env.OWNER_RECOVERY_KEY_HASH?.trim().toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('OWNER_RECOVERY_KEY_HASH is not configured. Owner recovery cannot be authorized.');
  }
  console.log('OrderBoard OFFLINE Owner Recovery — authorized installer only.');
  const key = await promptHidden('Enter the offline Owner recovery key: ');
  const actual = createHash('sha256').update(key).digest();
  if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) throw new Error('Recovery key invalid. No changes made.');
  const email = (await promptVisible('New accessible email address: ')).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error('Invalid email.');
  const password = await promptHidden('New Owner password (12–128 characters): ');
  const repeated = await promptHidden('Confirm new Owner password: ');
  if (password.length < 12 || password.length > 128 || password !== repeated) throw new Error('Passwords do not match or are too short/long.');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const owner = await User.findOne({ role: 'owner' });
    if (!owner) throw new Error('Owner does not exist. Restore your DB backup or use first-time setup ONLY if the database is empty.');
    if (await User.exists({ email, _id: { $ne: owner._id } })) throw new Error('Email belongs to another account.');
    const passwordHash = await bcrypt.hash(password, 12);
    const change = await User.updateOne({ _id: owner._id, role: 'owner' }, {
      $set: { email, passwordHash, active: true }, $inc: { sessionVersion: 1 },
      $unset: { resetTokenHash: '', resetExpiresAt: '', resetRequestedAt: '',
        pendingEmail: '', emailChangeTokenHash: '', emailChangeExpiresAt: '', emailChangeRequestedAt: '' },
    });
    if (change.modifiedCount !== 1) throw new Error('Owner record changed. No recovery completed.');
    await Session.updateMany({ userId: owner._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    console.log('Owner credentials recovered. All existing Owner sessions have been revoked.');
    console.log('Sign in with your NEW email and password. Consider rotating the offline recovery key.');
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
