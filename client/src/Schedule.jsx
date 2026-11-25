import React, { useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, ChevronRight, RefreshCw } from 'lucide-react';
import './schedule.css';

const scheduleDay = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
const scheduleTime = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });
const reminderTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

function localDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function DaySchedule({ items, navigate }) {
  const grouped = new Map();
  for (const entry of items) {
    const day = localDate(new Date(entry.at));
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(entry);
  }

  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([day, entries]) =>
    <section className="schedule-day" key={day} aria-labelledby={'schedule-day-' + day}>
      <header className="schedule-day-header">
        <h4 id={'schedule-day-' + day}><time dateTime={day}>{scheduleDay.format(new Date(day + 'T12:00:00'))}</time></h4>
        <span>{entries.length} {entries.length === 1 ? 'item' : 'items'}</span>
      </header>
      <ul className="schedule-entries">
        {entries.map(entry => <li className="schedule-entry" key={entry.type + entry.id}>
          <time className="schedule-entry-time" dateTime={entry.at}>{scheduleTime.format(new Date(entry.at))}</time>
          <div className="schedule-entry-details">
            <strong>{entry.customer}</strong>
            <span>{entry.quantity} × {entry.detail}</span>
            <div className="schedule-entry-tags"><span>{entry.type}</span><span>{entry.status}</span></div>
          </div>
          <button type="button" className="status-button" onClick={() => {
            if (entry.type === 'Cake') {
              navigate?.('Cake Production', { search: entry.customer });
            } else {
              navigate?.('Orders & Reservations', {
                tab: entry.type === 'Order' ? 'orders' : 'reservations',
                search: entry.customer,
              });
            }
          }}>Open {entry.type.toLowerCase()}<ChevronRight size={13} aria-hidden="true"/></button>
        </li>)}
      </ul>
    </section>
  );
}

function Reminders({ reminders, error, truncated, headingRef }) {
  const overdue = reminders?.filter(entry => entry.urgency === 'Overdue').length ?? 0;
  return <aside className="order-card schedule-reminders" aria-labelledby="schedule-reminders-title">
    <h3 id="schedule-reminders-title" ref={headingRef} tabIndex={-1}>
      <Bell size={17} aria-hidden="true"/> Reminders
    </h3>
    {reminders?.length > 0 && <div className="schedule-reminder-counts">
      <span className="schedule-urgency" data-overdue="true">{overdue} overdue</span>
      <span className="schedule-urgency">{reminders.length - overdue} due within 24 hours</span>
    </div>}
    {error && <p role="alert" className="error">{error}</p>}
    {truncated && <p role="status">Some reminders may be missing. The list shows up to 100 per work type.</p>}
    {!reminders && !error && <p role="status">Loading reminders…</p>}
    {reminders?.length === 0 && !error && <p>No due or overdue work found.</p>}
    {reminders?.length > 0 && <div className="schedule-reminder-scroll" tabIndex={0} role="region" aria-label="Reminder list">
      <ul className="schedule-entries">
        {reminders.map(entry => <li className="schedule-reminder-item" key={entry.type + entry.id}>
          <div className="schedule-reminder-meta">
            <span className="schedule-urgency" data-overdue={entry.urgency === 'Overdue'}>{entry.urgency}</span>
            <span>{entry.type} · {entry.status}</span>
          </div>
          <strong>{entry.customer}</strong>
          <p>{entry.detail}</p>
          <time dateTime={entry.at}>{reminderTime.format(new Date(entry.at))}</time>
        </li>)}
      </ul>
    </div>}
  </aside>;
}

export default function Schedule({ request, navigate, active = true }) {
  const [reminders, setReminders] = useState(null);
  const [reminderError, setReminderError] = useState('');
  const [reminderTruncated, setReminderTruncated] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [start, setStart] = useState(() => localDate(new Date()));
  const [days, setDays] = useState(7);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const wasActive = useRef(active);
  const reminderHeading = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const filters = new URLSearchParams({ start, days: String(days) });
    request(`/api/schedule?${filters}`, refreshTick ? { refresh: true } : {}).then(data => {
      if (!alive) return;
      setItems(data.items);
      setTruncated(data.truncated);
      setError('');
      setHasLoaded(true);
    }).catch(error => {
      if (alive) setError(error.message);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [start, days, request, refreshTick]);

  useEffect(() => {
    let alive = true;
    request('/api/schedule/reminders', refreshTick ? { refresh: true } : {}).then(data => {
      if (!alive) return;
      setReminders(data.items);
      setReminderTruncated(data.truncated);
      setReminderError('');
    }).catch(error => {
      if (alive) setReminderError(error.message);
    });
    return () => { alive = false; };
  }, [request, refreshTick]);

  useEffect(() => {
    if (active && !wasActive.current) setRefreshTick(value => value + 1);
    wasActive.current = active;
  }, [active]);

  return <section className="schedule-layout" aria-labelledby="schedule-title">
    <header className="order-card schedule-toolbar">
      <div>
        <h3 id="schedule-title"><CalendarDays size={18} aria-hidden="true"/> Production &amp; Pickup Schedule</h3>
        <p>Scheduled orders, cake deadlines and reservation pickups.</p>
      </div>
      <div className="schedule-toolbar-actions">
        <button type="button" className="status-button schedule-jump" onClick={() => {
          reminderHeading.current?.scrollIntoView({ block: 'start' });
          reminderHeading.current?.focus({ preventScroll: true });
        }}>
          <Bell size={15} aria-hidden="true"/> Reminders{reminders ? ` (${reminders.length})` : ''}
        </button>
        <button type="button" className="status-button" onClick={() => setRefreshTick(value => value + 1)}>
          <RefreshCw size={15} aria-hidden="true"/> Refresh
        </button>
      </div>
    </header>

    <div className="schedule-columns">
      <section className="schedule-agenda" aria-labelledby="schedule-agenda-title">
        <div className="order-card schedule-controls">
          <h3 id="schedule-agenda-title">Day-by-day schedule</h3>
          <div className="schedule-filters">
            <label>From<input type="date" value={start} onChange={event => setStart(event.target.value)}/></label>
            <label>Period<select value={days} onChange={event => setDays(Number(event.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={31}>31 days</option>
            </select></label>
          </div>
        </div>
        {error && <div role="alert" className="error">{error}</div>}
        {truncated && <p role="status">Many records found. Narrow the date range to see all entries.</p>}
        {loading && !hasLoaded ? <p role="status">Loading schedule…</p>
          : items.length > 0 ? <DaySchedule items={items} navigate={navigate}/>
          : !error && <p className="order-card schedule-empty">No upcoming scheduled work in this period.</p>}
      </section>

      <Reminders reminders={reminders} error={reminderError} truncated={reminderTruncated} headingRef={reminderHeading}/>
    </div>
  </section>;
}