// Phase 5: transparent historical-demand estimates, not guaranteed future sales.
import { Router } from 'express';
import { requireAuth, ownerOnly } from '../middleware/auth.js';
import Order from '../models/Order.js';
const router = Router();
router.use(requireAuth, ownerOnly);
const DAY = 86400000;
const datePH = date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
router.get('/', async (req, res, next) => {
  const horizon = Number(req.query.days ?? 7);
  if (![7, 14].includes(horizon) || !/^\d+$/.test(String(req.query.days ?? '7'))) {
    return res.status(400).json({ message: 'Choose a 7-day or 14-day forecast.' });
  }
  try {
    // Last 56 *completed* Philippine calendar days, excluding the current incomplete day.
    const today = datePH(new Date());
    const todayStart = new Date(`${today}T00:00:00+08:00`);
    const start = new Date(todayStart.getTime() - 56 * DAY);
    const orders = await Order.find({ status: 'Completed', paymentStatus: 'Paid',
      paidCompletedAt: { $gte: start, $lt: todayStart } })
      .select('paidCompletedAt items total').lean();
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
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      weekdays[weekday].orders += record.orders;
      weekdays[weekday].revenueCents += record.revenueCents;
      weekdays[weekday].days++;
    }
    const predictions = insufficient ? [] : Array.from({ length: horizon }, (_, i) => {
      const date = datePH(new Date(todayStart.getTime() + i * DAY));
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const historical = weekdays[weekday];
      return { date, expectedOrders: Math.round(historical.orders / historical.days * 10) / 10,
        estimatedSales: Math.round(historical.revenueCents / historical.days) / 100 };
    });
    res.set('Cache-Control', 'no-store');
    res.json({ horizon, historicalDays: 56, qualifyingOrders: orders.length, activeSalesDays: observedDays,
      status: insufficient ? 'insufficient_data' : 'ready',
      forecast: predictions,
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
