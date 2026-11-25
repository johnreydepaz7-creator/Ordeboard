import { Router } from 'express';
import { requireAuth, ownerOnly } from '../middleware/auth.js';
import { forecastData, historicalMonths, monthDates, shiftDay } from '../demandHistory.js';

const router = Router();
router.use(requireAuth, ownerOnly);
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();
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
  const month = req.query.month;
  if (month !== undefined && (typeof month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))) {
    return res.status(400).json({ message: 'Choose a valid calendar month.' });
  }
  try {
    const { today, model, actuals, snapshots, archivedMonths, accuracy, replay } = await forecastData();
    function dayForecast(date) {
      const saved = snapshots.get(date);
      const prediction = saved || (date >= today ? model.predict(date) : null);
      const history = model.historyFor(date).map(row => ({ date: row.date, orders: row.orders,
        forecast: snapshots.get(row.date)?.expectedOrders ?? null }));
      return { date, prediction, saved: Boolean(saved), actual: actuals.get(date) ?? null, history };
    }
    res.set('Cache-Control', 'no-store');
    if (view === 'calendar') {
      const visible = month || today.slice(0, 7);
      const next = shiftDay(monthDates(today.slice(0, 7)).at(-1), 1).slice(0, 7);
      const days = Object.fromEntries([...new Set([...monthDates(visible), ...monthDates(next)])]
        .map(date => [date, dayForecast(date)]));
      const reminders = [today, shiftDay(today, 7)].map(dayForecast).filter(day => day.history.length);
      const historicalMonth = historicalMonths(actuals, next, today);
      for (const row of historicalMonth.history) {
        row.savedForecast = archivedMonths.get(row.year + next.slice(4)) ?? null;
      }
      return res.json({ today, month: visible, status: model.ready ? 'ready' : 'insufficient_data', days,
        weekdays: model.weekdays, historicalMonth, accuracy, replay, reminders });
    }
    const { from, to } = forecastRange(today, period, horizon);
    const forecast = [];
    let count = 0;
    for (let date = from; date <= to; date = shiftDay(date, 1)) {
      const { prediction } = dayForecast(date);
      if (prediction) forecast.push({ date, ...prediction });
      count++;
    }
    res.json({ horizon: count, from, to, status: forecast.length ? 'ready' : 'insufficient_data', forecast });
  } catch (error) { next(error); }
});
export default router;
