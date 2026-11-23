// SERVER ENTRY POINT
// This file starts the OrderBoard backend after MongoDB connects.
import 'dotenv/config';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import passwordResetRoutes from './routes/passwordReset.js';
import emailChangeRoutes from './routes/emailChange.js';
import User from './models/User.js';
import { emailIsConfigured } from './security/mailer.js';
import staffRoutes from './routes/staff.js';
import securityRoutes from './routes/security.js';
import orderRoutes from './routes/orders.js';
import reservationRoutes from './routes/reservations.js';
import cakeJobRoutes from './routes/cakeJobs.js';
import scheduleRoutes from './routes/schedule.js';
import inventoryRoutes from './routes/inventory.js';
import financeRoutes from './routes/finance.js';
import reportRoutes from './routes/reports.js';
import forecastRoutes from './routes/forecast.js';
import dashboardRoutes from './routes/dashboard.js';

// Step 1: Stop startup early if important configuration is missing.
const onRender = process.env.RENDER === 'true';
const serveClient = onRender || process.env.SERVE_CLIENT === 'true';
const clientOrigin = process.env.CLIENT_ORIGIN || process.env.RENDER_EXTERNAL_URL;
if (!clientOrigin || new URL(clientOrigin).origin !== clientOrigin) {
  throw new Error('Set CLIENT_ORIGIN to the exact frontend origin, without a trailing slash.');
}
if (onRender && !clientOrigin.startsWith('https://')) {
  throw new Error('The frontend origin must use HTTPS on Render.');
}
if (serveClient && !process.env.RESET_LINK_BASE_URL) {
  process.env.RESET_LINK_BASE_URL = `${clientOrigin}/`;
}
const requiredSettings = ['MONGODB_URI', 'JWT_SECRET'];
for (const setting of requiredSettings) {
  if (!process.env[setting]) {
    throw new Error(`Missing environment variable: ${setting}`);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must have at least 32 characters.');
}

// Step 2: Create the web server and install common security middleware.
const app = express();
const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? (onRender ? 1 : 0));
if (!Number.isSafeInteger(proxyHops) || proxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS must be a nonnegative integer.');
}
app.set('trust proxy', proxyHops);
app.disable('x-powered-by');
app.use(helmet()); // Adds HTTP security headers.
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json({ limit: '20kb' })); // Read incoming JSON request bodies.
app.use(cookieParser()); // Read the login cookie.

// Limit repeated password guesses: 10 attempts per 15 minutes per IP.
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Try again later.' },
}));

// Separate, stricter limits for public password recovery endpoints.
app.use('/api/auth/password-reset/request', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'Too many reset requests. Try again in 15 minutes.' },
}));
app.use('/api/auth/email-change/request', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'Too many requests. Try again in 15 minutes.' },
}));
app.use('/api/auth/email-change/confirm', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
}));
app.use('/api/auth/password-reset/confirm', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { message: 'Too many attempts. Try again in 15 minutes.' },
}));

// Reject state-changing browser requests from an unexpected website.
app.use((request, response, next) => {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const origin = request.get('origin');
  if (unsafe && origin !== clientOrigin) {
    return response.status(403).json({ message: 'Unrecognized request origin.' });
  }
  next();
});
// Step 3: Attach API routes. Each route lives in its own file.
// Safe status check: never expose account emails or allow browser-based owner creation.
app.get('/api/setup/status', async (_request, response, next) => {
  try {
    const hasAnyAccount = Boolean(await User.exists({}));
    response.set('Cache-Control', 'no-store');
    response.json({ initialSetupRequired: !hasAnyAccount });
  } catch (error) { next(error); }
});
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', application: 'OrderBoard', phase: 5 });
});
app.use('/api/auth', authRoutes);
app.use('/api/auth/password-reset', passwordResetRoutes);
app.use('/api/auth/email-change', emailChangeRoutes); // Login, logout and current account.
app.use('/api/staff', staffRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/cake-jobs', cakeJobRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/dashboard', dashboardRoutes); // Small, staff-safe operations summary.
app.use('/api/orders', orderRoutes); // Phase 2: protected order management // Owner-only staff management.

app.use('/api', (_request, response) => {
  response.status(404).json({ message: 'API endpoint not found.' });
});

if (serveClient) {
  const clientDist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  await access(fileURLToPath(new URL('../../client/dist/index.html', import.meta.url)));
  app.use(express.static(clientDist));
}

// Unexpected server errors should not reveal database details to the browser.
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: 'An unexpected error occurred.' });
});

// Step 4: Connect to the database BEFORE accepting incoming requests.
await mongoose.connect(process.env.MONGODB_URI);
if (!await User.exists({})) console.warn('No accounts detected. Restore a database backup or run the local create-owner command to initialize OrderBoard.');
if (!emailIsConfigured()) console.warn('Account emails are disabled. See the email configuration in README.md.');
const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => console.log(`OrderBoard running on port ${port}`));
