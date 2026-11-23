// Small reusable controls for busy order, reservation and production screens.
import React, { useEffect, useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function StatusPill({ status }) {
  const normalized = String(status || 'Unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return <span className={'status-pill status-' + normalized}>{status}</span>;
}

export function SearchField({ value, onChange, placeholder }) {
  return <label className="search-field"><span className="visually-hidden">Search records</span><Search size={17}/><input aria-label="Search records" placeholder={placeholder || 'Search by customer name…'} maxLength={100} value={value} onChange={e => onChange(e.target.value)}/>{value && <button type="button" aria-label="Clear search" title="Clear search" onClick={() => onChange('')}>×</button>}</label>;
}

export function FilterPills({ options, value, onChange }) {
  return <div className="quick-filters" aria-label="Filter by status">{options.map(item => <button type="button" key={item} className={value === item ? 'selected' : ''} aria-pressed={value === item} onClick={() => onChange(item)}>{item}</button>)}</div>;
}

export function RefreshButton({ loading, onClick }) {
  return <button type="button" className="refresh-button" disabled={loading} onClick={onClick} title="Refresh records"><RefreshCw size={17} className={loading ? 'spinning' : ''}/><span>Refresh</span></button>;
}

// Consistent, compact scan rows for orders, reservations and production.
// Headers align with data at desktop widths and disappear on small screens.
export function OperationsHeader({ third = 'When' }) {
  return <div className="operations-header" aria-hidden="true"><span>Customer</span><span>Details</span><span>{third}</span><span>Status</span><span>Actions</span></div>;
}
export function OperationsRow({ customer, subline, details, note, when, status, actions }) {
  return <article className="operations-row">
    <div className="operation-cell operation-customer"><strong>{customer}</strong>{subline && <small title={subline}>{subline}</small>}</div>
    <div className="operation-cell operation-details"><span title={typeof details === 'string' ? details : undefined}>{details}</span>{note && <small title={note}>{note}</small>}</div>
    <div className="operation-cell operation-when">{when}</div>
    <div className="operation-cell operation-status">{status}</div>
    <div className="operation-cell operation-actions">{actions}</div>
  </article>;
}
