// OrderBoard React frontend. React components are functions returning JSX (page layout).
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, ClipboardList, Cake, CalendarDays, Package, Wallet,
  BarChart3, Settings, LogOut, Menu, ShieldCheck, Eye, EyeOff,
  AlertCircle, Users, UserPlus, History, KeyRound, Laptop, ChevronRight, X, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import './styles.css';
import { request, prepareWorkspace, clearWorkspaceCache } from './workspaceData.js';
import { accountChangeKey, browserSignedOut, changeBrowserAccount, forgetOfflineSession, readOfflineSession, rememberOfflineSession } from './offlineOrders.js';
import Orders from './Orders.jsx';
import Reservations from './Reservations.jsx';
import CakeProduction from './CakeProduction.jsx';
import Schedule from './Schedule.jsx';
import Inventory from './Inventory.jsx';
import Finance from './Finance.jsx';
import Reports from './Reports.jsx';
import Forecast from './Forecast.jsx';
import Dashboard from './Dashboard.jsx';
// Use one startup request even in React's development StrictMode.
let startupTask = null;
function restoreUserSession() {
  if (!startupTask) {
    startupTask = request('/api/auth/me', { signal: AbortSignal.timeout(8000) });
  }
  return startupTask;
}
// These sections will be implemented in later development phases.
const navigation=[['Dashboard',LayoutDashboard],['Orders & Reservations',ClipboardList],['Cake Production',Cake],['Schedules',CalendarDays],['Inventory',Package],['Sales & Expenses',Wallet],['Reports & Analytics',BarChart3],['Demand Forecast',BarChart3]];
function OrdersAndReservations({ request, intent, active, navigate, accountId, offline }) {
  const [tab, setTab] = useState(intent?.tab || 'orders');
  const [activeIntent, setActiveIntent] = useState(intent);
  useEffect(() => {
    if (intent?.nonce) {
      setTab(intent.tab || 'orders');
      setActiveIntent(intent);
    }
  }, [intent?.nonce]);
  useEffect(() => { if (offline) setTab('orders'); }, [offline]);
  function changeTab(nextTab) { setTab(nextTab); setActiveIntent(null); }
  return <div>
    {!offline && <div className="ob-tabs" role="tablist" aria-label="Orders and reservations">
      <button type="button" role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'selected' : ''} onClick={() => changeTab('orders')}>Orders</button>
      <button type="button" role="tab" aria-selected={tab === 'reservations'} className={tab === 'reservations' ? 'selected' : ''} onClick={() => changeTab('reservations')}>Reservations</button>
    </div>}
    {/* Keep both lists in memory. The inactive tab does not make a new fetch. */}
    <div hidden={!offline && tab !== 'orders'} className="workspace-pane"><Orders request={request} navigate={navigate} intent={tab === 'orders' ? activeIntent : null} active={active && (offline || tab === 'orders')} accountId={accountId} offline={offline}/></div>
    {!offline && <div hidden={tab !== 'reservations'} className="workspace-pane"><Reservations request={request} navigate={navigate} intent={tab === 'reservations' ? activeIntent : null} active={active && tab === 'reservations'}/></div>}
  </div>;
}
function StaffHistoryDialog({ person, onClose }) {
  const dialogRef = useRef(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();

    const controller = new AbortController();
    request(`/api/security/staff/${person.id}/history`, { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setHistory(result.history);
      })
      .catch(error => {
        if (!controller.signal.aborted) setError(error.message);
      });

    return () => controller.abort();
  }, [person.id]);

  return <dialog
    ref={dialogRef}
    className="staff-panel staff-history-dialog"
    aria-labelledby="staff-history-title"
    onClose={onClose}
    onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}
  >
    <header className="staff-history-header">
      <h3 id="staff-history-title">Login history — {person.name}</h3>
      <form method="dialog">
        <button type="submit" className="status-button">Close</button>
      </form>
    </header>
    <div className="staff-history-body">
      {error ? <p role="alert" className="error">{error}</p>
        : history === null ? <p role="status">Loading login history…</p>
        : history.length === 0 ? <p>No login history yet.</p>
        : <div className="staff-list">
          {history.map(event => <div className="staff-record" key={event.id}>
            <div className="staff-person">
              <strong>{event.outcome === 'success' ? 'Successful login' : 'Failed login'}</strong>
              <span>{event.device} · {event.browser}</span>
              <small>{new Date(event.createdAt).toLocaleString()} · IP: {event.ipAddress}</small>
            </div>
          </div>)}
        </div>}
    </div>
  </dialog>;
}

// Owner-only screen: create, list and activate/deactivate staff accounts.
function StaffManager({active}){
 const [staff,setStaff]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false),[name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[selectedHistory,setSelectedHistory]=useState(null);
 async function revokeStaffSessions(person){if(!window.confirm(`Sign out all devices for ${person.name}?`))return;setError('');try{await request(`/api/security/staff/${person.id}/revoke`,{method:'POST'});setNotice('Staff sessions revoked.');}catch(e){setError(e.message);}}
 async function load(force=false){setLoading(true);try{const r=await request('/api/staff',force?{refresh:true}:{});setStaff(r.staff);setError('');}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{load();},[]);
 const staffWasActive = React.useRef(active);
 useEffect(()=>{if(active && !staffWasActive.current) load(true);if(!active) setSelectedHistory(null);staffWasActive.current=active;},[active]);
 async function create(e){e.preventDefault();setSaving(true);setError('');setNotice('');try{await request('/api/staff',{method:'POST',body:JSON.stringify({name,email,password})});setName('');setEmail('');setPassword('');setNotice('Staff account created successfully.');await load();}catch(e){setError(e.message);}finally{setSaving(false);}}
 async function toggle(person){if(!window.confirm(`${person.active?'Deactivate':'Reactivate'} ${person.name}?`))return;setSaving(true);setError('');setNotice('');try{await request(`/api/staff/${person.id}/status`,{method:'PATCH',body:JSON.stringify({active:!person.active})});setNotice('Staff status updated.');await load();}catch(e){setError(e.message);}finally{setSaving(false);}}
 return <div className="staff-layout"><section className="staff-panel"><h3><UserPlus size={19}/> Create staff account</h3><p>Only the Owner can create accounts. Staff passwords are never shown or stored as plain text.</p><form onSubmit={create} className="staff-form"><label>Full name<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Staff full name"/></label><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="staff@example.com"/></label><label>Temporary password (at least 12 characters)<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Choose a unique password"/></label><button className="primary" disabled={saving} type="submit">{saving?'Saving…':'Create staff account'}</button></form></section><section className="staff-panel"><h3><Users size={19}/> Staff accounts</h3><p>Deactivated accounts cannot sign in or continue using protected APIs.</p>{error&&<div role="alert" className="error">{error}</div>}{notice&&<div role="status" className="success-note">{notice}</div>}{loading?<p>Loading staff accounts…</p>:staff.length===0?<p>No staff accounts yet.</p>:<div className="staff-list">{staff.map(person=><div key={person.id} className="staff-record"><div className="staff-person"><strong>{person.name}</strong><span>{person.email}</span><small>{person.active?'Active':'Deactivated'}</small></div><button type="button" className="status-button" aria-haspopup="dialog" onClick={()=>setSelectedHistory(person)}>History</button><button type="button" className="status-button" onClick={()=>revokeStaffSessions(person)}>Sign out devices</button><button type="button" className="status-button" disabled={saving} onClick={()=>toggle(person)}>{person.active?'Deactivate':'Reactivate'}</button></div>)}</div>}</section>
 {active && selectedHistory && <StaffHistoryDialog key={selectedHistory.id} person={selectedHistory} onClose={()=>setSelectedHistory(null)}/>}
 </div>;
}

// Security Center is available to both Owner and Staff.
// It reads active browser sessions and the last 50 login events from MongoDB.
function SecurityCenter({ onSignedOut, active }) {
  const [history, setHistory] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  async function reload(force = false) {
    try {
      const [historyData, sessionData] = await Promise.all([
        request('/api/security/history', force ? { refresh: true } : {}),
        request('/api/security/sessions', force ? { refresh: true } : {}),
      ]);
      setHistory(historyData.history);
      setSessions(sessionData.sessions);
      setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { reload(); }, []);
  const securityWasActive = React.useRef(active);
  useEffect(() => {
    if (active && !securityWasActive.current) reload(true);
    securityWasActive.current = active;
  }, [active]);

  async function updatePassword(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/api/auth/change-password', {
        method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword(''); setNewPassword('');
      // Password changes terminate ALL sessions, even this one.
      window.alert('Password changed. Sign in again with the new password.');
      onSignedOut();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function requestNewEmail(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/auth/email-change/request', {
        method: 'POST', body: JSON.stringify({ newEmail, currentPassword: emailPassword }),
      });
      setEmailPassword(''); setNewEmail('');
      setNotice(result.message);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function revokeOthers() {
    if (!window.confirm('Sign out every OTHER device?')) return;
    setBusy(true);
    try {
      const result = await request('/api/security/sessions/revoke-others', { method: 'POST' });
      setNotice(result.message); await reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function revokeSession(session) {
    if (!window.confirm(`Sign out ${session.device} / ${session.browser}?`)) return;
    setBusy(true);
    try {
      const result = await request(`/api/security/sessions/${session.id}/revoke`, { method: 'POST' });
      if (result.currentSessionRevoked) return onSignedOut();
      setNotice(result.message); await reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function dateText(value) { return new Date(value).toLocaleString(); }
  return <div className="security-layout">
    <section className="staff-panel">
      <h3><KeyRound size={19}/> Change password</h3>
      <p>Changing your password signs out all devices, including this browser.</p>
      <form className="staff-form" onSubmit={updatePassword}>
        <label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}/></label>
        <label>New password (12 characters or more)<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={e => setNewPassword(e.target.value)}/></label>
        <button type="submit" className="primary" disabled={busy}>Change password</button>
      </form>
      {error && <div role="alert" className="error">{error}</div>}
      {notice && <div role="status" className="success-note">{notice}</div>}
    </section>
    <section className="staff-panel">
      <h3><KeyRound size={19}/> Change sign-in email</h3>
      <p>If your old email inbox is unavailable, you can still change it while signed in. Confirm the NEW email within 15 minutes. Your sign-in email changes only after verification; all sessions will then end.</p>
      <form className="staff-form" onSubmit={requestNewEmail}>
        <label>New accessible email<input type="email" autoComplete="email" maxLength={254} required value={newEmail} onChange={e => setNewEmail(e.target.value)}/></label>
        <label>Current account password<input type="password" autoComplete="current-password" required value={emailPassword} onChange={e => setEmailPassword(e.target.value)}/></label>
        <button type="submit" className="primary" disabled={busy}>Send verification to new email</button>
      </form>
      <p>If you are fully locked out, the Owner must use the local offline recovery key. Staff should contact the Owner.</p>
    </section>
    <section className="staff-panel">
      <h3><Laptop size={19}/> Active sessions</h3>
      <p>Browser and device labels are estimates, not guaranteed device identities.</p>
      <button className="status-button" disabled={busy} onClick={revokeOthers}>Sign out other devices</button>
      <div className="staff-list">{sessions.length ? sessions.map(session =>
        <div key={session.id} className="staff-record">
          <div className="staff-person"><strong>{session.device} · {session.browser} {session.current ? '(Current)' : ''}</strong>
            <span>Signed in: {dateText(session.createdAt)}</span><small>IP: {session.ipAddress}</small></div>
          <button type="button" className="status-button" disabled={busy} onClick={() => revokeSession(session)}>Sign out</button>
        </div>) : <p>No active sessions found.</p>}</div>
    </section>
    <section className="staff-panel">
      <h3><History size={19}/> Recent login history</h3>
      <p>The 50 most recent sign-in attempts associated with your account. History is retained for 90 days.</p>
      <div className="staff-list">{history.length ? history.map(event =>
        <div className="staff-record" key={event.id}>
          <div className="staff-person"><strong>{event.outcome === 'success' ? 'Successful login' : 'Failed login'}</strong>
            <span>{event.device} · {event.browser} · {dateText(event.createdAt)}</span>
            <small>IP: {event.ipAddress}</small></div>
        </div>) : <p>No login history yet.</p>}</div>
    </section>
  </div>;
}

// Main app: login screen when signed out, dashboard when signed in.
function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Email links use a URL fragment, so the secret never reaches the web server.
  const [resetToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('reset') || '');
  const [emailToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('verify-email') || '');
  const [authMode, setAuthMode] = useState(() => window.location.hash.startsWith('#reset=') ? 'reset' : window.location.hash.startsWith('#verify-email=') ? 'verifyEmail' : 'login');
  const [initialSetupRequired, setInitialSetupRequired] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState('Dashboard');
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineSession, setOfflineSession] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const offline = !online || offlineSession;
  // Save only a display preference. No account or customer data goes to local storage.
  const [compactNav, setCompactNav] = useState(() => {
    try { return window.localStorage.getItem('ob-compact-nav') === '1'; }
    catch { return false; } // Private browsing may block storage.
  });
  function toggleNavigation() {
    setCompactNav(current => {
      try { window.localStorage.setItem('ob-compact-nav', current ? '0' : '1'); }
      catch { /* Keep the control working even without browser storage. */ }
      return !current;
    });
  }
  const [intent, setIntent] = useState(null);

  function applySession(result) {
    rememberOfflineSession(result);
    setSessionExpiry(result.expiresAt);
    setUser(result.user);
  }

  function endLocalSession(message = '') {
    forgetOfflineSession();
    clearWorkspaceCache();
    setUser(null);
    setSessionExpiry(null);
    setOfflineSession(false);
    setPage('Dashboard');
    setIntent(null);
    setError(message);
  }

  // A new intent opens a specific workflow even if that page is already visible.
  function navigate(nextPage, options = {}) {
    setIntent({ ...options, nonce: crypto.randomUUID() });
    setPage(nextPage);
    setMenu(false);
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    let mounted = true;
    async function restoreSession() {
      try {
        if (browserSignedOut()) return;
        if (!navigator.onLine) throw { unavailable: true };
        const result = await restoreUserSession();
        if (mounted && !browserSignedOut()) {
          clearWorkspaceCache();
          prepareWorkspace(result.user);
          applySession(result);
        }
      } catch (err) {
        if (!mounted) return;
        const saved = err.unavailable && readOfflineSession();
        if (saved) {
          setUser(saved.user);
          setSessionExpiry(saved.expiresAt);
          setPage('Orders & Reservations');
          setOfflineSession(true);
        } else {
          forgetOfflineSession();
          if (err.unavailable) setError('Connect to OrderBoard to sign in and open your drafts.');
        }
      }
      finally { if (mounted) setChecking(false); }
    }
    // People arriving from a reset email must see the reset form immediately.
    if (window.location.hash.startsWith('#reset=') || window.location.hash.startsWith('#verify-email=')) setChecking(false);
    else restoreSession();
    // This endpoint exposes only whether there are zero accounts, not account identities.
    request('/api/setup/status').then(result => {
      if (mounted) setInitialSetupRequired(Boolean(result.initialSetupRequired));
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Server-side session invalidation also clears every retained page's data.
  useEffect(() => {
    function sessionExpired(event) {
      endLocalSession(event.detail?.message || 'Session ended. Sign in again.');
    }
    window.addEventListener('orderboard:session-expired', sessionExpired);
    return () => window.removeEventListener('orderboard:session-expired', sessionExpired);
  }, []);

  useEffect(() => {
    function handleOnline() { setOnline(true); }
    function handleOffline() { setOnline(false); setOfflineSession(true); }
    function handleHostUnavailable() { setOfflineSession(true); }
    function handleAccountChange(event) {
      if (event.key === accountChangeKey || event.key === null) endLocalSession('Sign in to open your account’s drafts.');
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('orderboard:host-unavailable', handleHostUnavailable);
    window.addEventListener('storage', handleAccountChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('orderboard:host-unavailable', handleHostUnavailable);
      window.removeEventListener('storage', handleAccountChange);
    };
  }, []);

  useEffect(() => {
    if (!sessionExpiry) return;
    const timer = setTimeout(() => endLocalSession('Session expired. Please sign in again to open your drafts.'), Math.max(0, Date.parse(sessionExpiry) - Date.now()));
    return () => clearTimeout(timer);
  }, [sessionExpiry]);

  useEffect(() => {
    if (!user || !offlineSession || !online) return;
    let active = true;
    let retryTimer;
    async function verifySession() {
      try {
        const result = await request('/api/auth/me', { signal: AbortSignal.timeout(8000) });
        if (!active) return;
        if (result.user.id !== user.id || browserSignedOut()) {
          endLocalSession('Sign in to the account that saved your drafts.');
          return;
        }
        applySession(result);
        setPage('Orders & Reservations');
        setOfflineSession(false);
      } catch (err) {
        if (!active) return;
        if (err.unavailable) retryTimer = setTimeout(verifySession, 15_000);
        else endLocalSession('Session ended. Please sign in again to open your drafts.');
      }
    }
    verifySession();
    return () => { active = false; clearTimeout(retryTimer); };
  }, [user?.id, online, offlineSession, reconnectAttempt]);

  // Keyboard shortcuts are ignored while typing in forms.
  // Alt+1 = dashboard; Alt+2 = orders; Alt+3 = production; Alt+N = new order.
  useEffect(() => {
    if (!user) return;
    function shortcut(event) {
      // Slash focuses the list search; prevent accidental text input interception.
      if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat) {
        if (!event.target.closest('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"]')) {
          const search = [...document.querySelectorAll('.search-field input')].find(element => element.getClientRects().length > 0);
          if (search) { event.preventDefault(); search.focus(); }
        }
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
      if (event.target.closest('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"]')) return;
      const pages = { '1': 'Dashboard', '2': 'Orders & Reservations', '3': 'Cake Production' };
      if (pages[event.key]) { event.preventDefault(); navigate(pages[event.key]); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); navigate('Orders & Reservations', { tab: 'orders', create: true }); }
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); navigate('Orders & Reservations', { tab: 'reservations', create: true }); }
      if (event.key.toLowerCase() === 'b') { event.preventDefault(); toggleNavigation(); }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [user]);

  async function login(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      changeBrowserAccount(true);
      clearWorkspaceCache();
      prepareWorkspace(result.user);
      applySession(result); setOfflineSession(!navigator.onLine); setPassword(''); setPage('Dashboard');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function showForgotPassword() {
    // Do not leave an abandoned reset token in the address bar.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setAuthMode('forgot'); setError(''); setRecoveryNotice(''); setPassword('');
  }
  function showEmailHelp() {
    setAuthMode('emailHelp'); setError(''); setRecoveryNotice('');
  }
  function backToLogin() {
    // Erase used or abandoned tokens from the browser's visible address bar.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setAuthMode('login'); setError(''); setRecoveryNotice('');
    setPassword(''); setNewPassword(''); setRepeatPassword('');
  }
  async function sendResetLink(event) {
    event.preventDefault();
    setBusy(true); setError(''); setRecoveryNotice('');
    try {
      const result = await request('/api/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email: email.trim() }),
      });
      setRecoveryNotice(result.message);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function confirmNewEmail(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await request('/api/auth/email-change/confirm', {
        method: 'POST', body: JSON.stringify({ token: emailToken }),
      });
      clearWorkspaceCache(); setUser(null); setPassword('');
      setRecoveryNotice(result.message);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setAuthMode('emailDone');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function resetForgottenPassword(event) {
    event.preventDefault();
    setError(''); setRecoveryNotice('');
    if (newPassword !== repeatPassword) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await request('/api/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setNewPassword(''); setRepeatPassword(''); setPassword('');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setRecoveryNotice(result.message);
      setAuthMode('resetDone');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function logout() {
    changeBrowserAccount(false);
    endLocalSession();
    try { await request('/api/auth/logout', { method: 'POST' }); }
    catch { /* The workspace stays locked locally even when the server is unavailable. */ }
  }

  if (checking) return <div className="center"><div className="loading-brand"><div className="symbol">OB</div><p>Opening OrderBoard…</p></div></div>;
  if (!user || authMode !== 'login') return <main className="login-layout">
    <section className="brand-panel"><div className="eyebrow">BAKES & BITES / ORDERBOARD</div><h1>A smoother shift starts here.</h1><p>Take an order, monitor production, and keep every pickup on track—from one organized workspace.</p><div className="brand-illustration"><span>01 / TAKE ORDERS</span><span>02 / PREPARE</span><span>03 / HAND OFF</span></div><div className="decor">BUILT FOR BUSY BAKERY DAYS</div></section>
    <section className="login-area">
      {authMode === 'login' && <form className="login-card" onSubmit={login}>
        <div className="symbol">OB</div>
        <h2>Sign in to OrderBoard</h2>
        {initialSetupRequired && <div role="status" className="error">The database has no accounts. An authorized installer must restore a backup or create the initial Owner locally. No online Owner registration is available.</div>}
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/>
        <label htmlFor="password">Password</label>
        <div className="password"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>
        <div className="auth-options"><button type="button" className="auth-text-button" onClick={showForgotPassword}>Forgot password?</button><button type="button" className="auth-text-button" onClick={showEmailHelp}>Lost access to email?</button></div>
        {error && <div role="alert" className="error"><AlertCircle size={16}/>{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Preparing workspace…' : 'Sign in'} <ChevronRight size={18}/></button>
      </form>}
      {authMode === 'forgot' && <form className="login-card" onSubmit={sendResetLink}>
        <div className="symbol"><KeyRound size={20}/></div>
        <h2>Forgot your password?</h2>
        <p className="auth-description">Enter the email registered to your OrderBoard account. We will send a password reset link if your account is active.</p>
        <label htmlFor="recovery-email">Registered email address</label>
        <input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/>
        {error && <div role="alert" className="error"><AlertCircle size={16}/>{error}</div>}
        {recoveryNotice && <div role="status" className="success-note">{recoveryNotice}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Sending request…' : 'Email reset link'}</button>
        <button className="auth-text-button auth-back" type="button" onClick={showEmailHelp}>Can’t access that email?</button>
        <button className="auth-text-button auth-back" type="button" onClick={backToLogin}>Back to sign in</button>
      </form>}
      {authMode === 'reset' && <form className="login-card" onSubmit={resetForgottenPassword}>
        <div className="symbol"><KeyRound size={20}/></div>
        <h2>Create a new password</h2>
        <p className="auth-description">Your reset link expires 15 minutes after it was requested.</p>
        <label htmlFor="new-recovery-password">New password (at least 12 characters)</label>
        <input id="new-recovery-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={e => setNewPassword(e.target.value)}/>
        <label htmlFor="repeat-recovery-password">Confirm new password</label>
        <input id="repeat-recovery-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)}/>
        {error && <div role="alert" className="error"><AlertCircle size={16}/>{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving new password…' : 'Reset password'}</button>
        <button className="auth-text-button auth-back" type="button" onClick={showForgotPassword}>Request a new link</button>
        <button className="auth-text-button auth-back" type="button" onClick={backToLogin}>Back to sign in</button>
      </form>}
      {authMode === 'emailHelp' && <div className="login-card">
        <div className="symbol"><ShieldCheck size={20}/></div>
        <h2>Lost access to your email?</h2>
        <p className="auth-description">If you're already signed in, open Account Security and request an email change. Confirm the link sent to your NEW inbox.</p>
        <p className="auth-description">Staff who cannot sign in should contact the bakery Owner. If the Owner cannot sign in, the authorized installer can use the OFFLINE Owner recovery key from the server terminal. The website cannot reveal account emails or bypass verification.</p>
        <button className="primary" type="button" onClick={backToLogin}>Back to sign in</button>
      </div>}
      {authMode === 'verifyEmail' && <form className="login-card" onSubmit={confirmNewEmail}>
        <div className="symbol"><ShieldCheck size={20}/></div>
        <h2>Confirm new sign-in email</h2>
        <p className="auth-description">This verification link works once and expires 15 minutes after the request. Confirming it will sign out existing sessions.</p>
        {error && <div role="alert" className="error"><AlertCircle size={16}/>{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Confirming…' : 'Confirm new email'}</button>
        <button className="auth-text-button auth-back" type="button" onClick={backToLogin}>Back to sign in</button>
      </form>}
      {authMode === 'emailDone' && <div className="login-card">
        <div className="symbol"><ShieldCheck size={20}/></div>
        <h2>Email updated</h2>
        <div role="status" className="success-note">{recoveryNotice}</div>
        <button className="primary" type="button" onClick={backToLogin}>Sign in with new email</button>
      </div>}
      {authMode === 'resetDone' && <div className="login-card">
        <div className="symbol"><ShieldCheck size={20}/></div>
        <h2>Password updated</h2>
        <div role="status" className="success-note">{recoveryNotice}</div>
        <p className="auth-description">All old login sessions have been signed out for your security.</p>
        <button className="primary" type="button" onClick={backToLogin}>Return to sign in <ChevronRight size={18}/></button>
      </div>}
    </section>
  </main>;

  const displayedPage = offline ? 'Orders & Reservations' : page;
  const permitted = (offline ? [navigation[1]] : [...navigation, ...(user.role === 'owner' ? [['Staff Accounts', Users]] : []), ['Account Security', ShieldCheck]])
    .filter(([label]) => user.role === 'owner' || !['Sales & Expenses', 'Reports & Analytics', 'Demand Forecast'].includes(label));
  const descriptions = {
    Dashboard: 'Today’s priorities at a glance.',
    'Orders & Reservations': 'Handle incoming orders and customer pickups.',
    'Cake Production': 'Track every custom cake from start to finish.',
    Schedules: 'Stay on top of upcoming pickup and production deadlines.',
    Inventory: 'Adjust stock quickly and prevent shortages.',
    'Sales & Expenses': 'Keep your business finances organized.',
    'Reports & Analytics': 'See how your bakery is performing.',
    'Demand Forecast': 'Estimate demand from your recorded sales history.',
    'Staff Accounts': 'Manage staff access to OrderBoard.',
    'Account Security': 'Review sessions, sign-in history, and passwords.',
  };
  return <div className={"app" + (compactNav ? " compact-nav" : "")}>
    <aside className={'sidebar ' + (menu ? 'open' : '')}>
      <div className="sidebar-brand"><div className="symbol">OB</div><div><strong>OrderBoard</strong></div><button type="button" className="sidebar-close" aria-label="Close menu" onClick={() => setMenu(false)}><X size={20}/></button></div>
      <nav aria-label="Main navigation">{permitted.map(([label, Icon]) => <React.Fragment key={label}><button type="button" className={displayedPage === label ? 'active' : ''} aria-current={displayedPage === label ? 'page' : undefined} onClick={() => navigate(label)} aria-label={label} title={label}><Icon size={18}/><span>{label}</span>{displayedPage === label && <span className="nav-selected"/>}</button></React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="userpic">{user.name.slice(0,1).toUpperCase()}</div><div className="userlabel"><strong>{user.name}</strong><small>{user.role === 'owner' ? 'Owner / Administrator' : 'Staff member'}</small></div><button type="button" title="Log out" aria-label="Log out" onClick={logout}><LogOut size={19}/></button></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-trail">
          <button type="button" className="hamburger" aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={21}/></button>
          <button type="button" className="collapse-toggle" aria-label={compactNav ? 'Expand navigation' : 'Collapse navigation'} title={compactNav ? 'Expand navigation (Alt+B)' : 'Collapse navigation (Alt+B)'} onClick={toggleNavigation}>{compactNav ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
          <h1>{offline ? 'Order drafts' : page}</h1>
        </div>
      </header>
      <div className="content">
        {offline && <div role="status" className="error" style={{padding:'12px',marginBottom:'12px'}}>
          {online ? 'Waiting for OrderBoard to verify your session.' : 'You are offline.'} You can save order drafts on this browser. Submitting drafts and using the rest of the workspace require a connection.
          {online && <button type="button" className="status-button" onClick={() => setReconnectAttempt(value => value + 1)}>Check connection</button>}
        </div>}
        {/* Pages are loaded once per signed-in session. Switching sections only
            changes visibility; page state and the first results stay in memory. */}
        <section className="workspace-pane" hidden={displayedPage !== 'Orders & Reservations'}><OrdersAndReservations key={user.id} request={request} navigate={navigate} intent={displayedPage === 'Orders & Reservations' ? intent : null} active={displayedPage === 'Orders & Reservations'} accountId={user.id} offline={offline}/></section>
        {!offline && <>
        <section className="workspace-pane" hidden={page !== 'Dashboard'}><Dashboard request={request} navigate={navigate} user={user} active={page === 'Dashboard'}/></section>
        <section className="workspace-pane" hidden={page !== 'Cake Production'}><CakeProduction request={request} navigate={navigate} intent={page === 'Cake Production' ? intent : null} active={page === 'Cake Production'}/></section>
        <section className="workspace-pane" hidden={page !== 'Schedules'}><Schedule request={request} navigate={navigate} active={page === 'Schedules'}/></section>
        <section className="workspace-pane" hidden={page !== 'Inventory'}><Inventory request={request} active={page === 'Inventory'}/></section>
        {user.role === 'owner' && <>
          <section className="workspace-pane" hidden={page !== 'Sales & Expenses'}><Finance request={request} active={page === 'Sales & Expenses'}/></section>
          <section className="workspace-pane" hidden={page !== 'Reports & Analytics'}><Reports request={request} active={page === 'Reports & Analytics'}/></section>
          <section className="workspace-pane" hidden={page !== 'Demand Forecast'}><Forecast request={request} active={page === 'Demand Forecast'}/></section>
          <section className="workspace-pane" hidden={page !== 'Staff Accounts'}><StaffManager active={page === 'Staff Accounts'}/></section>
        </>}
        <section className="workspace-pane" hidden={page !== 'Account Security'}><SecurityCenter active={page === 'Account Security'} onSignedOut={() => { changeBrowserAccount(false); endLocalSession(); }}/></section>
        </>}
      </div>
    </main>
    {menu && <button type="button" className="overlay" aria-label="Close menu" onClick={() => setMenu(false)}/>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/offline-shell.js').catch(error => console.warn('Offline reload is unavailable:', error));
}
