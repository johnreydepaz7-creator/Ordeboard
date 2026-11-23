// Phase 2.1 order screen. Kept separate so Phase 1 authentication remains unchanged.
import React, { useEffect, useRef, useState } from 'react';
import { FilterPills, RefreshButton, SearchField, StatusPill, useDebouncedValue, OperationsHeader, OperationsRow } from './WorkflowUI.jsx';
import { Plus, ArrowRight } from 'lucide-react';

const STATUS = ['All', 'Pending', 'Active', 'Confirmed', 'In production', 'Ready', 'Completed', 'Cancelled'];
const NEXT = { Pending: ['Confirmed', 'Cancelled'], Confirmed: ['In production', 'Cancelled'], 'In production': ['Ready', 'Cancelled'], Ready: ['Completed', 'Cancelled'] };
const BLANK = { customerName: '', contact: '', source: 'Walk-in', items: [{ name: '', quantity: 1, unitPrice: '' }], notes: '', paymentStatus: 'Unpaid', fulfillmentAt: '' };
const localInput = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const money = value => `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Orders({ request, navigate, intent, active = true }) {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState(intent?.search || '');
  const [filter, setFilter] = useState(intent?.filter || 'All');
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const creationKey = useRef(null);
  const latestRequest = useRef(0);
  const modalRef = useRef(null);
  const firstFieldRef = useRef(null);

  // Keep keyboard focus in the pop-up and close it with Escape (when not saving).
  useEffect(() => {
    if (!showForm) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstFieldRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); setShowForm(false); }
      if (event.key === 'Tab' && modalRef.current) {
        const controls = [...modalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
        if (!controls.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus?.(); };
  }, [showForm, busy]);

  async function load(requestedPage = page, force = false) {
    const requestNumber = ++latestRequest.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: debouncedSearch, status: filter, page: String(requestedPage) });
      const data = await request(`/api/orders?${params}`, force ? { refresh: true } : {});
      if (requestNumber === latestRequest.current) { setOrders(data.orders); setPages(data.pages); setCount(data.count); setError(''); setHasLoaded(true); }
    } catch (err) { if (requestNumber === latestRequest.current) setError(err.message); }
    finally { if (requestNumber === latestRequest.current) setLoading(false); }
  }
  useEffect(() => { load(); }, [filter, page, debouncedSearch]);
  // Fetch fresh data when returning to this screen, but never unmount its list.
  const lastActive = useRef(active);
  useEffect(() => {
    if (active && !lastActive.current) load(page, true);
    lastActive.current = active;
  }, [active]);
  // Closing a hidden form releases the global scroll lock after a page switch.
  useEffect(() => { if (!active && !busy) setShowForm(false); }, [active, busy]);


  // Active-only background refresh: keep the visible rows on screen.
  // No polling while a form is open, while saving, or in a background tab.
  useEffect(() => {
    if (!active || busy || showForm) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(page, true);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [active, busy, showForm, page, filter, debouncedSearch]);
  useEffect(() => { if (!intent?.nonce) return; if (intent.filter) setFilter(intent.filter); if (intent.search !== undefined) { setSearch(intent.search); setPage(1); } if (intent.create) startCreate(); }, [intent?.nonce]);
  function changeItem(index, field, value) {
    setForm(previous => ({ ...previous, items: previous.items.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  }
  function startCreate() { creationKey.current=crypto.randomUUID(); setEditing(null); setForm({ ...BLANK, items: [{ name: '', quantity: 1, unitPrice: '' }] }); setError(''); setNotice(''); setShowForm(true); }
  function startEdit(order) { setEditing(order.id); setForm({ customerName: order.customerName, contact: order.contact, source: order.source, items: order.items.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })), notes: order.notes, paymentStatus: order.paymentStatus, fulfillmentAt: order.fulfillmentAt ? localInput(order.fulfillmentAt) : '' }); setError(''); setNotice(''); setShowForm(true); }
  async function save(event) {
    event.preventDefault(); if (busy) return;
    const createNext = !editing && event.nativeEvent.submitter?.value === 'create-next';
    setBusy(true); setError(''); setNotice('');
    try {
      if (form.items.some(i => !Number.isFinite(Number(i.unitPrice)) || Number(i.unitPrice) <= 0)) { setError('Every product needs a unit price greater than ₱0.00.'); setBusy(false); return; }
      const payload = { ...form, fulfillmentAt: form.fulfillmentAt ? new Date(form.fulfillmentAt).toISOString() : null, items: form.items.map(i => ({ name: i.name.trim(), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })) };
      await request(editing ? `/api/orders/${editing}` : '/api/orders', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(!editing ? { 'Idempotency-Key': creationKey.current } : {}) }, body: JSON.stringify(payload) });
      if (createNext) {
        // A new idempotency key is required for each additional order.
        creationKey.current = crypto.randomUUID();
        setForm({ ...BLANK, items: [{ name: '', quantity: 1, unitPrice: '' }] });
        setNotice('Order created. Enter the next order.');
        firstFieldRef.current?.focus();
      } else {
        setShowForm(false); setEditing(null);
        setNotice(editing ? 'Order updated.' : 'Order created.');
      }
      setPage(1); await load(1);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function changeStatus(order, status) {
    if (busy) return;
    // Everyday status progress needs one click; closing/cancelling work is confirmed.
    if (['Completed', 'Cancelled'].includes(status) && !window.confirm(`${status === 'Cancelled' ? 'Cancel' : 'Complete'} ${order.customerName}'s order?`)) return;
    setBusy(true); setError(''); setNotice('');
    try { await request(`/api/orders/${order.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice('Order status updated.'); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
  return <div className="orders-module">
    <div className="orders-toolbar"><div><strong>{count} matching orders</strong></div><div className="toolbar-actions"><RefreshButton loading={loading} onClick={() => load(page, true)}/><button type="button" className="order-action" onClick={startCreate}><Plus size={18}/> New order</button></div></div>
    <div className="workflow-controls"><SearchField value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder="Search customer…"/><FilterPills options={STATUS} value={filter} onChange={value => { setFilter(value); setPage(1); }}/></div>
    {error && !showForm && <div className="error" role="alert">{error}</div>}
    {notice && <div className="success-note" role="status">{notice}</div>}
    {showForm && <div className="order-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setShowForm(false); }}>
      <section className="order-editor order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title" ref={modalRef}>
      <div className="order-section-head"><h3 id="order-modal-title">{editing ? 'Edit order' : 'Create order'}</h3><button type="button" className="status-button" disabled={busy} onClick={() => setShowForm(false)} aria-label="Close order form">✕ Close</button></div>
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success-note" role="status">{notice}</div>}
      <form onSubmit={save} className="order-form">
        <label>Customer name<input ref={firstFieldRef} required maxLength={120} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })}/></label>
        <label>Contact (optional)<input maxLength={100} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })}/></label>
        <label>Order source<select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>{['Walk-in','Phone','Facebook','Delivery app','Other'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Payment status<select value={form.paymentStatus} onChange={e => setForm({ ...form, paymentStatus: e.target.value })}>{['Unpaid','Partially paid','Paid'].map(s => <option key={s}>{s}</option>)}</select></label>
        <div className="order-items"><strong>Order items</strong>{form.items.map((item, index) => <div className="order-item" key={index}>
          <label>Product<input required maxLength={120} value={item.name} onChange={e => changeItem(index, 'name', e.target.value)}/></label>
          <label>Quantity<input type="number" min="1" max="10000" step="1" required value={item.quantity} onChange={e => changeItem(index, 'quantity', e.target.value)}/></label>
          <label>Unit price (₱)<input type="number" min="0.01" max="10000000" step="0.01" required value={item.unitPrice} onChange={e => changeItem(index, 'unitPrice', e.target.value)}/></label>
          <button type="button" className="status-button" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>Remove</button>
        </div>)}<button type="button" className="status-button" disabled={form.items.length >= 30} onClick={() => setForm({ ...form, items: [...form.items, { name: '', quantity: 1, unitPrice: '' }] })}>+ Add product</button></div>
        <label>Needed by (optional)<input type="datetime-local" value={form.fulfillmentAt} min={localInput(Date.now())} onChange={e => setForm({ ...form, fulfillmentAt: e.target.value })}/></label>
        <label className="order-wide">Notes (optional)<textarea rows="3" maxLength={1000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></label>
        <div className="order-total">Calculated total: <strong>{money(subtotal)}</strong></div>
        <div className="order-modal-actions"><button type="button" className="status-button" disabled={busy} onClick={() => setShowForm(false)}>Cancel</button>{!editing && <button type="submit" value="create-next" className="status-button" disabled={busy}>Save & new</button>}<button className="order-action" type="submit" value="save" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create order'}</button></div>
      </form>
    </section></div>}
    <div className="operations-list" aria-busy={loading}>
      <OperationsHeader third="Created / total"/>
      {loading && !hasLoaded ? <div className="empty-state">Loading orders…</div>
        : orders.length === 0 ? <div className="empty-state"><strong>No orders found</strong><p>Try another search or create a new order.</p></div>
        : orders.map(order => <OperationsRow key={order.id}
            customer={order.customerName}
            subline={[order.source, order.contact].filter(Boolean).join(' · ')}
            details={order.items.map(item => `${item.quantity} × ${item.name}`).join(' · ')}
            note={[order.fulfillmentAt ? `Needed: ${new Date(order.fulfillmentAt).toLocaleString('en-PH', {dateStyle:'short',timeStyle:'short'})}` : '', order.notes ? `Note: ${order.notes}` : ''].filter(Boolean).join(' · ')}
            when={<><strong>{money(order.total)}</strong><small>{new Date(order.createdAt).toLocaleDateString('en-PH', { month:'short', day:'numeric', year:'numeric' })}</small></>}
            status={<><StatusPill status={order.status}/><small>{order.paymentStatus}</small></>}
            actions={<>
              {order.cake ? <button type="button" className="status-button" onClick={() => navigate?.('Cake Production', {search: order.customerName})}>Cake: {order.cake.status}</button> : ['Confirmed','In production'].includes(order.status) ? <button type="button" className="next-action" onClick={() => navigate?.('Cake Production', {create:true, source:{type:'order', id:order.id, customerName:order.customerName, contact:order.contact, description:order.items.map(i=>i.name).join(', ').slice(0,300), quantity:order.items.reduce((n,i)=>n+i.quantity,0), dueAt:order.fulfillmentAt}})}>Send to cake</button> : null}
              {(NEXT[order.status] || []).filter(status => status !== 'Cancelled' && !(order.cake && ['In production','Ready'].includes(status))).map(status =>
                <button key={status} type="button" className="next-action" disabled={busy} onClick={() => changeStatus(order, status)}>
                  {status === 'Confirmed' ? 'Confirm' : status === 'In production' ? 'Start production' : status === 'Ready' ? 'Mark ready' : 'Complete'} <ArrowRight size={14}/>
                </button>)}
              {!['Completed','Cancelled'].includes(order.status) && <button type="button" className="status-button" disabled={busy} onClick={() => startEdit(order)}>Edit</button>}
              {(NEXT[order.status] || []).includes('Cancelled') && <button type="button" className="cancel-action" disabled={busy} onClick={() => changeStatus(order, 'Cancelled')}>Cancel</button>}
            </>}/>) }
    </div>
    <div className="orders-pagination"><button className="status-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="status-button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
