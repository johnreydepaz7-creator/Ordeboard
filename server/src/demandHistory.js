import Order from './models/Order.js';
import ForecastDay, { ForecastMonth } from './models/ForecastDay.js';

const DAY = 86400000;
export const datePH = date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const shiftDay = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
const weekday = date => new Date(date).getUTCDay();
const rounded = value => Math.round(value * 10) / 10;
const empty = () => ({ orders: 0, products: [] });

function productTotals(records) {
  const totals = new Map();
  for (const record of records) {
    for (const { name, quantity } of record.products) {
      const key = name.toLowerCase();
      const product = totals.get(key) || { name, quantity: 0 };
      product.quantity += quantity;
      totals.set(key, product);
    }
  }
  return totals;
}

export function demandModel(actuals, cutoff) {
  const recent = Array.from({ length: 7 }, () => []);
  let qualifying = 0, sellingDays = 0;
  for (let i = 1; i <= 56; i++) {
    const date = shiftDay(cutoff, -i);
    const record = actuals.get(date) || empty();
    recent[weekday(date)].push(record);
    qualifying += record.orders;
    if (record.orders) sellingDays++;
  }
  const ready = qualifying >= 14 && sellingDays >= 7;
  const profiles = recent.map(records => ({
    orders: records.reduce((sum, record) => sum + record.orders, 0) / 8,
    products: productTotals(records),
  }));
  const byAnniversary = new Map();
  for (const [date, record] of actuals) {
    if (date >= cutoff) continue;
    const key = date.slice(5);
    if (!byAnniversary.has(key)) byAnniversary.set(key, []);
    byAnniversary.get(key).push({ date, ...record });
  }
  function historyFor(date) {
    return (byAnniversary.get(date.slice(5)) || []).filter(record => record.date < date);
  }
  function predict(date) {
    if (!ready) return null;
    const baseline = profiles[weekday(date)];
    const past = historyFor(date);
    const years = past.length;
    const weight = [0, 0.3, 0.5, 0.7][Math.min(years, 3)];
    const annualAverage = years ? past.reduce((sum, day) => sum + day.orders, 0) / years : null;
    const annualProducts = productTotals(past);
    const products = [];
    for (const key of new Set([...baseline.products.keys(), ...annualProducts.keys()])) {
      const weekly = baseline.products.get(key);
      const annual = annualProducts.get(key);
      const units = (weekly?.quantity || 0) / 8 * (1 - weight) + (annual?.quantity || 0) / (years || 1) * weight;
      if (rounded(units) > 0) products.push({ name: (weekly || annual).name, expectedUnits: rounded(units) });
    }
    return { expectedOrders: rounded(baseline.orders * (1 - weight) + (annualAverage || 0) * weight),
      weekdayAverage: rounded(baseline.orders), annualAverage: years ? rounded(annualAverage) : null,
      years, historicalWeight: weight, products };
  }
  const weekdays = ready ? profiles.map(profile => ({
    expectedOrders: rounded(profile.orders),
    products: [...profile.products.values()].map(product => ({
      name: product.name, expectedUnits: rounded(product.quantity / 8),
    })),
  })) : [];
  return { ready, predict, historyFor, weekdays };
}

export function monthDates(month) {
  const end = new Date(month + '-01');
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return Array.from({ length: end.getUTCDate() }, (_, i) => month + '-' + String(i + 1).padStart(2, '0'));
}

export function historicalMonths(actuals, month, today) {
  const months = new Set();
  for (const date of actuals.keys()) {
    if (date.slice(5, 7) === month.slice(5) && date.slice(0, 7) < month && date.slice(0, 7) < today.slice(0, 7)) months.add(date.slice(0, 7));
  }
  const history = [];
  const records = [];
  for (const prior of [...months].sort()) {
    const days = monthDates(prior).map(date => actuals.get(date));
    if (days.some(day => !day)) continue;
    history.push({ year: prior.slice(0, 4), orders: days.reduce((sum, day) => sum + day.orders, 0) });
    records.push(...days);
  }
  return { history, average: history.length ? rounded(history.reduce((sum, year) => sum + year.orders, 0) / history.length) : null,
    products: [...productTotals(records).values()].map(product => ({ name: product.name, expectedUnits: rounded(product.quantity / history.length) })) };
}

// Replay at most 56 recent dates from fully documented months. At each origin
// the model can only see data available before the target day was forecast.
export function replayForecasts(actuals) {
  const dates = [...actuals.keys()].sort();
  const earliest = dates[0];
  const seen = new Set();
  const candidates = dates.filter(date => {
    const key = date.slice(5);
    const hasEarlierYear = seen.has(key);
    seen.add(key);
    return hasEarlierYear;
  });
  const complete = new Map();
  let samples = 0, blended = 0, baseline = 0;
  for (const date of candidates.reverse()) {
    const month = date.slice(0, 7);
    if (!complete.has(month)) complete.set(month, monthDates(month).every(day => actuals.has(day)));
    if (!complete.get(month) || shiftDay(date, -57) < earliest) continue;
    const prediction = demandModel(actuals, shiftDay(date, -1)).predict(date);
    if (!prediction?.years) continue;
    const actual = actuals.get(date).orders;
    blended += Math.abs(prediction.expectedOrders - actual);
    baseline += Math.abs(prediction.weekdayAverage - actual);
    if (++samples === 56) break;
  }
  return samples ? { samples, blended: rounded(blended / samples), weekday: rounded(baseline / samples) } : null;
}

async function prepare(today) {
  const end = new Date(today + 'T00:00:00+08:00');
  const actuals = new Map();
  const cursor = Order.find({ status: 'Completed', paymentStatus: 'Paid', paidCompletedAt: { $type: 'date', $lt: end } })
    .select('paidCompletedAt items.name items.quantity -_id').lean().cursor();
  for await (const order of cursor) {
    const date = datePH(order.paidCompletedAt);
    const day = actuals.get(date) || { orders: 0, products: new Map() };
    day.orders++;
    for (const item of order.items || []) {
      const name = item.name?.trim();
      if (!name || !(item.quantity > 0)) continue;
      const key = name.toLowerCase();
      const product = day.products.get(key) || { name, quantity: 0 };
      product.quantity += item.quantity;
      day.products.set(key, product);
    }
    actuals.set(date, day);
  }
  for (const record of actuals.values()) record.products = [...record.products.values()];
  const snapshots = new Map();
  const stored = await ForecastDay.find({}).lean();
  for (const row of stored) {
    snapshots.set(row._id, row.prediction);
    if (row._id >= today) continue;
    if (!row.actual) {
      const actual = actuals.get(row._id) || empty();
      await ForecastDay.updateOne({ _id: row._id, actual: { $exists: false } }, { $set: { actual } });
      // Read the winning write when another worker closed the same day.
      row.actual = (await ForecastDay.findById(row._id).select('actual').lean()).actual;
    }
    actuals.set(row._id, row.actual);
  }
  const model = demandModel(actuals, today);
  const tomorrow = shiftDay(today, 1);
  if (!snapshots.has(tomorrow) && datePH(new Date()) === today) {
    const row = await ForecastDay.findOneAndUpdate({ _id: tomorrow },
      { $setOnInsert: { preparedAt: new Date(), prediction: model.predict(tomorrow) } },
      { upsert: true, new: true }).lean();
    snapshots.set(tomorrow, row.prediction);
  }
  if (tomorrow.endsWith('-01') && model.ready && datePH(new Date()) === today) {
    const month = tomorrow.slice(0, 7);
    const total = monthDates(month).reduce((sum, day) => sum + model.predict(day).expectedOrders, 0);
    await ForecastMonth.updateOne({ _id: month }, { $setOnInsert: {
      preparedAt: new Date(), expectedOrders: rounded(total),
    } }, { upsert: true });
  }
  const archivedMonths = new Map();
  for (const row of await ForecastMonth.find({}).lean()) {
    archivedMonths.set(row._id, row.expectedOrders);
    if (row._id >= today.slice(0, 7) || row.actualOrders !== undefined) continue;
    const records = monthDates(row._id).map(day => actuals.get(day));
    if (records.every(Boolean)) {
      await ForecastMonth.updateOne({ _id: row._id, actualOrders: { $exists: false } },
        { $set: { actualOrders: records.reduce((sum, day) => sum + day.orders, 0) } });
    }
  }
  let samples = 0, blendedError = 0, weekdayError = 0;
  for (const [date, prediction] of snapshots) {
    const actual = actuals.get(date);
    if (!prediction || !actual) continue;
    samples++;
    blendedError += Math.abs(prediction.expectedOrders - actual.orders);
    weekdayError += Math.abs(prediction.weekdayAverage - actual.orders);
  }
  return { today, model, actuals, snapshots, archivedMonths, replay: replayForecasts(actuals),
    accuracy: samples ? { samples, blended: rounded(blendedError / samples), weekday: rounded(weekdayError / samples) } : null };
}

let cache;
export function forecastData() {
  const today = datePH(new Date());
  if (cache?.today !== today) {
    const promise = prepare(today).catch(error => {
      if (cache?.promise === promise) cache = null;
      throw error;
    });
    cache = { today, promise };
  }
  return cache.promise;
}

export function startForecastArchive() {
  const run = () => forecastData().catch(error => console.error('Forecast archive update failed', error.message));
  run();
  setInterval(run, 5 * 60000).unref();
}
