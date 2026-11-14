// הפניות ה-API של גלאי האזורים מהדפדפן. כל קריאה מחזירה {ok, status, data} — לא זורקת על 4xx.

const BASE = '/api/training-proof/frames';

async function call(url, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok && data?.success !== false, status: res.status, data: data || {} };
  } catch {
    return { ok: false, status: 0, data: { error: 'אין חיבור לשרת' } };
  }
}

const enc = encodeURIComponent;

export const framesApi = {
  books: () => call(`${BASE}/books`),
  book: (book) => call(`${BASE}/books/${enc(book)}`),
  claim: (book) => call(`${BASE}/books/${enc(book)}/claim`, { method: 'POST', body: {} }),
  release: (book) => call(`${BASE}/books/${enc(book)}/release`, { method: 'POST', body: {} }),
  addStream: (book, name, role) => call(`${BASE}/books/${enc(book)}/streams`, { method: 'POST', body: { name, role } }),
  setStreamKind: (book, id, role) => call(`${BASE}/books/${enc(book)}/streams/${enc(id)}`, { method: 'PATCH', body: { role } }),
  savePage: (id, status, frames) => call(`${BASE}/pages/${enc(id)}`, { method: 'PUT', body: { status, frames } }),
};

// "עד יום חמישי 15:40" — מועד בעברית, קצר
export function formatUntil(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}
