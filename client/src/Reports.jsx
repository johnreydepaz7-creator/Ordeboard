import React,{useEffect,useState,useRef} from 'react';
import {BarChart3,Download,RefreshCcw} from 'lucide-react';
import SalesTrends from './SalesTrends.jsx';
// Browsers send date-only strings. The server applies Philippine reporting time.
const today=()=>{const d=new Date(Date.now()+8*3600000);return d.toISOString().slice(0,10);};
const firstDay=()=>today().slice(0,7)+'-01';
const peso=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n||0);
function exportCsv(data){
 const rows=[['OrderBoard reporting period',data.from,data.to],[],['Metric','Value'],...Object.entries(data.summary).map(([k,v])=>[k,v]),[],['Date','Sales (PHP)','Expenses (PHP)','Orders'],...data.trend.map(d=>[d.date,d.sales,d.expenses,d.orders]),[],['Sales source','Amount (PHP)'],...data.salesBySource.map(x=>[x.name,x.amount]),[],['Expense category','Amount (PHP)'],...data.expensesByCategory.map(x=>[x.name,x.amount]),[],['Product','Units'],...data.topProducts.map(x=>[x.name,x.quantity])];
 const csv='\ufeff'+rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`orderboard-report-${data.from}-to-${data.to}.csv`;a.click();URL.revokeObjectURL(url);
}
function Ranking({title,items,property,format}){
 const max=Math.max(1,...items.map(i=>i[property]));
 return <section className="report-panel"><h3>{title}</h3>{!items.length?<p>No records for this date range.</p>:items.map(item=><div className="report-ranking" key={item.name}><div><strong>{item.name}</strong><span>{format(item[property])}</span></div><div className="report-bar-track"><div className="report-bar" style={{width:`${item[property]/max*100}%`}}/></div></div>)}</section>;
}
export default function Reports({request,active=true}){
 const [from,setFrom]=useState(firstDay),[to,setTo]=useState(today),[report,setReport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function load(force=false){if(from>to){setError('Start date must not be after end date.');return;}setLoading(true);setError('');try{setReport(await request(`/api/reports/overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,force?{refresh:true}:{}));}catch(e){setError(e.message);setReport(null);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) load(true);
    wasActive.current = active;
  }, [active]);
 return <div className="reports-layout"><section className="report-panel"><div className="report-toolbar"><div><h3><BarChart3 size={19}/> Reports & Analytics</h3><p>Review business performance from recorded orders and expenses.</p></div><div className="report-filters"><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button type="button" className="primary" disabled={loading} onClick={()=>load(true)}><RefreshCcw size={16}/> {loading?'Loading…':'Generate report'}</button><button type="button" className="status-button" disabled={!report||loading} onClick={()=>exportCsv(report)}><Download size={16}/> Export CSV</button></div></div>{error&&<div role="alert" className="error">{error}</div>}</section>
 {report&&<><div className="report-kpis">{[['Completed paid sales',peso(report.summary.sales)],['Recorded expenses',peso(report.summary.expenses)],['Sales minus expenses',peso(report.summary.balance)],['Paid orders',report.summary.orderCount],['Average paid order',peso(report.summary.averageOrderValue)]].map(([label,value])=><article className="report-kpi" key={label}><small>{label}</small><strong>{value}</strong></article>)}</div>
 <SalesTrends key={report.from + report.to} report={report}/>
 <div className="report-columns"><Ranking title="Sales by channel" items={report.salesBySource} property="amount" format={peso}/><Ranking title="Expenses by category" items={report.expensesByCategory} property="amount" format={peso}/><Ranking title="Top products by units sold" items={report.topProducts} property="quantity" format={n=>`${n} units`}/></div><section className="report-panel"><h3>How to interpret this report</h3>{report.notes.map(note=><p key={note}>• {note}</p>)}</section></>}
 </div>;
}
