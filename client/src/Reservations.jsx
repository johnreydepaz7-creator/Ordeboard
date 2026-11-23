// Phase 2.2 Reservation screen, using the same pop-up layout as Orders.
import React,{useEffect,useRef,useState} from 'react';
import { FilterPills, RefreshButton, SearchField, StatusPill, useDebouncedValue, OperationsHeader, OperationsRow } from './WorkflowUI.jsx';
import { Plus, ArrowRight } from 'lucide-react';
const blank={customerName:'',contact:'',description:'',quantity:1,pickupAt:'',notes:''};
const statuses=['All','Reserved','Confirmed','Collected','Cancelled'];
const next={Reserved:['Confirmed','Cancelled'],Confirmed:['Collected','Cancelled']};
const stamp=value=>new Date(value).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'});
const localInput=value=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export default function Reservations({request,navigate,intent,active=true}){
 const [records,setRecords]=useState([]),[filter,setFilter]=useState('All'),[search,setSearch]=useState(intent?.search||''),[page,setPage]=useState(1),[pages,setPages]=useState(1),[count,setCount]=useState(0);
 const [form,setForm]=useState(blank),[editing,setEditing]=useState(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[hasLoaded,setHasLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const creationKey=useRef(null),latestRequest=useRef(0);
 const debouncedSearch=useDebouncedValue(search);
 const modal=useRef(null),first=useRef(null);
 async function load(requestedPage=page,force=false){const id=++latestRequest.current;setLoading(true);try{const params=new URLSearchParams({search:debouncedSearch,status:filter,page:String(requestedPage)});const data=await request(`/api/reservations?${params}`,force?{refresh:true}:{});if(id===latestRequest.current){setRecords(data.reservations);setCount(data.count);setPages(data.pages);setError('');setHasLoaded(true);}}catch(err){if(id===latestRequest.current)setError(err.message)}finally{if(id===latestRequest.current)setLoading(false)}}
 useEffect(()=>{load()},[filter,debouncedSearch,page]);
  // Fetch fresh data when returning to this screen, but never unmount its list.
  const lastActive = useRef(active);
  useEffect(() => {
    if (active && !lastActive.current) load(page,true);
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
 useEffect(()=>{if(!intent?.nonce)return;if(intent.filter)setFilter(intent.filter);if(intent.search!==undefined){setSearch(intent.search);setPage(1)}if(intent.create)create()},[intent?.nonce]);
 useEffect(()=>{if(!open)return;const before=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';first.current?.focus();function keys(e){if(e.key==='Escape'&&!busy){e.preventDefault();setOpen(false)}if(e.key==='Tab'){const fields=[...modal.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];if(!fields.length)return;if(e.shiftKey&&document.activeElement===fields[0]){e.preventDefault();fields.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===fields.at(-1)){e.preventDefault();fields[0].focus()}}}document.addEventListener('keydown',keys);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keys);before?.focus?.()}},[open,busy]);
 function create(){creationKey.current=crypto.randomUUID();setEditing(null);setForm({...blank});setNotice('');setError('');setOpen(true)}
 function edit(r){setEditing(r.id);setForm({customerName:r.customerName,contact:r.contact,description:r.description,quantity:r.quantity,pickupAt:localInput(r.pickupAt),notes:r.notes});setNotice('');setError('');setOpen(true)}
 async function save(e){e.preventDefault();if(busy)return;const createNext=!editing&&e.nativeEvent.submitter?.value==='create-next';setBusy(true);setError('');try{const payload={...form,quantity:Number(form.quantity),pickupAt:new Date(form.pickupAt).toISOString()};await request(editing?`/api/reservations/${editing}`:'/api/reservations',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json',...(!editing?{'Idempotency-Key':creationKey.current}:{})},body:JSON.stringify(payload)});if(createNext){creationKey.current=crypto.randomUUID();setForm({...blank});setNotice('Reservation created. Enter the next reservation.');first.current?.focus()}else{setOpen(false);setNotice(editing?'Reservation updated.':'Reservation created.')}setPage(1);await load(1)}catch(err){setError(err.message)}finally{setBusy(false)}}
 async function status(r,value){if(busy)return;if(['Collected','Cancelled'].includes(value)&&!window.confirm(`${value==='Cancelled'?'Cancel':'Mark collected'} reservation for ${r.customerName}?`))return;setBusy(true);setError('');try{await request(`/api/reservations/${r.id}/status`,{method:'PATCH',body:JSON.stringify({status:value})});setNotice('Reservation status updated.');await load()}catch(err){setError(err.message)}finally{setBusy(false)}}
 return <div className="orders-module">
 <div className="orders-toolbar"><div><strong>{count} matching reservations</strong></div><div className="toolbar-actions"><RefreshButton loading={loading} onClick={()=>load(page,true)}/><button type="button" className="order-action" onClick={create}><Plus size={18}/> New reservation</button></div></div>
 <div className="workflow-controls"><SearchField value={search} onChange={value=>{setSearch(value);setPage(1)}} placeholder="Search customer…"/><FilterPills options={statuses} value={filter} onChange={value=>{setFilter(value);setPage(1)}}/></div>
 {error&&!open&&<div className="error" role="alert">{error}</div>}{notice&&<div className="success-note" role="status">{notice}</div>}
 {open&&<div className="order-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}><section ref={modal} className="order-editor order-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-title"><div className="order-section-head"><h3 id="reservation-title">{editing?'Edit reservation':'New reservation'}</h3><button type="button" className="status-button" disabled={busy} onClick={()=>setOpen(false)}>✕ Close</button></div>{error&&<div role="alert" className="error">{error}</div>}{notice&&<div role="status" className="success-note">{notice}</div>}
 <form className="order-form" onSubmit={save}><label>Customer name<input ref={first} required maxLength={120} value={form.customerName} onChange={e=>setForm({...form,customerName:e.target.value})}/></label><label>Contact (optional)<input maxLength={100} value={form.contact} onChange={e=>setForm({...form,contact:e.target.value})}/></label>
 <label>Reserved product / description<input required maxLength={300} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Quantity<input required type="number" min="1" max="10000" step="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
 <label className="order-wide">Pickup date and time<input type="datetime-local" required min={localInput(Date.now())} value={form.pickupAt} onChange={e=>setForm({...form,pickupAt:e.target.value})}/></label><label className="order-wide">Notes<textarea rows="3" maxLength={1000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
 <div className="order-modal-actions"><button type="button" className="status-button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button>{!editing&&<button type="submit" value="create-next" className="status-button" disabled={busy}>Save & new</button>}<button className="order-action" value="save" disabled={busy} type="submit">{busy?'Saving…':editing?'Save changes':'Create reservation'}</button></div></form></section></div>}
 <div className="operations-list" aria-busy={loading}>
  <OperationsHeader third="Pickup"/>
  {loading&&!hasLoaded?<div className="empty-state">Loading reservations…</div>:records.length===0?<div className="empty-state"><strong>No reservations found</strong><p>Try a different filter or create a reservation.</p></div>:records.map(r=><OperationsRow key={r.id}
    customer={r.customerName} subline={r.contact||'No contact provided'}
    details={`${r.quantity} × ${r.description}`} note={r.notes ? `Note: ${r.notes}` : ''}
    when={<strong>{stamp(r.pickupAt)}</strong>} status={<StatusPill status={r.status}/>}
    actions={<>
      {r.cake ? <button type="button" className="status-button" onClick={()=>navigate?.('Cake Production',{search:r.customerName})}>Cake: {r.cake.status}</button> : r.status==='Confirmed' ? <button type="button" className="next-action" onClick={()=>navigate?.('Cake Production',{create:true,source:{type:'reservation',id:r.id,customerName:r.customerName,contact:r.contact,description:r.description,quantity:r.quantity,dueAt:r.pickupAt}})}>Send to cake</button> : null}
      {(next[r.status]||[]).filter(status=>status!=='Cancelled').map(nextStatus=><button type="button" key={nextStatus} className="next-action" disabled={busy} onClick={()=>status(r,nextStatus)}>{nextStatus==='Collected'?'Mark collected':'Confirm'} <ArrowRight size={14}/></button>)}
      {!['Collected','Cancelled'].includes(r.status)&&<button type="button" className="status-button" disabled={busy} onClick={()=>edit(r)}>Edit</button>}
      {(next[r.status]||[]).includes('Cancelled')&&<button type="button" className="cancel-action" disabled={busy} onClick={()=>status(r,'Cancelled')}>Cancel</button>}
    </>}/>) }
 </div>
 <div className="orders-pagination"><button className="status-button" disabled={page<=1} onClick={()=>setPage(x=>x-1)}>Previous</button><span>Page {page} of {pages}</span><button className="status-button" disabled={page>=pages} onClick={()=>setPage(x=>x+1)}>Next</button></div></div>;
}
