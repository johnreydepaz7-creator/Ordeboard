import test from 'node:test';
import assert from 'node:assert/strict';
import { demandModel, historicalMonths, monthDates, replayForecasts, shiftDay } from '../src/demandHistory.js';

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
