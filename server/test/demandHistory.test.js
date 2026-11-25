import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateOrders, fulfilledDate, periodComparisons, demandModel, historicalMonths, monthDates, replayForecasts, shiftDay } from '../src/demandHistory.js';

const record = orders => ({ orders, products: orders ? [{ name: 'Pandesal', quantity: 2 * orders }] : [] });

test('weights actual same-date counts and product units by the number of recorded years', () => {
  const actuals = new Map();
  for (let i = 1; i <= 56; i++) actuals.set(shiftDay('2026-11-26', -i), record(4));
  for (const [years, weight, expected] of [[0, 0, 4], [1, .3, 5.2], [2, .5, 6], [3, .7, 6.8]]) {
    if (years) actuals.set((2026 - years) + '-12-05', record(8));
    const prediction = demandModel(actuals, '2026-11-26').predict('2026-12-05');
    assert.equal(prediction.years, years);
    assert.equal(prediction.historicalWeight, weight);
    assert.equal(prediction.expectedOrders, expected);
    assert.equal(prediction.products[0].expectedUnits, expected * 2);
  }
  actuals.set('2023-12-05', record(0));
  actuals.set('2026-12-05', record(100));
  const prediction = demandModel(actuals, '2026-11-26').predict('2026-12-05');
  assert.equal(prediction.years, 3);
  assert.equal(prediction.annualAverage, 5.3);
});

test('monthly comparisons include known zeros and exclude incomplete and future months', () => {
  const actuals = new Map();
  for (const month of ['2023-02', '2024-02', '2025-02', '2027-02']) {
    for (const day of monthDates(month)) actuals.set(day, record(2));
  }
  actuals.delete('2025-02-03');
  actuals.set('2024-02-29', record(0));
  const result = historicalMonths(actuals, '2027-02', '2026-12-20');
  assert.deepEqual(result.history, [{ year: '2023', orders: 56 }, { year: '2024', orders: 56 }]);
  assert.deepEqual(result.partial, [{ year: '2025', recorded: 27, total: 28, orders: 54 }]);
  assert.equal(result.average, 56);
  assert.equal(result.products[0].expectedUnits, 112);
});

test('held-out replay does not train on the target day', () => {
  const actuals = new Map();
  for (let i = 1; i <= 60; i++) actuals.set(shiftDay('2026-12-01', -i), record(4));
  for (const day of monthDates('2026-12')) actuals.set(day, record(4));
  actuals.set('2025-12-01', record(8));
  actuals.set('2026-12-01', record(10));
  assert.deepEqual(replayForecasts(actuals), { samples: 1, blended: 4.8, weekday: 6 });
});

test('weekday denominator skips unknown dates and includes tracked zeros', () => {
  const data = new Map(monthDates('2026-11').slice(0, 21).map(day => [day, record(6)]));
  data.set('2026-11-07', record(0));
  const prediction = demandModel(data, '2026-11-30').predict('2026-12-05');
  assert.equal(prediction.recordedDays, 3);
  assert.equal(prediction.expectedOrders, 4);
  assert.deepEqual(prediction.observedRange, [0, 6]);
  for (const day of ['07', '14', '21']) data.delete('2026-11-' + day);
  assert.equal(demandModel(data, '2026-11-30').predict('2026-12-05'), null);
});

test('fulfilled demand uses Manila pickup date then legacy timestamps', async () => {
  const pickup = new Date('2026-11-06T17:00:00Z');
  const paid = new Date('2026-11-09T03:00:00Z');
  const items = [{ name: 'Roll', quantity: 2 }];
  const data = await aggregateOrders([{ fulfillmentAt: pickup, paidCompletedAt: paid, items },
    { paidCompletedAt: paid, items }, { createdAt: paid, items }], fulfilledDate, '2026-11-10');
  assert.deepEqual(data.get('2026-11-07'), { orders: 1, products: [{ name: 'Roll', quantity: 2 }] });
  assert.equal(data.get('2026-11-09').orders, 2);
});

test('compares daily, weekly and monthly totals at the start of each period', () => {
  const data = new Map();
  for (let i = 0; i < 100; i++) data.set(shiftDay('2026-10-01', i), record(4));
  for (const date of monthDates('2025-12')) data.set(date, record(8));
  const rows = periodComparisons(data);
  assert.deepEqual(rows.map(row => row.period), ['day', 'week', 'month']);
  for (const row of rows) {
    assert.equal(row.errors.length, 5);
    assert.equal(row.errors[0], 0);
    assert.ok(row.errors[4] > 0);
  }
});
