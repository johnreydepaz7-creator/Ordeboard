import React, { useEffect, useState, useRef } from 'react';
import { TrendingUp, RefreshCcw } from 'lucide-react';
const peso = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n ?? 0);
export default function Forecast({ request, active = true }) {
  const [days, setDays] = useState(7);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(selected = days, quiet = false, force = false) {
    setBusy(true); setError(''); if (!quiet) setResult(null);
    try { setResult(await request(`/api/forecast?days=${selected}`, force ? { refresh: true } : {})); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(7); }, []);
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) load(days, true, true);
    wasActive.current = active;
  }, [active]);
  return <div className="reports-layout">
    <section className="report-panel">
      <h3><TrendingUp size={19} /> Demand Forecast</h3>
      <p>Planning estimates based on paid and completed bakery orders. Estimates are not guaranteed.</p>
      <div className="report-filters">
        <label>Forecast period<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>Next 7 days</option><option value={14}>Next 14 days</option></select></label>
        <button className="primary" disabled={busy} onClick={() => load(days, false, true)}><RefreshCcw size={16}/> {busy ? 'Calculating…' : 'Generate forecast'}</button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
    </section>
    {result && <>
      <section className="report-panel"><h3>Historical data used</h3><p>{result.qualifyingOrders} qualifying orders over {result.historicalDays} calendar days; sales occurred on {result.activeSalesDays} days.</p>
      {result.status !== 'ready' && <div className="error" role="status">Not enough historical demand for a responsible forecast. Continue recording completed, fully paid orders.</div>}</section>
      {result.status === 'ready' && <section className="report-panel"><h3>Daily estimates</h3>
        <div style={{overflowX:'auto'}}><table className="forecast-table"><thead><tr><th>Date (Philippines)</th><th>Expected orders</th><th>Estimated sales</th></tr></thead><tbody>{result.forecast.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.expectedOrders}</td><td>{peso(d.estimatedSales)}</td></tr>)}</tbody></table></div>
        <p><strong>Period total (estimate):</strong> {peso(result.forecast.reduce((sum, d) => sum + d.estimatedSales, 0))}</p>
      </section>}
      <section className="report-panel"><h3>Historically popular products</h3>{result.topProducts.length ? result.topProducts.map(p => <p key={p.name}>{p.name}: {p.quantity} units sold</p>) : <p>None recorded for this period.</p>}</section>
      <section className="report-panel"><h3>Forecast limitations</h3>{result.notes.map(n => <p key={n}>• {n}</p>)}</section>
    </>}
  </div>;
}
