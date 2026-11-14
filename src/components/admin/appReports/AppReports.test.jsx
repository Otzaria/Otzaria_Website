import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/Toast';
import AppReportsScreen from './AppReportsScreen';
import AppReportScreen from './AppReportScreen';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ok = (body, status = 200) => ({
  ok: status < 400, status, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body,
});
// מה ש-fetch רגיל היה מקבל אחרי הפניה לדף ההתחברות: 200 עם HTML
const loginPage = () => ({
  ok: true, status: 200, type: 'basic', redirected: true, headers: new Headers({ 'content-type': 'text/html' }),
  json: async () => { throw new SyntaxError('<'); }, text: async () => '<!DOCTYPE html><title>login</title>',
});
const text = (body, contentType = 'application/json') => ({
  ok: true, status: 200, type: 'basic', redirected: false, headers: new Headers({ 'content-type': contentType }), text: async () => body,
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const REPORT = {
  reportId: 'r1', title: 'קריסה בפתיחת ספר', product: 'otzaria', type: 'crash', trigger: 'auto_crash', appVersion: '1.2.3',
  platform: 'windows', createdAt: '2026-11-01T10:00:00.000Z', hasEmail: true, issueNumber: 42, issueUrl: 'https://github.com/x/y/issues/42', issueState: 'open',
};

describe('רשימת דיווחי התקלות', () => {
  it('אותה בקשה כמו קודם, וסינון מוסיף פרמטר וחוזר לעמוד 1', async () => {
    const urls = [];
    vi.stubGlobal('fetch', vi.fn((url) => {
      urls.push(url);
      return Promise.resolve(ok({ success: true, total: 120, reports: [REPORT], github: { repo: 'Otzaria/otzaria', tokenConfigured: false } }));
    }));
    render(<AppReportsScreen />);
    expect(await screen.findByRole('link', { name: 'קריסה בפתיחת ספר' })).toHaveAttribute('href', '/library/admin/app-reports/r1');
    expect(urls[0]).toBe('/api/app-reports/admin/list?page=1&limit=50');
    expect(screen.getByText('אין חיבור ל-GitHub')).toBeInTheDocument();
    expect(screen.getByText('120 דיווחים')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'דיווחי תקלות' })).toBeInTheDocument();
    expect(screen.getByText('השאיר כתובת מייל')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /הבא/ }));
    await waitFor(() => expect(urls.at(-1)).toBe('/api/app-reports/admin/list?page=2&limit=50'));
    await userEvent.click(screen.getByRole('button', { name: /^סוג/ }));
    await userEvent.click(await screen.findByRole('option', { name: /קריסה/ }));
    await waitFor(() => expect(urls.at(-1)).toBe('/api/app-reports/admin/list?page=1&limit=50&type=crash'));
    await userEvent.click(screen.getAllByRole('button', { name: 'נקה סינון' })[0]);
    await waitFor(() => expect(urls.at(-1)).toBe('/api/app-reports/admin/list?page=1&limit=50'));
  });

  it('התחברות שפגה — "פג תוקף ההתחברות" עם "התחבר", לא "נסה שוב"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(loginPage())));
    render(<AppReportsScreen />);
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).not.toBeInTheDocument();
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('שבת (503) — ההסבר בעברית ו"נסה שוב"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ error: 'shabbat', message: 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים' }, 503))));
    render(<AppReportsScreen />);
    expect(await screen.findByText('הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים')).toBeInTheDocument();
    expect(screen.queryByText('shabbat')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
  });

  it('אין דיווחים — מצב ריק', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ success: true, total: 0, reports: [] }))));
    render(<AppReportsScreen />);
    expect(await screen.findByText('אין דיווחים')).toBeInTheDocument();
  });
});

describe('עמוד דיווח תקלה', () => {
  const detail = (extra = {}) => ({ success: true, canSeeEmail: true, related: [], report: { ...REPORT, reporterEmail: 'a@b.c', description: 'נפל', contactLog: [], ...extra } });

  it('בדיקה אוטומטית: דיווח שלא נפתח מציג את ההחלטה, ו"פתח כרטיס בכל זאת" שולח POST וטוען מחדש', async () => {
    const calls = [];
    const held = detail({
      issueNumber: null, issueUrl: null, issueState: null, issuePending: false,
      triage: { state: 'held', verdict: 'external', confidence: 'high', decidedAt: '2026-11-02T10:00:00.000Z', summary: 'לחץ זיכרון במחשב המדווח', questions: ['מה עשית?'], questionsSentAt: '2026-11-02T10:00:00.000Z' },
    });
    const opened = detail({ triage: { ...held.report.triage, state: 'forced' } });
    vi.stubGlobal('fetch', vi.fn((url, init = {}) => {
      calls.push({ url, method: init.method || 'GET' });
      if (init.method === 'POST') return Promise.resolve(ok({ ok: true, state: 'forced', issueNumber: 42 }));
      return Promise.resolve(ok(calls.some((c) => c.method === 'POST') ? opened : held));
    }));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    expect(await screen.findByText('לחץ זיכרון במחשב המדווח')).toBeInTheDocument();
    expect(screen.getAllByText('לא נפתח').length).toBeGreaterThan(0);
    expect(screen.getByText('סיבה חיצונית')).toBeInTheDocument();
    expect(screen.getByText('שאלות שנשלחו למדווח')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'פתח כרטיס בכל זאת' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/app-reports/admin/r1/publish' && c.method === 'POST')).toBe(true));
    expect(await screen.findByText('נפתח ידנית')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'פתח כרטיס בכל זאת' })).not.toBeInTheDocument();
  });

  it('מציג פרטים, קבצים וכרטיס ב-GitHub; שולח הודעה למדווח באותה בקשה כמו קודם', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn((url, options) => {
      calls.push({ url, options });
      if (options?.method === 'POST') return Promise.resolve(ok({ success: true, entry: { direction: 'out', byName: 'מנהל', subject: 'שלום', message: 'תודה' } }));
      return Promise.resolve(ok(detail({ files: { errors: { size: 2048 } } })));
    }));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'קריסה בפתיחת ספר' })).toBeInTheDocument();
    expect(calls[0].url).toBe('/api/app-reports/admin/r1');
    expect(screen.getByRole('link', { name: /כרטיס 42 ב-GitHub/ })).toHaveAttribute('href', 'https://github.com/x/y/issues/42');
    expect(screen.getByRole('link', { name: /errors\.txt/ })).toHaveAttribute('href', '/api/app-reports/admin/r1/files/errors');
    expect(screen.getByText('a@b.c')).toBeInTheDocument();

    const form = screen.getByRole('region', { name: 'שלח הודעה למדווח' });
    await userEvent.type(within(form).getByLabelText('נושא'), 'שלום');
    await userEvent.type(within(form).getByLabelText('ההודעה'), 'תודה');
    await userEvent.click(within(form).getByRole('button', { name: 'שלח הודעה' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].url).toBe('/api/app-reports/r1/contact');
    expect(calls[1].options.method).toBe('POST');
    expect(calls[1].options.redirect).toBe('manual');
    expect(JSON.parse(calls[1].options.body)).toEqual({ subject: 'שלום', message: 'תודה' });
    expect(await screen.findByText('ההודעה נשלחה למדווח')).toBeInTheDocument();
    expect(within(form).getByLabelText('נושא')).toHaveValue('');
    expect(within(form).getByLabelText('ההודעה')).toHaveValue('');
    expect(within(screen.getByRole('list', { name: 'ההתכתבות עם המדווח' })).getByText('תודה')).toBeInTheDocument();
  });

  it('שליחה: בזמן הבקשה "שולח…" בלי disabled אמיתי, ולחיצה נוספת לא שולחת שוב', async () => {
    let resolvePost;
    vi.stubGlobal('fetch', vi.fn((url, options) => (options?.method === 'POST'
      ? new Promise((r) => { resolvePost = r; })
      : Promise.resolve(ok(detail())))));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    const form = await screen.findByRole('region', { name: 'שלח הודעה למדווח' });
    await userEvent.type(within(form).getByLabelText('נושא'), 'א');
    await userEvent.type(within(form).getByLabelText('ההודעה'), 'ב');
    await userEvent.click(within(form).getByRole('button', { name: 'שלח הודעה' }));
    const sending = within(form).getByRole('button', { name: 'שולח…' });
    expect(sending).not.toBeDisabled();
    expect(sending).toHaveAttribute('aria-disabled', 'true');
    fireEvent.submit(sending.closest('form'));
    expect(global.fetch).toHaveBeenCalledTimes(2);
    await act(async () => resolvePost(ok({ success: true, entry: { direction: 'out', byName: 'מנהל', subject: 'א', message: 'ב' } })));
    expect(await screen.findByText('ההודעה נשלחה למדווח')).toBeInTheDocument();
  });

  it('שליחה כשההתחברות פגה (401 מהראוט) — "פג תוקף" עם "התחבר", וההודעה נשארת בטופס', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => Promise.resolve(options?.method === 'POST' ? ok({ error: 'Unauthorized' }, 401) : ok(detail()))));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    const form = await screen.findByRole('region', { name: 'שלח הודעה למדווח' });
    await userEvent.type(within(form).getByLabelText('נושא'), 'א');
    await userEvent.type(within(form).getByLabelText('ההודעה'), 'ב');
    await userEvent.click(within(form).getByRole('button', { name: 'שלח הודעה' }));
    const alert = await within(form).findByRole('alert');
    expect(alert).toHaveTextContent('פג תוקף ההתחברות');
    expect(within(alert).getByRole('link', { name: 'התחבר' })).toBeInTheDocument();
    expect(within(form).getByLabelText('ההודעה')).toHaveValue('ב');
    expect(screen.queryByText('ההודעה נשלחה למדווח')).not.toBeInTheDocument();
  });

  it('שליחה: שגיאת שרת באנגלית — הודעה בעברית', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => Promise.resolve(options?.method === 'POST' ? ok({ error: 'Failed to contact reporter' }, 500) : ok(detail()))));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    const form = await screen.findByRole('region', { name: 'שלח הודעה למדווח' });
    await userEvent.type(within(form).getByLabelText('נושא'), 'א');
    await userEvent.type(within(form).getByLabelText('ההודעה'), 'ב');
    await userEvent.click(within(form).getByRole('button', { name: 'שלח הודעה' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('לא הצלחנו לשלוח את ההודעה. נסה שוב.');
  });

  it('טעינה כשההתחברות פגה — "פג תוקף ההתחברות" עם "התחבר"', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(loginPage())));
    render(<AppReportScreen reportId="r1" />);
    expect(await screen.findByText('פג תוקף ההתחברות')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument();
  });

  it('שגיאת טעינה — "נסה שוב" טוען שוב', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(++n === 1 ? ok({ error: 'Internal Server Error' }, 500) : ok(detail()))));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'נסה שוב' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'קריסה בפתיחת ספר' })).toBeInTheDocument();
  });

  it('אבחון: דף ההתחברות לא מוצג כאבחון — הודעה ו"התחבר"; אבחון תקין — מוצג מעוצב', async () => {
    let diagnostics = loginPage();
    const urls = [];
    vi.stubGlobal('fetch', vi.fn((url) => {
      urls.push(url);
      return Promise.resolve(url.endsWith('/files/diagnostics') ? diagnostics : ok(detail({ files: { diagnostics: { size: 10 } } })));
    }));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'הצג את האבחון' }));
    expect(await screen.findByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeInTheDocument();
    expect(screen.queryByText(/DOCTYPE/)).not.toBeInTheDocument();
    expect(urls.at(-1)).toBe('/api/app-reports/admin/r1/files/diagnostics');

    diagnostics = text('{"a":1}');
    await userEvent.click(screen.getByRole('button', { name: 'הסתר את האבחון' }));
    await userEvent.click(screen.getByRole('button', { name: 'הצג את האבחון' }));
    expect(await screen.findByText(/"a": 1/)).toBeInTheDocument();
  });

  it('אבחון: שגיאה (404) — הודעה בעברית ו"נסה שוב", לא גוף השגיאה', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (!url.endsWith('/files/diagnostics')) return Promise.resolve(ok(detail({ files: { diagnostics: { size: 10 } } })));
      return Promise.resolve(++n === 1 ? ok({ error: 'File not found' }, 404) : text('plain diagnostics', 'text/plain'));
    }));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'הצג את האבחון' }));
    expect(await screen.findByText('לא הצלחנו לטעון את האבחון.')).toBeInTheDocument();
    expect(screen.queryByText(/File not found/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'נסה שוב' }));
    expect(await screen.findByText('plain diagnostics')).toBeInTheDocument();
  });

  it('429 — הודעה ברורה בטופס', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => Promise.resolve(options?.method === 'POST' ? ok({ success: false }, 429) : ok(detail()))));
    render(<ToastProvider><AppReportScreen reportId="r1" /></ToastProvider>);
    const form = await screen.findByRole('region', { name: 'שלח הודעה למדווח' });
    await userEvent.type(within(form).getByLabelText('נושא'), 'א');
    await userEvent.type(within(form).getByLabelText('ההודעה'), 'ב');
    await userEvent.click(within(form).getByRole('button', { name: 'שלח הודעה' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('יותר מדי הודעות');
  });

  it('404 — "הדיווח לא נמצא" וחזרה לרשימה', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(ok({ success: false }, 404))));
    render(<AppReportScreen reportId="nope" />);
    expect(await screen.findByText('הדיווח לא נמצא')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'דיווחי תקלות' })).toHaveAttribute('href', '/library/admin/app-reports');
  });
});
