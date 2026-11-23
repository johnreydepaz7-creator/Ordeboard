// Run once to create the first Owner account.
// Example: npm.cmd run create-owner -- "Owner Name" "owner@example.com" "strong-password"
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { promptHidden } from '../security/terminalPrompt.js';

const [name, email, passwordFromArgument] = process.argv.slice(2);
// Safer default: ask privately instead of storing a password in PowerShell history.
const password = passwordFromArgument || (name && email ? await promptHidden('New Owner password (at least 12 characters): ') : '');
// Require a name, valid-looking email, and a password of at least 12 characters.
if (!name || !email || !password || password.length < 12 || !/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run create-owner -- "Full Name" owner@example.com (password prompted privately)');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  // Never create another Owner if the database already has one.
  const existingAccount = await User.exists({});
  if (existingAccount) throw new Error('Database is not empty. Refusing initial Owner creation; use authorized offline recovery instead.');

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ name, email: email.toLowerCase(), passwordHash, role: 'owner' });
  console.log('Owner account created.');
} finally {
  await mongoose.disconnect();
}
