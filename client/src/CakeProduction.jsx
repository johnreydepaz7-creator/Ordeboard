// Phase 2.3 Custom Cake Tracking. Forms open in the existing OrderBoard modal style.
import React, { useEffect, useRef, useState } from 'react';
import { FilterPills, RefreshButton, SearchField, StatusPill, useDebouncedValue, OperationsHeader, OperationsRow } from './WorkflowUI.jsx';
import { Plus, ArrowRight } from 'lucide-react';
const empty = { customerName: '', contact: '', cakeDescription: '', size: '', flavor: '', designInstructions: '', quantity: 1, dueAt: '', materials: [] };
const statuses = ['All', 'Queued', 'Preparing', 'Decorating', 'Ready', 'Completed', 'Cancelled'];
const next = { Queued: ['Preparing', 'Cancelled'], Preparing: ['Decorating', 'Cancelled'], Decorating: ['Ready', 'Cancelled'], Ready: ['Completed', 'Cancelled'] };
const localDate = value => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const niceDate = value => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
export default function CakeProduction({ request, navigate, intent, active = true }) {
  const [inventory, setInventory] = useState([]), [origin, setOrigin] = useState(null);
  const [cakes, setCakes] = useState([]), [search, setSearch] = useState(intent?.search || ''), [filter, setFilter] = useState('All');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [count, setCount] = useState(0);
  const [editing, setEditing] = useState(null), [form, setForm] = useState(empty), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [hasLoaded, setHasLoaded] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const modal = useRef(null), first = useRef(null), submissionKey = useRef(null), latestRequest = useRef(0);
  const debouncedSearch = useDebouncedValue(search);
  async function load(requestedPage = page, force = false) {
    const requestNumber = ++latestRequest.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ search: debouncedSearch, status: filter, page: String(requestedPage) });
      const result = await request(`/api/cake-jobs?${query}`, force ? { refresh: true } : {});
      if (requestNumber === latestRequest.current) { setCakes(result.cakes); setCount(result.count); setPages(result.pages); setError(''); setHasLoaded(true); }
    } catch (e) { if (requestNumber === latestRequest.current) setError(e.message); } finally { if (requestNumber === latestRequest.current) setLoading(false); }
  }
  useEffect(() => { load(); }, [debouncedSearch, filter, page]);
  useEffect(() => { request('/api/inventory').then(r=>setInventory(r.items)).catch(()=>{}); }, [request]);
  useEffect(() => { if(active) request('/api/inventory',{refresh:true}).then(r=>setInventory(r.items)).catch(()=>{}); }, [active,request]);
  // Fetch fresh data when returning to this screen, but never unmount its list.
  const lastActive = useRef(active);
  useEffect(() => {
    if (active && !lastActive.current) load(page, true);
    lastActive.current = active;
  }, [active]);
  // Closing a hidden form releases the global scroll lock after a page switch.
  useEffect(() => { if (!active && !busy) setOpen(false); }, [active, busy]);


  // Active-only background refresh: keep the visible rows on screen.
  // No polling while a form is open, while saving, or in a background tab.
  useEffect(() => {
    if (!active || busy || open) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load(page, true);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [active, busy, open, page, filter, debouncedSearch]);
  useEffect(() => { if (!intent?.nonce) return; if (intent.filter) setFilter(intent.filter); if (intent.search !== undefined) { setSearch(intent.search); setPage(1); } if (intent.create) newCake(intent.source); }, [intent?.nonce]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; first.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); setOpen(false); }
      if (e.key !== 'Tab') return;
      const controls = [...modal.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0].focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open, busy]);
  function newCake(source=null) { submissionKey.current = crypto.randomUUID(); setEditing(null); setOrigin(source || null); setForm(source ? { ...empty, customerName:source.customerName, contact:source.contact||'', cakeDescription:source.description||'', quantity:Math.min(Number(source.quantity)||1,1000), dueAt:source.dueAt ? localDate(source.dueAt) : '' } : { ...empty }); setError(''); setNotice(''); setOpen(true); }
  function editCake(cake) {
    const { customerName, contact, cakeDescription, size, flavor, designInstructions, quantity } = cake;
    setOrigin(cake.sourceType ? {type:cake.sourceType,id:cake.sourceId} : null);
    setForm({ customerName, contact, cakeDescription, size, flavor, designInstructions, quantity, dueAt: localDate(cake.dueAt), materials:cake.materials || [] });
    submissionKey.current = null; setEditing(cake.id); setError(''); setNotice(''); setOpen(true);
  }
  function field(name, value) { setForm(prev => ({ ...prev, [name]: value })); }
  async function save(e) {
    e.preventDefault(); if (busy) return;
    const createNext = !editing && e.nativeEvent.submitter?.value === 'create-next';
    setBusy(true); setError('');
    try {
      const data = { ...form, quantity: Number(form.quantity), materials:form.materials.map(m=>({item:m.item,quantity:Number(m.quantity)})), dueAt: new Date(form.dueAt).toISOString(), ...(!editing && origin ? {sourceType:origin.type,sourceId:origin.id} : {}) };
      await request(editing ? `/api/cake-jobs/${editing}` : '/api/cake-jobs', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', ...(!editing ? { 'Idempotency-Key': submissionKey.current } : {}) }, body: JSON.stringify(data) });
      if (createNext) {
        submissionKey.current = crypto.randomUUID();
        setOrigin(null); setForm({ ...empty });
        setNotice('Cake job created. Enter the next job.');
        first.current?.focus();
      } else {
        submissionKey.current = null;
        setOpen(false);
        setNotice(editing ? 'Cake job updated.' : 'Cake job created.');
      }
      setPage(1); await load(1);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function changeStatus(cake, status) {
    if (busy) return;
    if (status==='Preparing' && !cake.materials?.length && !window.confirm('No materials are assigned to this cake job. Inventory will NOT be reduced. Start preparation anyway?')) return;
    if (['Completed','Cancelled'].includes(status) && !window.confirm(`${status === 'Cancelled' ? 'Cancel' : 'Complete'} ${cake.customerName}'s cake job?`)) return;
    setBusy(true); setError('');
    try { await request(`/api/cake-jobs/${cake.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice('Production status updated.'); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="orders-module">
    <div className="orders-toolbar"><div><strong>{count} matching cake jobs</strong></div><div className="toolbar-actions"><RefreshButton loading={loading} onClick={()=>load(page,true)}/><button type="button" className="status-button" onClick={()=>navigate?.('Inventory')}>Inventory</button><button type="button" className="order-action" onClick={()=>newCake()}><Plus size={18}/> New cake job</button></div></div>
    <div className="workflow-controls"><SearchField value={search} onChange={value=>{setSearch(value);setPage(1)}} placeholder="Search customer or cake…"/><FilterPills options={statuses} value={filter} onChange={value=>{setFilter(value);setPage(1)}}/></div>
    {!open && error && <div className="error" role="alert">{error}</div>}{notice && <div className="success-note" role="status">{notice}</div>}
    {open && <div className="order-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
      <section className="order-editor order-modal" role="dialog" aria-modal="true" aria-labelledby="cake-form-title" ref={modal}>
        <div className="order-section-head"><h3 id="cake-form-title">{editing ? 'Edit cake job' : origin ? `Cake for ${origin.type}` : 'New cake job'}</h3><button type="button" className="status-button" disabled={busy} onClick={() => setOpen(false)}>✕ Close</button></div>
        {error && <div className="error" role="alert">{error}</div>}
        <form className="order-form" onSubmit={save}>
          <label>Customer name<input ref={first} required readOnly={Boolean(origin)} maxLength={120} value={form.customerName} onChange={e => field('customerName', e.target.value)}/></label>
          <label>Contact (optional)<input readOnly={Boolean(origin)} maxLength={100} value={form.contact} onChange={e => field('contact', e.target.value)}/></label>
          <label className="order-wide">Cake description<input required maxLength={300} value={form.cakeDescription} onChange={e => field('cakeDescription', e.target.value)} placeholder="e.g. Birthday cake"/></label>
          <label>Size / shape<input required maxLength={80} value={form.size} onChange={e => field('size', e.target.value)} placeholder="e.g. 8-inch round"/></label>
          <label>Flavor<input required maxLength={100} value={form.flavor} onChange={e => field('flavor', e.target.value)}/></label>
          <label>Quantity<input type="number" required min="1" max="1000" step="1" value={form.quantity} onChange={e => field('quantity', e.target.value)}/></label>
          <label>Required date and time<input type="datetime-local" required min={localDate(Date.now())} value={form.dueAt} onChange={e => field('dueAt', e.target.value)}/></label>
          <div className="order-wide production-materials"><strong>Inventory materials (total for this job)</strong>
            <small>Selected stock is deducted once when preparation starts. Leave empty only if this job uses no tracked stock.</small>
            {form.materials.map((m,index)=><div className="production-material-row" key={index}>
              <select aria-label={`Stock item ${index+1}`} disabled={Boolean(editing && cakes.find(c=>c.id===editing)?.status!=='Queued')} required value={m.item} onChange={e=>field('materials',form.materials.map((x,i)=>i===index?{...x,item:e.target.value}:x))}>
                <option value="">Select stock item</option>{inventory.map(item=><option value={item._id} key={item._id}>{item.name} ({item.quantity} {item.unit} available)</option>)}
              </select>
              <input aria-label={`Total units ${index+1}`} type="number" min="1" step="1" required value={m.quantity} disabled={Boolean(editing && cakes.find(c=>c.id===editing)?.status!=='Queued')} onChange={e=>field('materials',form.materials.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/>
              <button type="button" className="status-button" disabled={Boolean(editing && cakes.find(c=>c.id===editing)?.status!=='Queued')} onClick={()=>field('materials',form.materials.filter((_,i)=>i!==index))}>Remove</button>
            </div>)}
            {!(editing && cakes.find(c=>c.id===editing)?.status!=='Queued') && <button type="button" className="status-button" disabled={inventory.length===0 || form.materials.length>=30} onClick={()=>field('materials',[...form.materials,{item:'',quantity:1}])}>+ Add material</button>}
          </div>
          <label className="order-wide">Design / dedication / special instructions<textarea rows="4" maxLength={1500} value={form.designInstructions} onChange={e => field('designInstructions', e.target.value)}/></label>
          <div className="order-modal-actions"><button className="status-button" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>{!editing && !origin && <button type="submit" value="create-next" className="status-button" disabled={busy}>Save & new</button>}<button className="order-action" type="submit" value="save" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create cake job'}</button></div>
        </form>
      </section>
    </div>}
    <div className="operations-list" aria-busy={loading}>
      <OperationsHeader third="Due"/>
      {loading && !hasLoaded ? <div className="empty-state">Loading cake jobs…</div> : cakes.length === 0 ? <div className="empty-state"><strong>No cake jobs found</strong><p>Try a different filter or create a cake job.</p></div> : cakes.map(cake => <OperationsRow key={cake.id}
        customer={cake.customerName} subline={cake.contact || ''}
        details={`${cake.quantity} × ${cake.cakeDescription} · ${cake.size} · ${cake.flavor}`}
        note={[cake.sourceType ? `From ${cake.sourceType}` : '', cake.materials?.length ? `${cake.materials.length} stock items ${cake.stockDeductedAt ? 'used' : 'planned'}` : 'No stock assigned', cake.designInstructions ? `Instructions: ${cake.designInstructions}` : ''].filter(Boolean).join(' · ')}
        when={<strong>{niceDate(cake.dueAt)}</strong>}
        status={<StatusPill status={cake.status}/>}
        actions={<>
          {cake.sourceType && <button type="button" className="status-button" onClick={()=>navigate?.('Orders & Reservations',{tab:cake.sourceType==='order'?'orders':'reservations',search:cake.customerName})}>View {cake.sourceType}</button>}
          {(next[cake.status] || []).filter(status => status !== 'Cancelled').map(status => <button type="button" key={status} className="next-action" disabled={busy} onClick={() => changeStatus(cake, status)}>
            {status === 'Preparing' ? 'Start prep' : status === 'Decorating' ? 'Decorate' : status === 'Ready' ? 'Mark ready' : 'Complete'} <ArrowRight size={14}/>
          </button>)}
          {!['Completed', 'Cancelled'].includes(cake.status) && <button type="button" className="status-button" disabled={busy} onClick={() => editCake(cake)}>Edit</button>}
          {(next[cake.status] || []).includes('Cancelled') && <button type="button" className="cancel-action" disabled={busy} onClick={() => changeStatus(cake, 'Cancelled')}>Cancel</button>}
        </>}/>) }
    </div>
    <div className="orders-pagination"><button className="status-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="status-button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div>
  </div>;
}
