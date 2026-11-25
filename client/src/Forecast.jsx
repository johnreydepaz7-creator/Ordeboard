import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCcw, TrendingUp } from 'lucide-react';
import './forecast.css';

const periods = {
  '7-days': 'Next 7 days',
  '14-days': 'Next 14 days',
  'this-week': 'This week',
  'next-week': 'Next week',
  'this-month': 'This month',
  'next-month': 'Next month',
};
const periodOptions = {
  Daily: Object.keys(periods),
  Weekly: ['this-week', 'next-week'],
  Monthly: ['this-month', 'next-month'],
};
const dayMs = 86_400_000;
const fullDate = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const rangeDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });
const orderCount = count => number.format(count) + (count === 1 ? ' order' : ' orders');

function rangeLabel({ from, to }) {
  return rangeDate.formatRange(Date.parse(from), Date.parse(to));
}

function buildDays(result, range) {
  const predictions = new Map(result.forecast.map(day => [day.date, day]));
  const days = [];
  for (let time = Date.parse(range.from); time <= Date.parse(range.to); time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    days.push({ date, time, prediction: predictions.get(date) });
  }
  return days;
}

function summarize(days) {
  let projectedOrders = 0;
  let busiest;
  for (const { prediction } of days) {
    if (prediction) {
      projectedOrders += Math.round(prediction.expectedOrders * 10);
      if (prediction.expectedOrders > (busiest?.expectedOrders ?? 0)) busiest = prediction;
    }
  }
  return { projectedOrders: projectedOrders / 10, busiest };
}

function summarizeProducts(days) {
  const totals = new Map();
  for (const { prediction } of days) {
    for (const { name, expectedUnits } of prediction?.products || []) {
      totals.set(name, (totals.get(name) || 0) + Math.round(expectedUnits * 10));
    }
  }
  return [...totals].map(([name, units]) => ({ name, expectedUnits: units / 10 }));
}

function monthWeeks(days) {
  const weeks = [];
  for (const day of days) {
    if (!weeks.length || new Date(day.time).getUTCDay() === 1) weeks.push([]);
    weeks.at(-1).push(day);
  }
  return weeks.map(week => ({
    from: week[0].date,
    to: week.at(-1).date,
    ...summarize(week),
    hasEstimates: week.some(day => day.prediction),
  }));
}

function ProductList({ products }) {
  return <ul className="forecast-products">{products.map(({ name, expectedUnits }) =>
    <li key={name}><span>{name}</span><strong>{number.format(expectedUnits)} {expectedUnits === 1 ? 'unit' : 'units'}</strong></li>
  )}</ul>;
}

function ExpectedProducts({ products }) {
  const ranked = [...products].sort((a, b) => b.expectedUnits - a.expectedUnits || a.name.localeCompare(b.name));
  const remaining = ranked.slice(5);
  return <div className="forecast-expected-products">
    <h4>Expected product demand</h4>
    {ranked.length ? <ProductList products={ranked.slice(0, 5)}/> : <p>No product estimates for this period.</p>}
    {remaining.length > 0 && <details>
      <summary>Show {remaining.length} more {remaining.length === 1 ? 'product' : 'products'}</summary>
      <ProductList products={remaining}/>
    </details>}
  </div>;
}

function DayDetails({ day, panelRef }) {
  const label = fullDate.format(day.time);
  return <section className="forecast-day-details" ref={panelRef} tabIndex={-1} aria-labelledby="forecast-day-title">
    <h4 id="forecast-day-title">{label}</h4>
    {day.prediction ? <>
      <p>Based on past orders, we expect an average of <strong>{orderCount(day.prediction.expectedOrders)}</strong> on {label}.</p>
      <ExpectedProducts products={day.prediction.products}/>
    </> : <p>No estimate available for this date.</p>}
  </section>;
}

function DayList({ days, busiest, selectedDate, onSelect }) {
  return <table className="forecast-date-table">
    <thead><tr><th scope="col">Date</th><th scope="col">Expected orders</th></tr></thead>
    <tbody>{days.map(({ date, time, prediction }) => {
      const isBusiest = busiest && prediction?.expectedOrders === busiest.expectedOrders;
      return <tr key={date} className={isBusiest ? 'forecast-peak-row' : undefined}>
        <th scope="row">
          <button type="button" className="forecast-date-link" aria-pressed={date === selectedDate} onClick={() => onSelect(date)}>
            {fullDate.format(time)}
          </button>
          {isBusiest && <small>Busiest forecast</small>}
        </th>
        <td>{prediction ? number.format(prediction.expectedOrders) : '—'}</td>
      </tr>;
    })}</tbody>
  </table>;
}

export default function Forecast({ request, active = true }) {
  const [view, setView] = useState('Daily');
  const [period, setPeriod] = useState('7-days');
  const [week, setWeek] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [response, setResponse] = useState(null);
  const detailsRef = useRef(null);
  const previousRequest = useRef('');

  useEffect(() => {
    if (!active) return;
    const key = period.endsWith('-days') ? 'days=' + period.split('-')[0] : 'period=' + period;
    const repeat = previousRequest.current === key;
    previousRequest.current = key;
    let current = true;
    request('/api/forecast?' + key, repeat ? { refresh: true } : {}).then(
      result => { if (current) setResponse({ period, refresh, result }); },
      error => { if (current) setResponse({ period, refresh, error: error.message }); },
    );
    return () => { current = false; };
  }, [active, period, refresh, request]);

  const current = response?.period === period && response.refresh === refresh ? response : null;
  const result = current?.result;
  const range = week || result;
  const days = result ? buildDays(result, range) : [];
  const summary = summarize(days);
  const selectedDay = days.find(day => day.date === selectedDate) || days[0];
  const tiedPeak = summary.busiest && days.filter(day => day.prediction?.expectedOrders === summary.busiest.expectedOrders).length > 1;

  useEffect(() => {
    if (active && selectedDate) detailsRef.current?.focus();
  }, [active, selectedDate, view]);

  function choosePeriod(value) {
    if (value === 'selected-week') return;
    setPeriod(value);
    setWeek(null);
    setSelectedDate(null);
  }

  function chooseView(value) {
    if (view === value) return;
    setView(value);
    if (value === 'Daily') return;
    if (week && value === 'Weekly') return;
    if (!periodOptions[value].includes(period)) choosePeriod(periodOptions[value][0]);
    else if (week) {
      setWeek(null);
      setSelectedDate(null);
    }
  }

  function showWeek(from, to) {
    setWeek({ from, to });
    setSelectedDate(null);
    setView('Weekly');
  }

  function showBusiest(date) {
    setView('Daily');
    setSelectedDate(date);
  }

  return <div className="reports-layout forecast-layout">
    <section className="report-panel">
      <header className="forecast-toolbar">
        <h3><TrendingUp size={19} aria-hidden="true"/> Demand Forecast</h3>
        <div className="forecast-views" role="group" aria-label="Forecast view">
          {Object.keys(periodOptions).map(option => <button
            className="status-button" type="button" key={option} aria-pressed={view === option} onClick={() => chooseView(option)}
          >{option}</button>)}
        </div>
      </header>
      <div className="forecast-period">
        <label>Forecast period
          <select value={week ? 'selected-week' : period} onChange={event => choosePeriod(event.target.value)}>
            {week && <option value="selected-week" disabled>{rangeLabel(week)}</option>}
            {periodOptions[view].map(option => <option key={option} value={option}>{periods[option]}</option>)}
          </select>
        </label>
        <button className="status-button" type="button" disabled={!current} onClick={() => setRefresh(refresh + 1)}>
          <RefreshCcw size={15} aria-hidden="true"/> Refresh
        </button>
      </div>
      {!current && <p role="status">Calculating forecast…</p>}
      {current?.error && <p className="error" role="alert">{current.error}</p>}
    </section>

    {result && <>
      <section className="report-panel" aria-labelledby="forecast-outlook-title">
        <h3 id="forecast-outlook-title">{view} outlook <span className="forecast-range">{rangeLabel(range)} · Philippine time</span></h3>
        {summary.busiest && <div className="forecast-peak">
          <div>
            <strong>Busiest expected day</strong>
            <p>Based on past orders, {fullDate.format(Date.parse(summary.busiest.date))} {tiedPeak
              ? 'is one of the busiest expected days in this period'
              : 'is expected to be the busiest day in this period'
            }, with an average of <strong>{orderCount(summary.busiest.expectedOrders)}</strong>.</p>
          </div>
          <button type="button" className="status-button" onClick={() => showBusiest(summary.busiest.date)}>
            View day <ChevronRight size={15} aria-hidden="true"/>
          </button>
        </div>}
        {result.status === 'ready' ? <>
          <dl className="forecast-metrics"><div><dt>Estimated total orders</dt><dd>{number.format(summary.projectedOrders)}</dd></div></dl>
          {view !== 'Daily' && <ExpectedProducts products={summarizeProducts(days)}/>}
        </> : <p>There isn’t enough order history to generate a forecast yet.</p>}
      </section>

      {view === 'Monthly' ? <section className="report-panel">
        <h3>Weeks in this month</h3>
        <table className="forecast-date-table">
          <thead><tr><th scope="col">Week</th><th scope="col">Expected orders</th></tr></thead>
          <tbody>{monthWeeks(days).map(item => <tr key={item.from}>
            <th scope="row">
              <button className="forecast-date-link" type="button" onClick={() => showWeek(item.from, item.to)}>{rangeLabel(item)}</button>
            </th>
            <td>{item.hasEstimates ? number.format(item.projectedOrders) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </section> : <section className="report-panel">
        <h3>Daily forecast</h3>
        {selectedDay && <DayDetails day={selectedDay} panelRef={detailsRef}/>}
        <DayList days={days} busiest={summary.busiest} selectedDate={selectedDay?.date} onSelect={setSelectedDate}/>
      </section>}
    </>}
  </div>;
}
