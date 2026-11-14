import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/Toast';
import PurgeDialog from './PurgeDialog';
import ExportDialog from './ExportDialog';
import KeysTable from './KeysTable';
import SearchFeedbackScreen from './SearchFeedbackScreen';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400, status, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body,
});
// מה ש-fetch רגיל היה מקבל אחרי הפניה לדף ההתחברות: 200 עם HTML
const loginPage = () => ({ ok: true, status: 200, type: 'basic', redirected: true, headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new SyntaxError('<'); } });
const asOf = '2026-10-04T00:00:00.000Z';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const pick = async (name, option) => {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  await userEvent.click(await screen.findByRole('option', { name: new RegExp(option.replace(/[()]/g, '\\$&')) }));
};
const countField = () => screen.findByLabelText('לאישור, הקלד את מספר האירועים');

describe('ניקוי משוב — האישור קשור למה שמוצג', () => {
  it('בזמן בדיקה המסננים נעולים; שינוי אחריה מבטל אותה, והמחיקה נשלחת רק לטווח החדש', async () => {
    let resolvePreview;
    const pending = new Promise((resolve) => { resolvePreview = resolve; });
    const requests = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      requests.push({ url, method: options.method, redirect: options.redirect, body: JSON.parse(options.body) });
      if (requests.length === 1) return pending;
      return Promise.resolve(jsonResponse(url.includes('dryRun')
        ? { success: true, count: 3, asOf, previewId: 'new-preview' }
        : { success: true, deleted: 3 }));
    }));
    const onPurged = vi.fn();
    render(<PurgeDialog models={[]} onPurged={onPurged} onClose={vi.fn()} />);
    await pick('סוג', 'הצבעה');
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    expect(screen.getByRole('button', { name: /^סוג/ })).toBeDisabled();
    expect(screen.getByLabelText('מזהה התקנה (לא חובה)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'בודק…' })).toHaveAttribute('aria-disabled', 'true');
    await act(async () => resolvePreview(jsonResponse({ success: true, count: 3, asOf, previewId: 'old-preview' })));
    expect(await countField()).toBeInTheDocument();

    await pick('סוג', 'חיפוש');
    expect(screen.queryByLabelText('לאישור, הקלד את מספר האירועים')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מחק לצמיתות' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    fireEvent.change(await countField(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'מחק לצמיתות' }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests.map((r) => [r.url, r.method, r.redirect])).toEqual([
      ['/api/search-feedback/admin/purge?dryRun=1', 'POST', 'manual'],
      ['/api/search-feedback/admin/purge?dryRun=1', 'POST', 'manual'],
      ['/api/search-feedback/admin/purge', 'POST', 'manual'],
    ]);
    expect(requests[0].body).toEqual({ type: 'vote' });
    expect(requests[1].body).toEqual({ type: 'search', replacePreviewId: 'old-preview' });
    expect(requests[2].body).toEqual({ type: 'search', asOf, previewId: 'new-preview', confirmCount: 3 });
    await waitFor(() => expect(onPurged).toHaveBeenCalledWith(3));
  });

  it('בזמן המחיקה השדות נעולים ו"מחק לצמיתות" נשאר במצב טעינה; כישלון — הודעה, והאישור מתאפס', async () => {
    let resolvePurge;
    vi.stubGlobal('fetch', vi.fn((url) => (url.includes('dryRun')
      ? Promise.resolve(jsonResponse({ success: true, count: 2, asOf, previewId: 'p' }))
      : new Promise((resolve) => { resolvePurge = resolve; }))));
    const onPurged = vi.fn();
    render(<PurgeDialog models={[]} onPurged={onPurged} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    fireEvent.change(await countField(), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'מחק לצמיתות' }));
    const deleting = screen.getByRole('button', { name: 'מוחק…' });
    expect(deleting).toHaveAttribute('aria-disabled', 'true');
    expect(deleting).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /^סוג/ })).toBeDisabled();
    expect(await countField()).toBeDisabled();
    fireEvent.click(deleting);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    await act(async () => resolvePurge(jsonResponse({ error: 'התצוגה המקדימה אינה תואמת לאישור — לא נמחק דבר.' }, 409)));
    expect(await screen.findByRole('alert')).toHaveTextContent('התצוגה המקדימה אינה תואמת לאישור');
    expect(screen.queryByLabelText('לאישור, הקלד את מספר האירועים')).not.toBeInTheDocument();
    expect(onPurged).not.toHaveBeenCalled();
  });

  it('התחברות שפגה בבדיקה — הודעה בעברית עם "התחבר", לא מספר', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(loginPage())));
    render(<PurgeDialog models={[]} onPurged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('פג תוקף ההתחברות');
    expect(within(alert).getByRole('link', { name: 'התחבר' }).getAttribute('href')).toMatch(/^\/auth\/login\?callbackUrl=/);
    expect(screen.queryByLabelText('לאישור, הקלד את מספר האירועים')).not.toBeInTheDocument();
  });

  it('שבת (503) — ההסבר בעברית ולא המילה shabbat', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ error: 'shabbat', message: 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים' }, 503))));
    render(<PurgeDialog models={[]} onPurged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הדף אינו פעיל בשבת');
    expect(screen.queryByText('shabbat')).not.toBeInTheDocument();
  });

  it('מספר שגוי — "מחק לצמיתות" נשאר נעול; בלי window.confirm', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ success: true, count: 5, asOf, previewId: 'p' }))));
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<PurgeDialog models={[]} onPurged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    fireEvent.change(await countField(), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: 'מחק לצמיתות' })).toBeDisabled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('שינוי "כל האירועים" מבטל בדיקה שעוד לא חזרה', async () => {
    let resolvePreview;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolvePreview = resolve; })));
    render(<PurgeDialog models={[]} onPurged={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/כל האירועים — בלי סינון/));
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    fireEvent.click(screen.getByLabelText(/כל האירועים — בלי סינון/));
    await act(async () => resolvePreview(jsonResponse({ success: true, count: 99, asOf, previewId: 'all-preview' })));
    expect(screen.queryByLabelText('לאישור, הקלד את מספר האירועים')).not.toBeInTheDocument();
  });

  it('זהות המודל נשמרת כשסדר שורות המודלים משתנה', async () => {
    const a = { modelFamilyId: 'A', modelQuantization: 'int8' };
    const b = { modelFamilyId: 'B', modelQuantization: 'fp32' };
    const requests = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      requests.push(JSON.parse(options.body));
      return Promise.resolve(jsonResponse(url.includes('dryRun')
        ? { success: true, count: 2, asOf, previewId: 'model-preview' }
        : { success: true, deleted: 2 }));
    }));
    const view = render(<PurgeDialog models={[a, b]} onPurged={vi.fn()} onClose={vi.fn()} />);
    await pick('מודל', 'A (int8)');
    fireEvent.click(screen.getByRole('button', { name: 'בדוק כמה יימחקו' }));
    await countField();
    view.rerender(<PurgeDialog models={[b, a]} onPurged={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^מודל/ })).toHaveTextContent('A (int8)');
    fireEvent.change(await countField(), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'מחק לצמיתות' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ modelFamilyId: 'A', modelQuantization: 'int8', asOf, previewId: 'model-preview', confirmCount: 2 });
  });
});

describe('הורדת נתונים', () => {
  it('לא מרחיבה את ההורדה כשהמודל שנבחר נעלם מהסטטיסטיקה', async () => {
    const a = { modelFamilyId: 'A', modelQuantization: null };
    const view = render(<ExportDialog models={[a]} onClose={vi.fn()} />);
    await pick('מודל', 'A (מלא)');
    const href = screen.getByRole('link', { name: 'הורד' }).getAttribute('href');
    view.rerender(<ExportDialog models={[]} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'הורד' })).toHaveAttribute('href', href);
    expect(href).toMatch(/^\/api\/search-feedback\/admin\/export\?/);
    expect(href).toContain('modelFamilyId=A');
    expect(href).toContain('noQuantization=1');
    expect(screen.getByRole('button', { name: /^מודל/ })).toHaveTextContent('A (מלא)');
  });
  it('בלי מסננים — הכתובת בלי פרמטרים; שם הפורמט רק בשורה הטכנית', () => {
    render(<ExportDialog models={[]} onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'הורד' })).toHaveAttribute('href', '/api/search-feedback/admin/export');
    expect(screen.getByText('NDJSON')).toBeInTheDocument();
    expect(screen.getByText(/קובץ עם שורה לכל אירוע/)).not.toHaveTextContent('NDJSON');
  });
});

const KEYS = [
  { keyId: 'active-key-123456789', app: 'otzaria', platform: 'windows', appVersionLast: '1.0', eventCount: 1200, lastSeenAt: asOf, status: 'active' },
  { keyId: 'blocked-key-98765432', app: 'otzaria', platform: 'linux', appVersionLast: '0.9', eventCount: 5, lastSeenAt: asOf, status: 'blocked' },
];

describe('התקנות — חסימה וביטול חסימה', () => {
  it('"חסום התקנה" אחרי אישור — POST block בלי גוף; "בטל חסימה" מ-⋮ — POST unblock', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => { calls.push({ url, options }); return Promise.resolve(jsonResponse({ success: true })); }));
    const onChanged = vi.fn();
    render(<ToastProvider><KeysTable keys={KEYS} onChanged={onChanged} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: /חסום את ההתקנה active-key-1/ }));
    const dialog = await screen.findByRole('dialog');
    expect(calls).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'חסום התקנה' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe('/api/search-feedback/admin/keys/active-key-123456789/block');
    expect(calls[0].options).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(calls[0].options.body).toBeUndefined();

    await userEvent.click(screen.getByRole('button', { name: /עוד פעולות להתקנה blocked-key-/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'בטל חסימה' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].url).toBe('/api/search-feedback/admin/keys/blocked-key-98765432/unblock');
    expect(calls[1].options).toMatchObject({ method: 'POST', redirect: 'manual' });
    expect(calls[1].options.body).toBeUndefined();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('התחברות שפגה — לא "ההתקנה נחסמה": הודעה עם "התחבר", ובלי onChanged', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(loginPage())));
    const onChanged = vi.fn();
    render(<ToastProvider><KeysTable keys={KEYS} onChanged={onChanged} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: /חסום את ההתקנה active-key-1/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'חסום התקנה' }));
    expect(await screen.findByText(/פג תוקף ההתחברות/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument();
    expect(screen.queryByText('ההתקנה נחסמה')).not.toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('שגיאת שרת — הודעה בעברית, בלי onChanged; בזמן הבקשה הכפתור "כבוי" בלי disabled אמיתי', async () => {
    let resolve;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolve = r; })));
    const onChanged = vi.fn();
    render(<ToastProvider><KeysTable keys={KEYS} onChanged={onChanged} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: /חסום את ההתקנה active-key-1/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'חסום התקנה' }));
    const button = await screen.findByRole('button', { name: /חסום את ההתקנה active-key-1/ });
    await waitFor(() => expect(button).toHaveTextContent('חוסם…'));
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await act(async () => resolve(jsonResponse({ error: 'Internal Server Error' }, 500)));
    expect(await screen.findByText('לא הצלחנו לעדכן את ההתקנה.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('אחרי חסימה — הפוקוס עובר ל-⋮ של אותה שורה כשהנתונים המעודכנים מגיעים', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ success: true }))));
    let view;
    const onChanged = vi.fn(() => {
      view.rerender(<ToastProvider><KeysTable keys={[{ ...KEYS[0], status: 'blocked' }, KEYS[1]]} onChanged={onChanged} /></ToastProvider>);
    });
    view = render(<ToastProvider><KeysTable keys={KEYS} onChanged={onChanged} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: /חסום את ההתקנה active-key-1/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'חסום התקנה' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /עוד פעולות להתקנה active-key-1/ })).toHaveFocus());
  });

  it('ביטול בדיאלוג — שום בקשה לא נשלחת', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ToastProvider><KeysTable keys={KEYS} onChanged={vi.fn()} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: /חסום את ההתקנה active-key-1/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'ביטול' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const STATS = {
  success: true, enabled: false, totalEvents: 1200, cachedAt: asOf, keys: { total: 2, blocked: 1 },
  byType: [{ type: 'vote', count: 3 }], byDay: [], byModel: [], byAppVersion: [], topKeys: KEYS,
};

describe('מסך משוב חיפוש', () => {
  it('טוען את הסטטיסטיקה, מציג סיכום ולשוניות, ו"רענן" עוקף את המטמון', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn((url) => { urls.push(url); return Promise.resolve(jsonResponse(STATS)); }));
    render(<ToastProvider><SearchFeedbackScreen /></ToastProvider>);
    expect(await screen.findByText(/1,200 אירועים · 2 התקנות, אחת מהן חסומה/)).toBeInTheDocument();
    expect(screen.getByText('קליטת המשוב כבויה')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'משוב חיפוש' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /סיכום/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('הצבעה')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /התקנות/ }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'רענן' }));
    await waitFor(() => expect(urls).toEqual(['/api/search-feedback/admin/stats', '/api/search-feedback/admin/stats?fresh=1']));
  });

  it('התחברות שפגה בטעינה — "פג תוקף ההתחברות" עם "התחבר", לא "נסה שוב"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(loginPage())));
    render(<ToastProvider><SearchFeedbackScreen /></ToastProvider>);
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).not.toBeInTheDocument();
  });

  it('שגיאת טעינה — הודעה ו"נסה שוב"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse({ success: false, error: 'תקלה בשרת' }, 500))));
    render(<ToastProvider><SearchFeedbackScreen /></ToastProvider>);
    expect(await screen.findByText('תקלה בשרת')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });
});
