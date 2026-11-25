const sessionKey = 'ob:offline-order-session';
export const accountChangeKey = 'ob:account-change';
const draftPrefix = accountId => `ob:order-draft:${accountId}:`;
const validAccount = user => /^[a-f\d]{24}$/i.test(user?.id) && ['owner', 'staff'].includes(user.role);

export function changeBrowserAccount(signedIn) {
  forgetOfflineSession();
  try {
    localStorage.setItem(accountChangeKey, `${signedIn ? 'in' : 'out'}:${crypto.randomUUID()}`);
  } catch { /* Online sign-in and sign-out still work without browser storage. */ }
}

export function browserSignedOut() {
  try { return localStorage.getItem(accountChangeKey)?.startsWith('out:') ?? false; }
  catch { return false; }
}

export function rememberOfflineSession({ user, expiresAt }) {
  if (!validAccount(user) || !Number.isFinite(Date.parse(expiresAt))) return;
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify({
      user: { id: user.id, role: user.role },
      expiresAt,
      accountChange: localStorage.getItem(accountChangeKey),
    }));
  } catch { /* Storage is optional for using the online workspace. */ }
}

export function forgetOfflineSession() {
  try { sessionStorage.removeItem(sessionKey); }
  catch { /* Storage may be unavailable. */ }
}

export function readOfflineSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey));
    if (!saved || !validAccount(saved.user) || !(Date.parse(saved.expiresAt) > Date.now())) return null;
    if (browserSignedOut() || saved.accountChange !== localStorage.getItem(accountChangeKey)) return null;
    return { user: { ...saved.user, name: saved.user.role === 'owner' ? 'Owner' : 'Staff' }, expiresAt: saved.expiresAt };
  } catch { return null; }
}

export function isDraftStorageKey(accountId, key) {
  return key === null || key.startsWith(draftPrefix(accountId));
}

export function readDrafts(accountId) {
  const prefix = draftPrefix(accountId);
  return Object.keys(localStorage).filter(key => key.startsWith(prefix)).flatMap(key => {
    try {
      const form = JSON.parse(localStorage.getItem(key));
      return form ? [{ key: key.slice(prefix.length), form }] : [];
    } catch { return []; }
  });
}

export function saveDraft(accountId, key, form, { existing = false } = {}) {
  const storageKey = draftPrefix(accountId) + key;
  if (existing && localStorage.getItem(storageKey) === null) {
    throw new Error('This draft was already removed. Reopen the drafts list.');
  }
  // Keep only the fields used by the order form. The storage key holds the account and submission IDs.
  const { customerName, contact, source, items, notes, paymentStatus, fulfillmentAt } = form;
  localStorage.setItem(storageKey, JSON.stringify({
    customerName, contact, source, notes, paymentStatus, fulfillmentAt,
    items: items.map(({ name, quantity, unitPrice }) => ({ name, quantity, unitPrice })),
  }));
}

export function removeDraft(accountId, key) {
  localStorage.removeItem(draftPrefix(accountId) + key);
}
