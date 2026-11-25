import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, TrendingUp } from 'lucide-react';
import './forecast.css';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayMs = 86_400_000;
const fullDate = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthDate = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });
const orderCount = count => number.format(count) + (count === 1 ? ' order' : ' orders');
const demandRanges = [
  { level: 'quiet', max: 0 },
  { level: 'low', max: 1 },
  { level: 'moderate', max: 3 },
  { level: 'high', max: 5 },
  { level: 'very-high', max: Infinity },
];

function shiftMonth(month, offset) {
  const date = new Date(month + '-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function calendarWeeks(month, records) {
  const start = Date.parse(month + '-01');
  const end = Date.parse(shiftMonth(month, 1) + '-01');
  const firstWeekday = (new Date(start).getUTCDay() + 6) % 7;
  const weeks = [Array(firstWeekday).fill(null)];

  for (let time = start; time < end; time += dayMs) {
    if (weeks.at(-1).length === 7) weeks.push([]);
    const date = new Date(time);
    weeks.at(-1).push({
      date: date.toISOString().slice(0, 10),
      time,
      dayOfMonth: date.getUTCDate(),
      ...records[date.toISOString().slice(0, 10)],
    });
  }
  const lastWeek = weeks.at(-1);
  while (lastWeek.length < 7) lastWeek.push(null);
  return weeks;
}

function projectedOrders(days) {
  return days.reduce((sum, day) => sum + Math.round(day.prediction.expectedOrders * 10), 0) / 10;
}

function projectedProducts(days) {
  const totals = new Map();
  for (const day of days) {
    for (const { name, expectedUnits } of day.prediction.products) {
      totals.set(name, (totals.get(name) || 0) + Math.round(expectedUnits * 10));
    }
  }
  return [...totals].map(([name, units]) => ({ name, expectedUnits: units / 10 }));
}

function ProductList({ products }) {
  return <ul className="forecast-products">{products.map(({ name, expectedUnits }) =>
    <li key={name}><span>{name}</span><strong>{number.format(expectedUnits)} {expectedUnits === 1 ? 'unit' : 'units'}</strong></li>
  )}</ul>;
}

function ExpectedProducts({ products, title = 'Expected product demand' }) {
  const ranked = [...products].sort((a, b) => b.expectedUnits - a.expectedUnits || a.name.localeCompare(b.name));
  const remaining = ranked.slice(5);
  return <div className="forecast-expected-products">
    <h4>{title}</h4>
    {ranked.length ? <ProductList products={ranked.slice(0, 5)}/> : <p>No products expected.</p>}
    {remaining.length > 0 && <details>
      <summary>Show {remaining.length} more {remaining.length === 1 ? 'product' : 'products'}</summary>
      <ProductList products={remaining}/>
    </details>}
  </div>;
}

function MonthSummary({ month, records, historical, accuracy, replay }) {
  const label = monthDate.format(Date.parse(month + '-01'));
  const weeks = calendarWeeks(month, records);
  const days = weeks.flat().filter(Boolean);
  const ready = days.every(day => day.prediction);
  const total = ready ? projectedOrders(days) : null;
  const average = ready ? orderCount(Math.round(total / days.length * 10) / 10) : null;
  return <details className="forecast-month-summary">
    <summary>
      <span>Next month, {label}{ready ? <>, is expected to have an average of <strong>{average} per day</strong>.</> : ' · forecast unavailable'}
        {historical.history.length > 0 && <> Past records show an average of <strong>{orderCount(historical.average)} for the full month</strong> across {historical.history.length} recorded {historical.history.length === 1 ? 'year' : 'years'}.</>}
      </span>
      <span className="forecast-expand-label">Month details <ChevronRight size={15} aria-hidden="true"/></span>
    </summary>
    <div className="forecast-summary-content">
      {historical.history.length > 0 && <section>
        <h4>Same month in past years</h4>
        <p>{historical.history.length === 1 ? 'One complete month on record' : `Across ${historical.history.length} complete years, an average of ${orderCount(historical.average)}`}.</p>
        <ul>{historical.history.map(row => <li key={row.year}>{row.year} · {orderCount(row.orders)} completed{row.savedForecast != null && ` · forecast ${orderCount(row.savedForecast)}`}</li>)}</ul>
        <ExpectedProducts products={historical.products} title="Average units in those months"/>
      </section>}
      {!historical.history.length && <p>No complete prior occurrence of this month is recorded yet.</p>}
      {ready && <><p><strong>{orderCount(total)}</strong> estimated for the full month.</p>
      <ExpectedProducts products={projectedProducts(days)}/>
      <div className="forecast-week-breakdown">
        <h4>Weekly demand</h4>
        {weeks.map(week => {
          const weekDays = week.filter(Boolean);
          const first = weekDays[0];
          const last = weekDays.at(-1);
          return <details key={first.date}>
            <summary>
              <span>{shortDate.formatRange(first.time, last.time)}</span>
              <strong>{orderCount(projectedOrders(weekDays))}</strong>
            </summary>
            <ExpectedProducts products={projectedProducts(weekDays)}/>
          </details>;
        })}
      </div></>}
      {accuracy && <p>Across {accuracy.samples} saved forecasts, the average daily error was {orderCount(accuracy.blended)} with the blend and {orderCount(accuracy.weekday)} with the weekday estimate.</p>}
      {replay && <p>Historical replay over {replay.samples} days with same-date history: average error of {orderCount(replay.blended)} for the blend and {orderCount(replay.weekday)} for the weekday estimate.</p>}
    </div>
  </details>;
}

function rangeLabel(index) {
  if (index === 0) return '0 (no orders expected)';
  const min = (demandRanges[index - 1].max + 0.1).toFixed(1);
  const { max } = demandRanges[index];
  return Number.isFinite(max) ? `${min}–${max.toFixed(1)}` : `${min}+`;
}

function CalendarLegend({ ready, unavailable }) {
  return <ul className="forecast-legend" aria-label="Calendar legend">
    {ready && demandRanges.map(({ level }, index) => <li key={level}>
      <span data-status={level} aria-hidden="true"/> {rangeLabel(index)}
    </li>)}
    {unavailable && <li><span data-status="unavailable" aria-hidden="true"/> Estimate unavailable</li>}
    <li><Flame className="forecast-busiest-icon" size={13} aria-hidden="true"/> Busiest days</li>
    <li><span className="forecast-legend-today" aria-hidden="true"/> Today</li>
  </ul>;
}

function ForecastCalendar({ weeks, today, label, onSelect }) {
  const peak = Math.max(0, ...weeks.flat().map(day => day?.prediction?.expectedOrders ?? 0));

  return <table className="forecast-calendar" aria-label={`${label} demand forecast`}>
    <thead><tr>{weekdays.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
    <tbody>{weeks.map((week, index) => <tr key={index}>
      {week.map((day, column) => {
        if (!day) return <td key={column}/>;
        const { date, time, dayOfMonth, prediction } = day;
        const status = prediction ? demandRanges.find(({ max }) => prediction.expectedOrders <= max).level : 'unavailable';
        const isBusiest = peak > 0 && prediction?.expectedOrders === peak;
        const isToday = date === today;
        const estimate = prediction ? 'an average of ' + orderCount(prediction.expectedOrders) : 'estimate unavailable';
        const peakLabel = isBusiest ? ', busiest day' : '';
        return <td key={column}>
          <button
            type="button"
            className="forecast-calendar-day"
            data-status={status}
            aria-haspopup="dialog"
            aria-current={isToday ? 'date' : undefined}
            aria-label={`${fullDate.format(time)}, ${estimate}${peakLabel}`}
            onClick={() => onSelect(day)}
          >
            <time dateTime={date}>{dayOfMonth}</time>
            {isBusiest && <Flame className="forecast-busiest-icon" size={13} aria-hidden="true"/>}
            <span>{prediction ? number.format(prediction.expectedOrders) : '—'}</span>
          </button>
        </td>;
      })}
    </tr>)}</tbody>
  </table>;
}

function DayDetails({ day, today, onClose }) {
  const dialog = useRef(null);
  const { date, time, prediction } = day;
  const label = fullDate.format(time);

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return <dialog
    className="forecast-day-dialog"
    ref={dialog}
    aria-labelledby="forecast-day-title"
    onClose={onClose}
    onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}
  >
    <div className="forecast-dialog-content">
      <header className="forecast-dialog-header">
        <h3 id="forecast-day-title">{label}</h3>
        <form method="dialog"><button className="status-button" type="submit">Close</button></form>
      </header>
      {prediction ? <>
        {date < today
          ? <p>The saved forecast expected an average of <strong>{orderCount(prediction.expectedOrders)}</strong>.</p>
          : <p>Based on past orders, we expect an average of <strong>{orderCount(prediction.expectedOrders)}</strong> on this day.</p>}
        <p>Recent weekday average: {orderCount(prediction.weekdayAverage)} ({Math.round((1 - prediction.historicalWeight) * 100)}%).</p>
        {prediction.years > 0 && <p>Same-date average: {orderCount(prediction.annualAverage)} across {prediction.years} prior {prediction.years === 1 ? 'year' : 'years'} ({Math.round(prediction.historicalWeight * 100)}%).</p>}
        <ExpectedProducts products={prediction.products}/>
      </> : <p>{date < today ? 'No advance forecast was saved for this date.' : 'There isn’t enough recent order history for a forecast.'}</p>}
      {day.actual && <p>Actual completed orders: <strong>{day.actual.orders}</strong>.</p>}
      {day.history?.length > 0 && <section><h4>On this date in past years</h4>
        <ul>{day.history.map(row => <li key={row.date}>{row.date.slice(0, 4)} · {orderCount(row.orders)} completed{row.forecast !== null && ` · forecast ${orderCount(row.forecast)}`}</li>)}</ul>
      </section>}
    </div>
  </dialog>;
}

export default function Forecast({ request, active = true }) {
  const [month, setMonth] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const requested = useRef(false);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setError('');
    const query = new URLSearchParams({ view: 'calendar' });
    if (month) query.set('month', month);
    request('/api/forecast?' + query, { refresh: requested.current }).then(
      data => { if (current) setResult(data); },
      error => { if (current) setError(error.message); },
    );
    requested.current = true;
    return () => { current = false; };
  }, [active, month, refresh, request]);

  if (!result) return <section className="report-panel">
    <h3><TrendingUp size={19} aria-hidden="true"/> Demand Forecast</h3>
    {error ? <>
      <p className="error" role="alert">{error}</p>
      <button type="button" className="status-button" onClick={() => setRefresh(value => value + 1)}>Retry</button>
    </> : <p role="status">Loading demand forecast…</p>}
  </section>;

  const currentMonth = result.today.slice(0, 7);
  const visibleMonth = month ?? currentMonth;
  const nextMonth = shiftMonth(currentMonth, 1);
  const label = monthDate.format(Date.parse(visibleMonth + '-01'));
  const weeks = calendarWeeks(visibleMonth, result.days);

  function changeMonth(offset) {
    setMonth(previous => {
      const next = shiftMonth(previous ?? currentMonth, offset);
      return next === currentMonth ? null : next;
    });
  }

  return <section className="report-panel forecast-layout" aria-labelledby="demand-forecast-title">
    <header className="forecast-toolbar">
      <h3 id="demand-forecast-title"><TrendingUp size={19} aria-hidden="true"/> Demand Forecast</h3>
      <button className="status-button" type="button" onClick={() => setMonth(null)}>Today</button>
    </header>
    {error && <p className="error" role="alert">{error} <button type="button" className="status-button" onClick={() => setRefresh(value => value + 1)}>Retry</button></p>}
    <MonthSummary key={nextMonth} month={nextMonth} records={result.days} historical={result.historicalMonth} accuracy={result.accuracy} replay={result.replay}/>
    {result.reminders.map(day => <p key={day.date}>{day.date === result.today ? 'Today' : 'In one week'}, {shortDate.format(Date.parse(day.date))}:
      {' '}{day.history.length === 1 ? `${orderCount(day.history[0].orders)} completed on this date in ${day.history[0].date.slice(0, 4)}` :
        `an average of ${orderCount(day.history.reduce((sum, row) => sum + row.orders, 0) / day.history.length)} across ${day.history.length} prior years`}.{' '}
      <button type="button" className="status-button" onClick={() => {
        setMonth(day.date.slice(0, 7));
        setSelectedDay({ ...day, time: Date.parse(day.date) });
      }}>View day</button>
    </p>)}
    <div className="forecast-calendar-header">
      <div>
        <h4 aria-live="polite">{label}</h4>
        <p>Average expected orders per day · Philippine time</p>
      </div>
      <div className="forecast-month-buttons" role="group" aria-label="Change forecast month">
        <button type="button" className="status-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={19} aria-hidden="true"/></button>
        <button type="button" className="status-button" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={19} aria-hidden="true"/></button>
      </div>
    </div>
    {result.month === visibleMonth
      ? <ForecastCalendar weeks={weeks} today={result.today} label={label} onSelect={setSelectedDay}/>
      : !error && <p role="status">Loading month…</p>}
    <CalendarLegend ready={weeks.flat().some(day => day?.prediction)} unavailable={weeks.flat().some(day => day && !day.prediction)}/>
    {active && selectedDay && <DayDetails day={selectedDay} today={result.today} onClose={() => setSelectedDay(null)}/>}
  </section>;
}
