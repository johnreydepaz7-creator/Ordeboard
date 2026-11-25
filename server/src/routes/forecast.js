// Phase 5: transparent historical-demand estimates, not guaranteed future sales.
import { Router } from 'express';
import { requireAuth, ownerOnly } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Reservation from '../models/Reservation.js';
import CakeJob from '../models/CakeJob.js';
const router = Router();
router.use(requireAuth, ownerOnly);
const DAY = 86400000;
const datePH = date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const startPH = date => Date.parse(`${date}T00:00:00+08:00`);
const shiftDay = (date, days) => datePH(new Date(startPH(date) + days * DAY));
const periods = ['this-week', 'next-week', 'this-month', 'next-month'];

function forecastRange(today, period, horizon) {
  if (!period) return { from: today, to: shiftDay(today, horizon - 1) };
  if (period.endsWith('-week')) {
    const monday = shiftDay(today, -((weekday(today) + 6) % 7));
    const from = period === 'next-week' ? shiftDay(monday, 7) : monday;
    return { from, to: shiftDay(from, 6) };
  }
  const currentMonth = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  if (period === 'next-month') currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
  const from = currentMonth.toISOString().slice(0, 10);
  currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1, 0);
  return { from, to: currentMonth.toISOString().slice(0, 10) };
}

router.get('/', async (req, res, next) => {
  const { period } = req.query;
  const horizon = Number(req.query.days ?? 7);
  if (period !== undefined && !periods.includes(period)) {
    return res.status(400).json({ message: 'Choose this week, next week, this month, or next month.' });
  }
  if (![7, 14].includes(horizon) || !/^\d+$/.test(String(req.query.days ?? '7'))) {
    return res.status(400).json({ message: 'Choose a 7-day or 14-day forecast.' });
  }
  try {
    // Last 56 *completed* Philippine calendar days, excluding the current incomplete day.
    const today = datePH(new Date());
    const { from, to } = forecastRange(today, period, horizon);
    const todayStart = new Date(startPH(today));
    const start = new Date(todayStart.getTime() - 56 * DAY);
    const upcoming = {
      $gte: new Date(startPH(from < today ? today : from)),
      $lt: new Date(startPH(to) + DAY),
    };
    const [orders, pickups, cakes] = await Promise.all([
      Order.find({ status: 'Completed', paymentStatus: 'Paid',
        paidCompletedAt: { $gte: start, $lt: todayStart } }).select('paidCompletedAt items total').lean(),
      Reservation.find({ status: 'Confirmed', pickupAt: upcoming }).select('pickupAt -_id').lean(),
      CakeJob.find({ status: { $in: ['Queued', 'Preparing', 'Decorating', 'Ready'] }, dueAt: upcoming })
        .select('dueAt -_id').lean(),
    ]);
    const daily = new Map();
    for (let i = 0; i < 56; i++) daily.set(datePH(new Date(start.getTime() + i * DAY)), { orders: 0, revenueCents: 0 });
    const products = new Map();
    for (const order of orders) {
      const day = datePH(order.paidCompletedAt);
      const record = daily.get(day);
      if (!record) continue;
      record.orders++;
      record.revenueCents += Math.round(Number(order.total) * 100);
      for (const item of order.items || []) {
        const name = (item.name || 'Unspecified product').trim();
        products.set(name, (products.get(name) || 0) + Number(item.quantity || 0));
      }
    }
    const observedDays = [...daily.values()].filter(d => d.orders > 0).length;
    // With very little observed demand, an estimate would be misleading.
    const insufficient = orders.length < 14 || observedDays < 7;
    const weekdays = Array.from({ length: 7 }, () => ({ orders: 0, revenueCents: 0, days: 0 }));
    for (const [date, record] of daily) {
      const totals = weekdays[weekday(date)];
      totals.orders += record.orders;
      totals.revenueCents += record.revenueCents;
      totals.days++;
    }
    const workload = new Map();
    function addWork(dueAt, field) {
      const date = datePH(dueAt);
      if (!workload.has(date)) workload.set(date, { date, confirmedPickups: 0, cakeJobs: 0 });
      workload.get(date)[field]++;
    }
    pickups.forEach(pickup => addWork(pickup.pickupAt, 'confirmedPickups'));
    cakes.forEach(cake => addWork(cake.dueAt, 'cakeJobs'));

    const predictions = [];
    const actuals = [];
    for (let date = from; date <= to; date = shiftDay(date, 1)) {
      if (date < today) {
        const record = daily.get(date);
        actuals.push({ date, orders: record.orders, sales: record.revenueCents / 100 });
      } else if (!insufficient) {
        const historical = weekdays[weekday(date)];
        predictions.push({
          date,
          expectedOrders: Math.round(historical.orders / historical.days * 10) / 10,
          estimatedSales: Math.round(historical.revenueCents / historical.days) / 100,
        });
      }
    }
    res.set('Cache-Control', 'no-store');
    res.json({ horizon: (startPH(to) - startPH(from)) / DAY + 1, from, to, today,
      historicalDays: 56, qualifyingOrders: orders.length, activeSalesDays: observedDays,
      status: insufficient ? 'insufficient_data' : 'ready',
      forecast: predictions,
      actuals,
      workload: [...workload.values()],
      topProducts: [...products].map(([name, quantity]) => ({ name, quantity })).sort((a,b) => b.quantity-a.quantity).slice(0, 5),
      notes: [
        'Uses the previous 56 completed days in Philippine time, including days without sales.',
        'Forecast is the average for each weekday; it is an estimate, not a guaranteed outcome.',
        'Only completed, fully paid orders with paidCompletedAt are counted. Older records may need reconciliation.',
        'Does not account for holidays, weather, promotions, cancellations, stockouts or changing prices.',
        'At least 14 qualifying orders across 7 selling days are required before estimates are shown.'
      ] });
  } catch (error) { next(error); }
});
export default router;
