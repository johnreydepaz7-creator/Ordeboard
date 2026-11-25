import { Router } from 'express';
import { requireAuth, ownerOnly } from '../middleware/auth.js';
import Order from '../models/Order.js';

const router = Router();
router.use(requireAuth, ownerOnly);
const DAY = 86400000;
const HISTORY_DAYS = 56;
const datePH = date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const startPH = date => Date.parse(`${date}T00:00:00+08:00`);
const shiftDay = (date, days) => datePH(new Date(startPH(date) + days * DAY));
const periods = ['this-week', 'next-week', 'this-month', 'next-month'];

function forecastRange(today, period, horizon) {
  if (!period) return { from: today, to: shiftDay(today, horizon - 1) };
  if (period.endsWith('-week')) {
    const monday = shiftDay(today, -((weekday(today) + 6) % 7));
    if (period === 'next-week') return { from: shiftDay(monday, 7), to: shiftDay(monday, 13) };
    return { from: today, to: shiftDay(monday, 6) };
  }
  const currentMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  if (period === 'next-month') currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
  const from = period === 'next-month' ? currentMonth.toISOString().slice(0, 10) : today;
  currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1, 0);
  return { from, to: currentMonth.toISOString().slice(0, 10) };
}

router.get('/', async (req, res, next) => {
  const { period, view } = req.query;
  const horizon = Number(req.query.days ?? 7);
  if (view !== undefined && view !== 'calendar') {
    return res.status(400).json({ message: 'Choose a valid forecast view.' });
  }
  if (period !== undefined && !periods.includes(period)) {
    return res.status(400).json({ message: 'Choose this week, next week, this month, or next month.' });
  }
  if (![7, 14].includes(horizon) || !/^\d+$/.test(String(req.query.days ?? '7'))) {
    return res.status(400).json({ message: 'Choose a 7-day or 14-day forecast.' });
  }
  try {
    // Last 56 *completed* Philippine calendar days, excluding the current incomplete day.
    const today = datePH(new Date());
    const todayStart = new Date(startPH(today));
    const start = new Date(todayStart.getTime() - HISTORY_DAYS * DAY);
    const orders = await Order.find({ status: 'Completed', paymentStatus: 'Paid',
      paidCompletedAt: { $gte: start, $lt: todayStart } }).select('paidCompletedAt items.name items.quantity -_id').lean();
    const weekdays = Array.from({ length: 7 }, () => ({ orders: 0, products: new Map() }));
    const sellingDays = new Set();
    const productNames = new Map();
    for (const order of orders) {
      const day = datePH(order.paidCompletedAt);
      sellingDays.add(day);
      const totals = weekdays[weekday(day)];
      totals.orders++;
      for (const item of order.items || []) {
        const name = item.name?.trim();
        const quantity = Number(item.quantity);
        if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
        const key = name.toLowerCase();
        if (!productNames.has(key)) productNames.set(key, name);
        totals.products.set(key, (totals.products.get(key) || 0) + quantity);
      }
    }
    const insufficient = orders.length < 14 || sellingDays.size < 7;
    const status = insufficient ? 'insufficient_data' : 'ready';
    // The window contains eight of each weekday, including days with zero demand.
    const weekdayAverage = total => Math.round(total * 10 / (HISTORY_DAYS / 7)) / 10;
    const profiles = insufficient ? [] : weekdays.map(({ orders, products }) => ({
      expectedOrders: weekdayAverage(orders),
      products: [...products].map(([key, quantity]) => ({
        name: productNames.get(key),
        expectedUnits: weekdayAverage(quantity),
      })),
    }));
    res.set('Cache-Control', 'no-store');
    if (view === 'calendar') {
      return res.json({ today, status, weekdays: profiles });
    }

    const { from, to } = forecastRange(today, period, horizon);
    const forecast = [];
    if (!insufficient) {
      for (let date = from; date <= to; date = shiftDay(date, 1)) {
        forecast.push({ date, ...profiles[weekday(date)] });
      }
    }
    res.json({
      horizon: (startPH(to) - startPH(from)) / DAY + 1,
      from,
      to,
      status,
      forecast,
    });
  } catch (error) { next(error); }
});
export default router;
