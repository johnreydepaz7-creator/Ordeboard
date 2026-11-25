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
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });
const orderCount = count => number.format(count) + (count === 1 ? ' order' : ' orders');

function rangeLabel({ from, to }) {
  return rangeDate.formatRange(Date.parse(from), Date.parse(to));
}

function buildDays(result, range) {
  const predictions = new Map(result.forecast.map(day => [day.date, day]));
  const actuals = new Map(result.actuals.map(day => [day.date, day]));
  const workload = new Map(result.workload.map(day => [day.date, day]));
  const days = [];
  for (let time = Date.parse(range.from); time <= Date.parse(range.to); time += dayMs) {
    const date = new Date(time).toISOString().slice(0, 10);
    days.push({ date, time, prediction: predictions.get(date), actual: actuals.get(date), workload: workload.get(date) });
  }
  return days;
}

function summarize(days) {
  let recordedOrders = 0;
  let recordedSales = 0;
  let projectedOrders = 0;
  let projectedSales = 0;
  let busiest;
  for (const { actual, prediction } of days) {
    if (actual) {
      recordedOrders += actual.orders;
      recordedSales += Math.round(actual.sales * 100);
    }
    if (prediction) {
      projectedOrders += Math.round(prediction.expectedOrders * 10);
      projectedSales += Math.round(prediction.estimatedSales * 100);
      if (prediction.expectedOrders > (busiest?.expectedOrders ?? 0)) busiest = prediction;
    }
  }
  return { recordedOrders, recordedSales: recordedSales / 100, projectedOrders: projectedOrders / 10, projectedSales: projectedSales / 100, busiest };
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
    hasActuals: week.some(day => day.actual),
    hasEstimates: week.some(day => day.prediction),
  }));
}

function ForecastSummary({ days, summary }) {
  const { recordedOrders, recordedSales, projectedOrders, projectedSales } = summary;
  const hasActuals = days.some(day => day.actual);
  const hasEstimates = days.some(day => day.prediction);
  return <dl className="forecast-metrics">
    {hasActuals && <>
      <div><dt>Recorded orders</dt><dd>{number.format(recordedOrders)}</dd></div>
      <div><dt>Recorded sales</dt><dd>{currency.format(recordedSales)}</dd></div>
    </>}
    {hasEstimates && <>
      <div><dt>{hasActuals ? 'Estimated remaining orders' : 'Estimated total orders'}</dt><dd>{number.format(projectedOrders)}</dd></div>
      <div><dt>{hasActuals ? 'Estimated remaining sales' : 'Estimated total sales'}</dt><dd>{currency.format(projectedSales)}</dd></div>
      {hasActuals && <>
        <div><dt>Estimated total orders</dt><dd>{number.format(recordedOrders + projectedOrders)}</dd></div>
        <div><dt>Estimated total sales</dt><dd>{currency.format(Math.round((recordedSales + projectedSales) * 100) / 100)}</dd></div>
      </>}
    </>}
  </dl>;
}

function DayDetails({ day, panelRef }) {
  const label = fullDate.format(day.time);
  return <section className="forecast-day-details" ref={panelRef} tabIndex={-1} aria-labelledby="forecast-day-title">
    <h4 id="forecast-day-title">{label}</h4>
    {day.prediction ? <p>Based on past sales, we expect an average of <strong>{orderCount(day.prediction.expectedOrders)}</strong> on {label}.</p>
      : day.actual ? <p><strong>{orderCount(day.actual.orders)}</strong> recorded.</p>
      : <p>No estimate available for this date.</p>}
    <dl className="forecast-metrics">
      {day.prediction && <div><dt>Estimated sales</dt><dd>{currency.format(day.prediction.estimatedSales)}</dd></div>}
      {day.actual ? <div><dt>Recorded sales</dt><dd>{currency.format(day.actual.sales)}</dd></div> : <>
        <div><dt>Confirmed pickups</dt><dd>{day.workload?.confirmedPickups ?? 0}</dd></div>
        <div><dt>Cake jobs due</dt><dd>{day.workload?.cakeJobs ?? 0}</dd></div>
      </>}
    </dl>
  </section>;
}

function DayList({ days, busiest, selectedDate, onSelect }) {
  return <table className="forecast-date-table">
    <thead><tr><th scope="col">Date</th><th scope="col">Orders</th><th scope="col">Sales</th></tr></thead>
    <tbody>{days.map(({ date, time, prediction, actual }) => {
      const isBusiest = busiest && prediction?.expectedOrders === busiest.expectedOrders;
      return <tr key={date} className={isBusiest ? 'forecast-peak-row' : undefined}>
        <th scope="row">
          <button type="button" className="forecast-date-link" aria-pressed={date === selectedDate} onClick={() => onSelect(date)}>
            {fullDate.format(time)}
          </button>
          <small>{isBusiest ? 'Busiest forecast' : actual ? 'Recorded' : prediction ? 'Forecast' : 'Estimate unavailable'}</small>
        </th>
        <td>{actual ? number.format(actual.orders) : prediction ? number.format(prediction.expectedOrders) : '—'}</td>
        <td>{actual ? currency.format(actual.sales) : prediction ? currency.format(prediction.estimatedSales) : '—'}</td>
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
  const selectedDay = days.find(day => day.date === selectedDate) || days.find(day => !day.actual) || days[0];
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
            <p>Based on past sales, {fullDate.format(Date.parse(summary.busiest.date))} {tiedPeak
              ? 'is one of the busiest expected days in this period'
              : 'is expected to be the busiest day in this period'
            }, with an average of <strong>{orderCount(summary.busiest.expectedOrders)}</strong>.</p>
          </div>
          <button type="button" className="status-button" onClick={() => showBusiest(summary.busiest.date)}>
            View day <ChevronRight size={15} aria-hidden="true"/>
          </button>
        </div>}
        {result.status !== 'ready' && <p>No forecast yet. At least 14 completed, fully paid orders across 7 different days are needed.</p>}
        {result.status === 'ready' && !summary.busiest && range.to >= result.today && <p>No paid orders are expected in the upcoming dates for this period.</p>}
        {days.some(day => day.actual) && <p>Recorded totals include days through yesterday. Today uses a full-day forecast.</p>}
        <ForecastSummary days={days} summary={summary}/>
      </section>

      {view === 'Monthly' ? <section className="report-panel">
        <h3>Weeks in this month</h3>
        <table className="forecast-date-table">
          <thead><tr><th scope="col">Week</th><th scope="col">Recorded orders</th><th scope="col">Estimated orders</th></tr></thead>
          <tbody>{monthWeeks(days).map(item => <tr key={item.from}>
            <th scope="row">
              <button className="forecast-date-link" type="button" onClick={() => showWeek(item.from, item.to)}>{rangeLabel(item)}</button>
            </th>
            <td>{item.hasActuals ? number.format(item.recordedOrders) : '—'}</td>
            <td>{item.hasEstimates ? number.format(item.projectedOrders) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </section> : <section className="report-panel">
        <h3>Daily forecast</h3>
        {selectedDay && <DayDetails day={selectedDay} panelRef={detailsRef}/>}
        <DayList days={days} busiest={summary.busiest} selectedDate={selectedDay?.date} onSelect={setSelectedDate}/>
      </section>}

      <section className="report-panel">
        <h3>Historically popular products</h3>
        {result.topProducts.length ? <ul className="forecast-products">{result.topProducts.map(product =>
          <li key={product.name}><span>{product.name}</span><strong>{number.format(product.quantity)} units sold</strong></li>
        )}</ul> : <p>No products recorded in the last {result.historicalDays} days.</p>}
      </section>
      <section className="report-panel">
        <details className="forecast-method">
          <summary>How the forecast is calculated</summary>
          <p>{result.qualifyingOrders} qualifying orders across {result.activeSalesDays} selling days in the previous {result.historicalDays} days.</p>
          <ul>{result.notes.map(note => <li key={note}>{note}</li>)}</ul>
        </details>
      </section>
    </>}
  </div>;
}
