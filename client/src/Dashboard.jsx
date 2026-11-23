import React, { useEffect, useState } from 'react';
import {
  ArrowRight, CalendarClock, CheckCircle2, Clock3, ClipboardList,
  Package, Plus, RefreshCw, CakeSlice,
} from 'lucide-react';

// This dashboard shows real MongoDB work, not demonstration numbers.
// Quiet background refreshes do not cover the screen or reset user input.
const peso = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value || 0);
const dateText = value => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
function DueBadge({ value }) {
  const due = new Date(value).getTime();
  const hours = (due - Date.now()) / 3600000;
  const label = hours < 0 ? 'Overdue' : hours < 2 ? 'Due soon' : 'Within 24 hours';
  return <span className={'work-badge ' + (hours < 0 ? 'danger' : hours < 2 ? 'warning' : 'neutral')}>{label}</span>;
}

export default function Dashboard({ request, navigate, user, active = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load(quiet = false) {
      if (!quiet) setLoading(true);
      else setUpdating(true);
      try {
        const result = await request('/api/dashboard', quiet || data ? { refresh: true } : {});
        if (active) { setData(result); setError(''); }
      } catch (e) { if (active) setError(e.message); }
      finally { if (active) { setLoading(false); setUpdating(false); } }
    }
    load(refresh > 0 && data !== null);
    const timer = active ? window.setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 45000) : null;
    return () => { active = false; window.clearInterval(timer); };
  }, [request, refresh, active]);

  const summary = data?.summary;
  const tiles = [
    { label: 'New orders', value: summary?.pendingOrders, detail: 'Waiting for confirmation', icon: ClipboardList, filter: 'Pending', tab: 'orders', tint: 'orange' },
    { label: 'In progress', value: summary?.activeOrders, detail: 'Confirmed or being prepared', icon: Clock3, filter: 'Active', tab: 'orders', tint: 'blue' },
    { label: 'Ready for handoff', value: summary?.readyOrders, detail: 'Ready for collection', icon: CheckCircle2, filter: 'Ready', tab: 'orders', tint: 'green' },
    { label: 'Pickups due', value: summary?.duePickups, detail: 'Overdue or within 24 hours', icon: CalendarClock, page: 'Schedules', tint: 'purple' },
  ];

  return <div className="dashboard-workspace">
    <section className="dash-welcome">
      <div>
        <h2>Shift overview</h2>
      </div>
      <div className="dash-welcome-actions">
        <button type="button" className="light-action" onClick={() => navigate('Orders & Reservations', { tab: 'reservations', create: true })}><CalendarClock size={17}/> New reservation</button>
        <button type="button" className="light-action main-action" onClick={() => navigate('Orders & Reservations', { tab: 'orders', create: true })}><Plus size={18}/> New order</button>
      </div>
    </section>
    {error && <div className="error" role="alert">{error} <button className="inline-retry" type="button" onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
    <div className="dash-stat-grid" aria-label="Current workload">
      {tiles.map(tile => <button key={tile.label} type="button" className="dash-stat" onClick={() => navigate(tile.page || 'Orders & Reservations', tile.page ? {} : { tab: tile.tab, filter: tile.filter })}>
        <span className={'dash-stat-icon ' + tile.tint}><tile.icon size={19}/></span>
        <span className="dash-stat-label">{tile.label}</span>
        <strong>{loading && !data ? '…' : tile.value ?? '—'}</strong>
        <span className="dash-stat-desc">{tile.detail}</span>
      </button>)}
    </div>
    <div className="dash-main-grid">
      <section className="work-panel">
        <div className="work-panel-head"><div><h3>Needs attention</h3></div><button className="text-action" type="button" onClick={() => navigate('Orders & Reservations', { tab: 'orders' })}>All orders <ArrowRight size={16}/></button></div>
        <div className="work-rows">{loading && !data ? <p className="empty-message">Loading orders…</p> : !data?.priorityOrders.length ? <div className="empty-state"><CheckCircle2 size={27}/><strong>Queue is clear</strong><p>New and ready orders will appear here.</p></div> : data.priorityOrders.map(order =>
          <button type="button" key={order.id} className="work-row" onClick={() => navigate('Orders & Reservations', { tab: 'orders', filter: order.status, search: order.customer })}>
  
            <span className="work-main"><strong>{order.customer}</strong><small>{dateText(order.createdAt)}</small></span>
            <span className="work-row-right"><strong>{peso(order.total)}</strong><span className={'work-badge ' + (order.status === 'Pending' ? 'warning' : 'success')}>{order.status}</span></span><ArrowRight size={16} className="work-row-arrow"/>
          </button>)}
        </div>
      </section>
      <section className="work-panel">
        <div className="work-panel-head"><div><h3>Upcoming deadlines</h3></div><button className="text-action" type="button" onClick={() => navigate('Schedules')}>Schedule <ArrowRight size={16}/></button></div>
        <div className="work-rows">{loading && !data ? <p className="empty-message">Loading deadlines…</p> : !data?.deadlines.length ? <div className="empty-state"><CalendarClock size={27}/><strong>Nothing urgent</strong><p>No active deadlines due within 24 hours.</p></div> : data.deadlines.map(item =>
          <button type="button" key={item.kind + item.id} className="work-row" onClick={() => navigate(item.kind === 'Cake' ? 'Cake Production' : 'Orders & Reservations', item.kind === 'Cake' ? { filter: item.status, search: item.customer } : { tab: 'reservations', filter: item.status, search: item.customer })}>
  
            <span className="work-main"><strong>{item.customer}</strong><small>{item.detail} · {dateText(item.dueAt)}</small></span>
            <span className="work-row-right"><DueBadge value={item.dueAt}/><small>{item.status}</small></span><ArrowRight size={16} className="work-row-arrow"/>
          </button>)}
        </div>
      </section>
    </div>
    <div className="dash-foot-row">
      <button className="mini-summary" onClick={() => navigate('Cake Production')}><CakeSlice size={19}/><strong>{summary?.activeCakes ?? '—'}</strong><span>Active custom cake jobs</span><ArrowRight size={16}/></button>
      <button className="mini-summary" onClick={() => navigate('Inventory')}><Package size={19}/><strong>{summary?.lowStock ?? '—'}</strong><span>Stock items at or below threshold</span><ArrowRight size={16}/></button>
      <span className="dash-refresh">{data ? `Updated ${new Date(data.checkedAt).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'})}` : 'Waiting for live data'}<button aria-label="Refresh dashboard" title="Refresh dashboard" disabled={updating} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16} className={updating ? 'spinning' : ''}/></button></span>
    </div>
  </div>;
}
