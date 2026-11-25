import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, Pencil, Plus } from 'lucide-react';
import './finance.css';

const categories = ['Ingredients', 'Utilities', 'Rent', 'Salary', 'Transport', 'Equipment', 'Other'];
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const expenseDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const emptyExpense = date => ({ description: '', category: 'Ingredients', amount: '', expenseDate: date });

export default function Finance({ request, active = true }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const [from, setFrom] = useState(today.slice(0, 7) + '-01');
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [draft, setDraft] = useState(() => emptyExpense(today));
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const descriptionInput = useRef(null);
  const wasActive = useRef(active);
  const loadVersion = useRef(0);
  const range = useRef({ from, to });
  const form = editing || draft;

  async function load(force = false) {
    const version = ++loadVersion.current;
    const options = force ? { refresh: true } : {};
    const query = new URLSearchParams(range.current);
    setLoadError('');
    try {
      const [nextSummary, nextExpenses] = await Promise.all([
        request(`/api/finance/summary?${query}`, options),
        request('/api/finance/expenses', options),
      ]);
      if (version !== loadVersion.current) return;
      setSummary(nextSummary);
      setExpenses(nextExpenses.expenses);
    } catch (error) {
      if (version === loadVersion.current) setLoadError(error.message);
    }
  }

  useEffect(() => {
    range.current = { from, to };
    load();
  }, [from, to]);
  useEffect(() => {
    if (active && !wasActive.current) load(true);
    wasActive.current = active;
  }, [active]);

  function changeField(event) {
    const { name, value } = event.target;
    const setForm = editing ? setEditing : setDraft;
    setForm(previous => ({ ...previous, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { description, category, amount, expenseDate } = form;
      const body = JSON.stringify({ description, category, amount: Number(amount), expenseDate });
      if (editing) {
        await request(`/api/finance/expenses/${editing._id}`, { method: 'PATCH', body });
        setEditing(null);
        setNotice('Expense updated.');
      } else {
        await request('/api/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body,
        });
        setDraft(previous => ({ ...previous, description: '', amount: '' }));
        setNotice('Expense saved.');
      }
      await load();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  function editExpense(expense) {
    setEditing({ ...expense });
    setNotice('');
    descriptionInput.current.focus();
  }

  const sources = summary ? Object.entries(summary.sources).sort((a, b) => b[1] - a[1]) : [];
  const hasCurrentSummary = summary?.from === from && summary?.to === to;

  return <div className="finance">
    <section className="staff-panel finance-panel" aria-labelledby="finance-period-title">
      <div className="finance-period">
        <h3 id="finance-period-title"><CalendarDays size={18} aria-hidden="true"/> Business period</h3>
        <div className="finance-date-range">
          <label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label>
          <label>To<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label>
        </div>
      </div>
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {hasCurrentSummary && <>
        <dl className="finance-metrics">
          <div><dt>Completed paid sales</dt><dd>{currency.format(summary.sales)}</dd></div>
          <div><dt>Recorded expenses</dt><dd>{currency.format(summary.expenses)}</dd></div>
          <div className="finance-balance"><dt>Sales minus expenses</dt><dd>{currency.format(summary.balance)}</dd></div>
          <div><dt>Low-stock items</dt><dd>{summary.lowStock}</dd></div>
        </dl>
        <div className="finance-sources">
          <h4>Sales by source</h4>
          {sources.length ? <dl>
            {sources.map(([name, total]) => <div key={name}><dt>{name}</dt><dd>{currency.format(total)}</dd></div>)}
          </dl> : <p>No sales for this period.</p>}
        </div>
        <p className="finance-note">{summary.note}</p>
      </>}
      {!hasCurrentSummary && !loadError && <p role="status">Loading sales summary…</p>}
    </section>

    <section className="staff-panel finance-panel" aria-labelledby="finance-expense-title">
      <h3 id="finance-expense-title">
        {editing ? <Pencil size={17} aria-hidden="true"/> : <Plus size={19} aria-hidden="true"/>}
        {editing ? 'Edit expense' : 'Record an expense'}
      </h3>
      <form className="finance-expense-form" onSubmit={save}>
        <label className="finance-description">
          Description
          <input name="description" ref={descriptionInput} required minLength={2} maxLength={200} value={form.description} onChange={changeField}/>
        </label>
        <label>
          Category
          <select name="category" value={form.category} onChange={changeField}>
            {categories.map(category => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label>
          Amount (₱)
          <input name="amount" type="number" required min="0.01" max="10000000" step="0.01" value={form.amount} onChange={changeField}/>
        </label>
        <label>
          Date
          <input name="expenseDate" type="date" required value={form.expenseDate} onChange={changeField}/>
        </label>
        <div className="finance-form-actions">
          {editing && <button className="status-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>}
          <button className="primary" type="submit" disabled={busy}>{editing ? 'Save changes' : 'Save expense'}</button>
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success-note" role="status">{notice}</p>}
    </section>

    <section className="staff-panel finance-panel" aria-labelledby="finance-ledger-title">
      <h3 id="finance-ledger-title">Recent expenses</h3>
      {expenses?.length ? <table className="finance-ledger" role="table" aria-labelledby="finance-ledger-title">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">Description</th>
            <th role="columnheader" scope="col">Category</th>
            <th role="columnheader" scope="col">Date</th>
            <th role="columnheader" scope="col">Amount</th>
            <th role="columnheader" scope="col"><span className="finance-sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {expenses.map(expense => <tr key={expense._id} role="row" className={editing?._id === expense._id ? 'finance-editing' : undefined}>
            <td role="cell" className="finance-entry-name">{expense.description}</td>
            <td role="cell" className="finance-entry-category"><span>{expense.category}</span></td>
            <td role="cell" className="finance-entry-date"><time dateTime={expense.expenseDate}>{expenseDate.format(new Date(expense.expenseDate))}</time></td>
            <td role="cell" className="finance-entry-amount">{currency.format(expense.amount)}</td>
            <td role="cell" className="finance-entry-action">
              <button type="button" className="status-button" disabled={busy} aria-label={`Edit ${expense.description}`} onClick={() => editExpense(expense)}>
                <Pencil size={14} aria-hidden="true"/> Edit
              </button>
            </td>
          </tr>)}
        </tbody>
      </table> : <p>{expenses ? 'No expenses recorded yet.' : loadError ? 'Recent expenses could not be loaded.' : 'Loading recent expenses…'}</p>}
    </section>
  </div>;
}
