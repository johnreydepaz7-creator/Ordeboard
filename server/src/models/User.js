// A User is a document stored in the MongoDB "users" collection.
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // select:false prevents password hashes from being returned in normal queries.
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['owner', 'staff'], required: true },
  active: { type: Boolean, default: true },
  // Each new Staff login increases this number; a password reset increases it for either role.
  // Owner logins do NOT increase it, so the Owner can still use several devices.
  sessionVersion: { type: Number, default: 0, min: 0 },
  // Never return recovery tokens in ordinary account queries.
  resetTokenHash: { type: String, select: false },
  resetExpiresAt: { type: Date, select: false },
  resetRequestedAt: { type: Date, select: false },
  pendingEmail: { type: String, select: false },
  emailChangeTokenHash: { type: String, select: false },
  emailChangeExpiresAt: { type: Date, select: false },
  emailChangeRequestedAt: { type: Date, select: false },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
