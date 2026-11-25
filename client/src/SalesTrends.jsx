import React, { useState } from 'react';

const dayMs = 86_400_000;
const shortDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthDate = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const number = new Intl.NumberFormat('en-PH');
const views = ['Daily', 'Weekly', 'Monthly'];

// Date strings already represent Manila calendar days. Use UTC for calendar arithmetic.
function groupTrend({ from, to, trend }, view) {
  const records = new Map(trend.map(day => [day.date, day]));
  const periods = new Map();
  const end = Date.parse(to);

  for (let time = Date.parse(from); time <= end; time += dayMs) {
    const date = new Date(time);
    const dayKey = date.toISOString().slice(0, 10);
    let key = dayKey;
    if (view === 'Weekly') {
      const daysSinceMonday = (date.getUTCDay() + 6) % 7;
      key = new Date(time - daysSinceMonday * dayMs).toISOString().slice(0, 10);
    } else if (view === 'Monthly') {
      key = dayKey.slice(0, 7);
    }

    if (!periods.has(key)) {
      periods.set(key, { key, from: time, to: time, sales: 0, expenses: 0, orders: 0 });
    }
    const period = periods.get(key);
    const record = records.get(dayKey);
    period.to = time;
    if (record) {
      period.sales += Math.round(record.sales * 100);
      period.expenses += Math.round(record.expenses * 100);
      period.orders += record.orders;
    }
  }

  return [...periods.values()];
}

function periodLabel(period) {
  return period.from === period.to
    ? fullDate.format(period.from)
    : fullDate.formatRange(period.from, period.to);
}

export default function SalesTrends({ report }) {
  const [view, setView] = useState('Daily');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const periods = groupTrend(report, view);
  const selected = periods[selectedIndex];
  const peak = Math.max(1, ...periods.flatMap(period => [period.sales, period.expenses]));

  function movePeriod(event, index) {
    const moves = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: periods.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = event.currentTarget.parentElement.children[next];
    if (target) {
      setSelectedIndex(next);
      target.focus();
    }
  }

  return <section className="report-panel report-trends" aria-labelledby="report-trends-title">
    <div className="report-trends-header">
      <h3 id="report-trends-title">Sales trends</h3>
      <div className="report-trends-views" role="group" aria-label="Sales trend view">
        {views.map(option => <button
          type="button"
          className="status-button"
          aria-pressed={option === view}
          key={option}
          onClick={() => {
            if (option !== view) {
              setView(option);
              setSelectedIndex(0);
            }
          }}
        >{option}</button>)}
      </div>
    </div>
    <div className="report-trends-details" aria-live="polite" aria-atomic="true">
      <strong>{periodLabel(selected)}</strong>
      <dl>
        <div><dt>Sales</dt><dd>{peso.format(selected.sales / 100)}</dd></div>
        <div><dt>Expenses</dt><dd>{peso.format(selected.expenses / 100)}</dd></div>
        <div><dt>Paid orders</dt><dd>{number.format(selected.orders)}</dd></div>
      </dl>
    </div>
    {report.trend.length === 0 && <p>No sales or expenses recorded for this date range.</p>}
    <div className="report-legend"><span>■ Sales</span><span>■ Expenses</span></div>
    <div className="report-daily" key={view} role="group" aria-label={view + ' sales and expenses'}>
      {periods.map((period, index) => <button
        type="button"
        className="report-day"
        key={period.key}
        aria-label={periodLabel(period)}
        aria-pressed={index === selectedIndex}
        tabIndex={index === selectedIndex ? 0 : -1}
        onClick={() => setSelectedIndex(index)}
        onKeyDown={event => movePeriod(event, index)}
      >
        <span className="report-bars" aria-hidden="true">
          <span className="report-sale" style={{ height: period.sales / peak * 100 + '%' }} />
          <span className="report-expense" style={{ height: period.expenses / peak * 100 + '%' }} />
        </span>
        <small>{view === 'Monthly' ? monthDate.format(period.from) : shortDate.format(period.from)}</small>
      </button>)}
    </div>
  </section>;
}
