// מסכי "אימון מודלים" (fetch מדומה): המעטפת החדשה שולחת בדיוק את אותן בקשות כמו המסכים הקודמים (שיטה, כתובת,
// גוף), סינון ולשונית מהכתובת, דיאלוגי אישור, פעולה מרובה בקשה אחר בקשה, מקלדת, ומצבי ריק / שגיאה / אין הרשאה.
import { afterEach, describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('next/navigation', () => {
  const subscribe = (cb) => {
    window.addEventListener('test-url', cb)
    window.addEventListener('popstate', cb)
    return () => {
      window.removeEventListener('test-url', cb)
      window.removeEventListener('popstate', cb)
    }
  }
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))
// רכיבים אינטראקטיביים קיימים (תמונה, קנבס) — לא נבדקים כאן
vi.mock('@/components/ocr/OcrLineContextModal', () => ({ default: () => <div role="dialog" aria-label="העמוד המלא" /> }))
vi.mock('@/components/ocr/layout/LayoutTaskCards', () => ({
  // שינוי בכרטיס — כמו שהכרטיס האמיתי קורא ל-onChange
  PagenumTaskCard: ({ onChange }) => <div>כרטיס מספר עמוד<button type="button" onClick={() => onChange({ confirmed: false, answer: { value: '5' } })}>שנה מספר</button></div>,
  HeaderTaskCard: () => <div>כרטיס כותרת</div>,
  StreamsTaskCard: () => <div>כרטיס זרמים</div>,
  ZonesFullCard: () => <div>כרטיס עמוד מלא</div>,
}))
for (const name of ['replaceState', 'pushState']) {
  const original = window.history[name].bind(window.history)
  window.history[name] = (...args) => {
    original(...args)
    window.dispatchEvent(new Event('test-url'))
  }
}

import TrainingPagesScreen from './TrainingPagesScreen'
import OcrLinesScreen from './OcrLinesScreen'
import OcrLayoutScreen from './OcrLayoutScreen'

const json = (data, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
})

let calls
let routes
beforeEach(() => {
  calls = []
  routes = {}
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const key = `${init?.method || 'GET'} ${String(input)}`
    calls.push({ key, body: init?.body === undefined ? undefined : typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
    const handler = routes[key]
    return handler ? handler(init) : json({ success: false }, { status: 404 })
  }))
})
afterEach(async () => {
  // ההגנה על יציאה (useUnsavedChangesGuard) מוסיפה רשומה להיסטוריה בזמן פעולה מרובה, ומסירה אותה ב-history.back()
  // — שמתבצע אחרי רגע. מחכים לו, כדי שלא יחזיר את הכתובת של הטסט הזה באמצע הטסט הבא.
  await new Promise((resolve) => setTimeout(resolve, 30))
})
const writes = () => calls.filter((c) => !c.key.startsWith('GET '))

function renderAt(url, Screen) {
  window.history.replaceState(null, '', url)
  return render(<ToastProvider><Screen /></ToastProvider>)
}

// ----- עמודים לאימון -----
const PAGES = [
  { id: 'p1', bookName: 'ברכות', pageNumber: 12, status: 'available', scriptType: 'square', filledLines: 0, targetLines: 10, markedLines: 0, createdAt: '2026-10-01T10:00:00Z' },
  { id: 'p2', bookName: 'שבת', pageNumber: 3, status: 'in-progress', scriptType: 'rashi', filledLines: 4, targetLines: 10, markedLines: 6, claimedByName: 'משה כהן', createdAt: '2026-10-02T10:00:00Z' },
  { id: 'p3', bookName: 'עירובין', pageNumber: 7, status: 'completed', scriptType: 'rashi', filledLines: 10, targetLines: 10, markedLines: 10, claimedByName: 'רבקה', createdAt: '2026-10-03T10:00:00Z' },
]

describe('עמודים לאימון', () => {
  beforeEach(() => {
    routes['GET /api/admin/ocr-training'] = () => json({ success: true, pages: PAGES })
    routes['GET /api/admin/ocr-training/books'] = () => json({ success: true, books: [{ id: 'b1', name: 'ברכות', totalPages: 20, isHidden: false }, { id: 'b2', name: 'גנוז', totalPages: 5, isHidden: true }] })
    routes['DELETE /api/admin/ocr-training/p1'] = () => json({ success: true })
    routes['DELETE /api/admin/ocr-training/p3'] = () => json({ success: true })
    routes['PATCH /api/admin/ocr-training/p2'] = () => json({ success: true })
    routes['POST /api/admin/ocr-training'] = () => json({ success: true, id: 'new' })
  })

  test('כותרת, מונים לפי כתב, סינון מהכתובת ו"פתח" כקישור לעמוד הסימון', async () => {
    renderAt('/library/admin/ocr-training?script=rashi', TrainingPagesScreen)
    expect(screen.getByRole('heading', { level: 1, name: 'עמודים לאימון' })).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'העמודים' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).queryByText('ברכות')).toBeNull()
    expect(screen.getByRole('list', { name: 'מונים לפי סוג כתב' })).toHaveTextContent('14שורות עם טקסט')
    expect(screen.getByRole('link', { name: 'פתח את שבת, עמוד 3' })).toHaveAttribute('href', '/library/ocr-training/p2')
    await userEvent.click(screen.getAllByRole('button', { name: 'נקה סינון' })[0])
    expect(window.location.search).toBe('')
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'העמודים' })).getAllByRole('listitem')).toHaveLength(3))
  })

  test('מחק לצמיתות — דיאלוג אדום, ואותה בקשה כמו קודם; שחרר — PATCH release', async () => {
    renderAt('/library/admin/ocr-training', TrainingPagesScreen)
    await screen.findByRole('list', { name: 'העמודים' })
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות: ברכות, עמוד 12' }))
    expect(screen.queryByRole('menuitem', { name: 'שחרר' })).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('למחוק לצמיתות את ברכות, עמוד 12?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(screen.queryByText('ברכות')).toBeNull())
    expect(writes().map((c) => c.key)).toEqual(['DELETE /api/admin/ocr-training/p1'])

    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות: שבת, עמוד 3' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'שחרר' }))
    const release = await screen.findByRole('dialog')
    expect(release).toHaveTextContent('משה כהן כבר לא יוכל להמשיך')
    await userEvent.click(within(release).getByRole('button', { name: 'שחרר' }))
    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()[1]).toEqual({ key: 'PATCH /api/admin/ocr-training/p2', body: { action: 'release' } })
  })

  test('עמוד שהושלם: "הושלם בידי" (לא "בעבודה אצל"), ושחרור אומר שהוא יוצא מהורדת ההושלמו', async () => {
    renderAt('/library/admin/ocr-training', TrainingPagesScreen)
    const list = await screen.findByRole('list', { name: 'העמודים' })
    const done = within(list).getAllByRole('listitem')[2]
    expect(done).toHaveTextContent('הושלם בידי רבקה')
    expect(done).not.toHaveTextContent('בעבודה אצל')
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('בעבודה אצל משה כהן')
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות: עירובין, עמוד 7' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'שחרר' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('לא ייכלל בהורדת השורות מעמודים שהושלמו')
  })

  test('מחיקה מרובה — בקשה לכל עמוד, אחרי אישור עם המספר', async () => {
    renderAt('/library/admin/ocr-training', TrainingPagesScreen)
    await screen.findByRole('list', { name: 'העמודים' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'בחר את ברכות, עמוד 12' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'בחר את עירובין, עמוד 7' }))
    expect(screen.getByRole('group', { name: 'פעולות על הנבחרים' })).toHaveTextContent('2 עמודים נבחרו')
    await userEvent.click(screen.getByRole('button', { name: 'מחק לצמיתות את הנבחרים' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('למחוק לצמיתות 2 עמודים?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(writes().map((c) => c.key)).toEqual(['DELETE /api/admin/ocr-training/p1', 'DELETE /api/admin/ocr-training/p3']))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'העמודים' })).getAllByRole('listitem')).toHaveLength(1))
  })

  test('הוסף עמוד — בדיקה לפני שליחה, ואותו גוף כמו קודם', async () => {
    renderAt('/library/admin/ocr-training', TrainingPagesScreen)
    await screen.findByRole('list', { name: 'העמודים' })
    await userEvent.click(screen.getByRole('button', { name: 'הוסף עמוד' }))
    const drawer = await screen.findByRole('dialog', { name: 'הוסף עמוד' })
    await userEvent.click(within(drawer).getByRole('button', { name: 'הוסף' }))
    expect(within(drawer).getByRole('alert')).toHaveTextContent('בחר ספר.')
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /^ספר/ })).toBeEnabled())
    await userEvent.click(within(drawer).getByRole('button', { name: /^ספר/ }))
    await userEvent.click(await screen.findByRole('option', { name: /ברכות/ }))
    await userEvent.type(within(drawer).getByLabelText('מספר עמוד'), '21')
    await userEvent.click(within(drawer).getByRole('button', { name: 'הוסף' }))
    expect(within(drawer).getByRole('alert')).toHaveTextContent('לספר יש 20 עמודים בלבד.')
    await userEvent.clear(within(drawer).getByLabelText('מספר עמוד'))
    await userEvent.type(within(drawer).getByLabelText('מספר עמוד'), '5')
    await userEvent.click(within(drawer).getByRole('radio', { name: 'רש״י' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'הוסף' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'POST /api/admin/ocr-training', body: { bookId: 'b1', pageNumber: 5, scriptType: 'rashi' } }]))
  })

  test('ריק ושגיאה', async () => {
    routes['GET /api/admin/ocr-training'] = () => json({ success: true, pages: [] })
    const { unmount } = renderAt('/library/admin/ocr-training', TrainingPagesScreen)
    expect(await screen.findByText('אין עדיין עמודים לאימון')).toBeInTheDocument()
    unmount()
    routes['GET /api/admin/ocr-training'] = () => json({ error: 'Forbidden' }, { status: 403 })
    renderAt('/library/admin/ocr-training', TrainingPagesScreen)
    expect(await screen.findByText('אין לך הרשאה לראות את המסך הזה')).toBeInTheDocument()
  })
})

// ----- תמלול שורות -----
const LINES = [
  { id: 'l1', status: 'submitted', text: 'ויאמר משה', prefill: 'ויאמר משח', scriptType: 'square', bookName: 'ברכות', pageNumber: 2, transcribedByName: 'רחל', batch: 'b-1' },
  { id: 'l2', status: 'submitted', text: 'אל העם', scriptType: 'square', suggestedScriptType: 'rashi', bookName: 'שבת', pageNumber: 4 },
  { id: 'l3', status: 'submitted', text: 'לאמר', scriptType: 'rashi', bookName: 'עירובין', pageNumber: 9 },
]
const COUNTS = { submitted: 3, flagged: 1, available: 5, approved: 2 }

describe('תמלול שורות', () => {
  beforeEach(() => {
    routes['GET /api/admin/ocr-lines?status=submitted&skip=0&pool=all'] = () => json({ success: true, lines: LINES, total: 3, counts: COUNTS })
    routes['GET /api/admin/ocr-lines?status=flagged&skip=0&pool=proofread'] = () => json({
      success: true, total: 1, counts: COUNTS,
      lines: [{ id: 'f1', status: 'available', flagged: 'bad_crop', flaggedByName: 'דוד', scriptType: 'square', bookName: 'ברכות', pageNumber: 1 }],
    })
    for (const id of ['l1', 'l2', 'l3', 'f1']) routes[`PATCH /api/admin/ocr-lines/${id}`] = (init) => json({ success: true, scriptType: 'rashi', text: JSON.parse(init.body).text })
  })

  test('לשוניות לפי המילון עם מונים, אשר — אותו גוף כמו קודם, והמונים זזים', async () => {
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    const nav = await screen.findByRole('navigation', { name: 'השורות לפי מצב' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent.replace(/, (שורה אחת|[\d,]+ שורות)/, ''))).toEqual(['לאישורממתין לאישור3', 'לבדיקהדורש בדיקה1', 'פנוי5', 'מאושר2'])
    expect(within(nav).getByRole('link', { name: /^דורש בדיקה, שורה אחת/ })).toHaveAttribute('href', '/library/admin/ocr-lines?tab=flagged')
    const list = await screen.findByRole('list', { name: 'השורות' })
    // הצעה פתוחה לשנות סוג כתב — "אשר" מושבת (נשאר בפוקוס) עד שמחליטים, וההסבר גלוי ומחובר לכפתור
    const second = within(list).getAllByRole('listitem')[1]
    expect(within(second).getByRole('button', { name: 'אשר' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(second).getByRole('button', { name: 'אשר' })).toHaveAccessibleDescription(/החלט על ההצעה לפני האישור/)
    await userEvent.click(within(within(list).getAllByRole('listitem')[0]).getByRole('button', { name: 'אשר' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-lines/l1', body: { action: 'approve' } }]))
    await waitFor(() => expect(within(nav).getAllByRole('link')[3]).toHaveTextContent('3 שורות'))
    // קבלת הצעת הכתב
    await userEvent.click(within(second).getByRole('button', { name: 'קבל' }))
    await waitFor(() => expect(writes()[1]).toEqual({ key: 'PATCH /api/admin/ocr-lines/l2', body: { action: 'accept-script' } }))
  })

  test('שלח להקלדה מחדש — דיאלוג, ואותה בקשה; מקלדת: J ו-A', async () => {
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    const list = await screen.findByRole('list', { name: 'השורות' })
    await userEvent.click(within(within(list).getAllByRole('listitem')[2]).getByRole('button', { name: 'שלח להקלדה מחדש' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('הטקסט שהוקלד יימחק')
    await userEvent.click(within(dialog).getByRole('button', { name: 'שלח להקלדה מחדש' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-lines/l3', body: { action: 'return' } }]))
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))
    within(list).getAllByRole('listitem')[0].focus()
    await userEvent.keyboard('j')
    expect(within(list).getAllByRole('listitem')[1]).toHaveFocus()
    await userEvent.keyboard('k')
    await userEvent.keyboard('a')
    await waitFor(() => expect(writes()[1]).toEqual({ key: 'PATCH /api/admin/ocr-lines/l1', body: { action: 'approve' } }))
  })

  test('אשר נבחרות — רק שורות שאפשר לאשר, בקשה אחר בקשה', async () => {
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    await screen.findByRole('list', { name: 'השורות' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'בחר את כל השורות שאפשר לאשר' }))
    expect(screen.getByRole('group', { name: 'פעולות על הנבחרים' })).toHaveTextContent('2 שורות נבחרו')
    await userEvent.click(screen.getByRole('button', { name: 'אשר את הנבחרות' }))
    await waitFor(() => expect(writes().map((c) => `${c.key} ${c.body.action}`)).toEqual(['PATCH /api/admin/ocr-lines/l1 approve', 'PATCH /api/admin/ocr-lines/l3 approve']))
  })

  test('עריכת טקסט: Enter שומר (set-text); עריכה שלא נשמרה — "שמור ואשר" שומר ואז מאשר', async () => {
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    const list = await screen.findByRole('list', { name: 'השורות' })
    await userEvent.type(within(list).getByRole('textbox', { name: 'הטקסט של ברכות, עמוד 2' }), 'ו')
    expect(screen.getByText('Enter — שמור')).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-lines/l1', body: { action: 'set-text', text: 'ויאמר משהו' } }]))
    const third = within(list).getAllByRole('listitem')[2]
    await userEvent.type(within(third).getByRole('textbox'), 'ו')
    await userEvent.click(within(third).getByRole('button', { name: 'שמור ואשר' }))
    await waitFor(() => expect(writes().slice(1)).toEqual([
      { key: 'PATCH /api/admin/ocr-lines/l3', body: { action: 'set-text', text: 'לאמרו' } },
      { key: 'PATCH /api/admin/ocr-lines/l3', body: { action: 'approve' } },
    ]))
  })

  test('סוג כתב: set-script ו-reject-script — אותו גוף כמו קודם; מחק לצמיתות — DELETE', async () => {
    routes['DELETE /api/admin/ocr-lines/l3'] = () => json({ success: true })
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    const list = await screen.findByRole('list', { name: 'השורות' })
    const [first, second] = within(list).getAllByRole('listitem')
    await userEvent.click(within(first).getByRole('button', { name: 'רש״י' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-lines/l1', body: { action: 'set-script', scriptType: 'rashi' } }]))
    await userEvent.click(within(second).getByRole('button', { name: 'דחה' }))
    await waitFor(() => expect(writes()[1]).toEqual({ key: 'PATCH /api/admin/ocr-lines/l2', body: { action: 'reject-script' } }))
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות: עירובין, עמוד 9' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(writes()[2]).toEqual({ key: 'DELETE /api/admin/ocr-lines/l3', body: undefined }))
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))
  })

  test('מקלדת: J מכל מקום בדף, A עובר לשורה הבאה, A על שורה שאי אפשר לאשר — הודעה', async () => {
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    const list = await screen.findByRole('list', { name: 'השורות' })
    document.body.focus()
    await userEvent.keyboard('j')
    expect(within(list).getAllByRole('listitem')[0]).toHaveFocus()
    await userEvent.keyboard('a')
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))
    // הפוקוס עבר לשורה הבאה (שיש בה הצעת סוג כתב) — A אומר למה אי אפשר
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveFocus())
    await userEvent.keyboard('a')
    expect(await screen.findByText(/קבל או דחה אותה לפני האישור/)).toBeInTheDocument()
    expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-lines/l1', body: { action: 'approve' } }])
  })

  test('אשר נבחרות — תקלה בשרת עוצרת; מה שלא אושר נשאר מסומן, וההודעה אומרת "נעצר"', async () => {
    routes['PATCH /api/admin/ocr-lines/l1'] = () => json({ error: 'boom' }, { status: 500 })
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    await screen.findByRole('list', { name: 'השורות' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'בחר את כל השורות שאפשר לאשר' }))
    await userEvent.click(screen.getByRole('button', { name: 'אשר את הנבחרות' }))
    expect(await screen.findByText(/נעצר — 2 שורות נשארו מסומנות/)).toBeInTheDocument()
    expect(writes().map((c) => c.key)).toEqual(['PATCH /api/admin/ocr-lines/l1'])
    expect(screen.getByRole('checkbox', { name: 'בחר את עירובין, עמוד 9' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'בחר את ברכות, עמוד 2' })).toBeChecked()
  })

  test('הצג עוד — skip לפי מה שמוצג; תשובה שחוזרת אחרי מעבר לשונית — לא נכנסת', async () => {
    routes['GET /api/admin/ocr-lines?status=submitted&skip=0&pool=all'] = () => json({ success: true, lines: LINES, total: 5, counts: COUNTS })
    let release
    routes['GET /api/admin/ocr-lines?status=submitted&skip=3&pool=all'] = () => new Promise((resolve) => {
      release = () => resolve(json({ success: true, total: 5, counts: { ...COUNTS, available: 999 }, lines: [{ id: 'old', status: 'submitted', text: 'שורה ישנה', bookName: 'ישן', pageNumber: 1 }] }))
    })
    renderAt('/library/admin/ocr-lines', OcrLinesScreen)
    await screen.findByRole('list', { name: 'השורות' })
    await userEvent.click(screen.getByRole('button', { name: 'הצג עוד (2 נוספות)' }))
    expect(calls.map((c) => c.key)).toContain('GET /api/admin/ocr-lines?status=submitted&skip=3&pool=all')
    window.history.pushState(null, '', '/library/admin/ocr-lines?tab=flagged&pool=proofread')
    const list = await screen.findByRole('list', { name: 'השורות' })
    await waitFor(() => expect(within(list).getByText(/דווח: החיתוך שגוי/)).toBeInTheDocument())
    release()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('textbox', { name: 'הטקסט של ישן, עמוד 1' })).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'השורות לפי מצב' })).getByRole('link', { name: /^פנוי/ })).toHaveTextContent('5')
  })

  test('דורש בדיקה ומקור מהכתובת: הסבר מה מחליטים, "הדיווח שגוי — החזר לתמלול" — unflag', async () => {
    renderAt('/library/admin/ocr-lines?tab=flagged&pool=proofread', OcrLinesScreen)
    const list = await screen.findByRole('list', { name: 'השורות' })
    expect(within(list).getByText(/דווח: החיתוך שגוי/)).toBeInTheDocument()
    expect(within(list).queryByRole('button', { name: 'אשר' })).toBeNull()
    expect(screen.getByText(/אם הדיווח שגוי — החזר את השורה לתמלול/)).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('button', { name: 'הדיווח שגוי — החזר לתמלול' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-lines/f1', body: { action: 'unflag' } }]))
  })
})

// ----- תיוג מבנה -----
const LAYOUT = {
  success: true, total: 1, counts: { submitted: 1, approved: 0, available: 4 }, facets: { batches: ['hard7'], editions: ['ed1'] },
  pages: [{ id: 'g1', edition: 'ed1', pageStem: 'p0004', batch: 'hard7', status: 'submitted', answeredByName: 'שרה', imageWidth: 100, imageHeight: 200,
    tasks: [{ kind: 'pagenum', prefill: { value: 4 }, answer: { value: 4 }, confirmed: true }] }],
}

describe('תיוג מבנה', () => {
  beforeEach(() => {
    routes['GET /api/admin/ocr-layout?status=submitted&skip=0'] = () => json(LAYOUT)
    routes['GET /api/admin/ocr-layout?status=submitted&skip=0&batch=hard7'] = () => json(LAYOUT)
    routes['PATCH /api/admin/ocr-layout/g1'] = () => json({ success: true })
    routes['POST /api/admin/ocr-layout/import'] = () => json({ success: true, summary: { pages: 3, created: 2, updated: 1, skippedAnswered: 0, byKind: { pagenum: 3 }, errors: [] } })
  })

  test('כרטיס עם תקציר, סינון לפי קבוצה נכנס לבקשה, אשר ופתיחת הסקירה', async () => {
    renderAt('/library/admin/ocr-layout?batch=hard7', OcrLayoutScreen)
    const list = await screen.findByRole('list', { name: 'העמודים' })
    expect(calls.map((c) => c.key)).toContain('GET /api/admin/ocr-layout?status=submitted&skip=0&batch=hard7')
    expect(within(list).getByText('מספר עמוד: 4 · ההצעה של המכונה אושרה')).toBeInTheDocument()
    await userEvent.click(within(list).getByRole('button', { name: 'פתח את ed1 / p0004' }))
    const review = await screen.findByRole('dialog', { name: 'סקירה: ed1 / p0004' })
    expect(within(review).getByText('כרטיס מספר עמוד')).toBeInTheDocument()
    await userEvent.click(within(review).getByRole('button', { name: 'אשר' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-layout/g1', body: { action: 'approve' } }]))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'סקירה: ed1 / p0004' })).toBeNull())
  })

  test('חלון הסקירה: שמירה — set-answers עם מה שנערך בלבד; סגירה עם תיקונים שלא נשמרו שואלת', async () => {
    routes['PATCH /api/admin/ocr-layout/g1'] = (init) => json({ success: true, tasks: JSON.parse(init.body).answers.map(() => ({ kind: 'pagenum', prefill: { value: 4 }, answer: { value: 5 } })) })
    renderAt('/library/admin/ocr-layout', OcrLayoutScreen)
    const list = await screen.findByRole('list', { name: 'העמודים' })
    await userEvent.click(within(list).getByRole('button', { name: 'פתח את ed1 / p0004' }))
    const review = await screen.findByRole('dialog', { name: 'סקירה: ed1 / p0004' })
    await waitFor(() => expect(review).toHaveFocus())
    await userEvent.click(within(review).getByRole('button', { name: 'שנה מספר' }))
    // פעולה ראשית אחת: כשיש תיקונים — "שמור תיקונים" במקום "אשר"
    expect(within(review).queryByRole('button', { name: 'אשר' })).toBeNull()
    expect(within(review).getByRole('button', { name: 'שמור תיקונים' })).toBeInTheDocument()
    // Esc — שואל; "הישאר" — החלון נשאר
    await userEvent.keyboard('{Escape}')
    const ask = await screen.findByRole('dialog', { name: 'לצאת בלי לשמור?' })
    await userEvent.click(within(ask).getByRole('button', { name: 'הישאר' }))
    expect(screen.getByRole('dialog', { name: 'סקירה: ed1 / p0004' })).toBeInTheDocument()
    await userEvent.click(within(review).getByRole('button', { name: 'שמור תיקונים' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-layout/g1', body: { action: 'set-answers', answers: [{ answer: { value: '5' } }] } }]))
    // אחרי השמירה — "אשר" חוזר לאותו מקום
    expect(await within(review).findByRole('button', { name: 'אשר' })).toBeInTheDocument()
    // נשמר — סגירה בלי שאלה
    await userEvent.click(within(review).getByRole('button', { name: 'סגור' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'סקירה: ed1 / p0004' })).toBeNull())
  })

  test('"אשר" — לחיצה כפולה שולחת פעם אחת', async () => {
    let release
    routes['PATCH /api/admin/ocr-layout/g1'] = () => new Promise((resolve) => { release = () => resolve(json({ success: true })) })
    routes['DELETE /api/admin/ocr-layout/g1'] = () => json({ success: true })
    renderAt('/library/admin/ocr-layout', OcrLayoutScreen)
    const list = await screen.findByRole('list', { name: 'העמודים' })
    const approve = within(list).getByRole('button', { name: 'אשר' })
    await userEvent.click(approve)
    await userEvent.click(approve)
    release()
    expect(await screen.findByText('אין עמודים שממתינים לאישור')).toBeInTheDocument()
    expect(writes()).toEqual([{ key: 'PATCH /api/admin/ocr-layout/g1', body: { action: 'approve' } }])
  })

  test('שלח לסימון מחדש ומחק לצמיתות — דיאלוג, ואותן בקשות', async () => {
    routes['DELETE /api/admin/ocr-layout/g1'] = () => json({ success: true })
    renderAt('/library/admin/ocr-layout', OcrLayoutScreen)
    const list = await screen.findByRole('list', { name: 'העמודים' })
    await userEvent.click(within(list).getByRole('button', { name: 'שלח לסימון מחדש' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('מה שהמתנדב סימן יימחק')
    await userEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    await userEvent.click(screen.getByRole('button', { name: 'עוד פעולות: ed1 / p0004' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'מחק לצמיתות' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'מחק לצמיתות' }))
    await waitFor(() => expect(writes()).toEqual([{ key: 'DELETE /api/admin/ocr-layout/g1', body: undefined }]))
  })

  test('ייבא עמודים — קובץ ZIP בלבד, ואחרי הייבוא סיכום', async () => {
    renderAt('/library/admin/ocr-layout', OcrLayoutScreen)
    await screen.findByRole('list', { name: 'העמודים' })
    await userEvent.click(screen.getAllByRole('button', { name: 'ייבא עמודים' })[0])
    const drawer = await screen.findByRole('dialog', { name: 'ייבא עמודים לתיוג' })
    const input = within(drawer).getByLabelText('קובץ ZIP')
    await userEvent.upload(input, new File(['x'], 'batch.zip', { type: 'application/zip' }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'ייבא' }))
    expect(await within(drawer).findByText('נקלטו 3 עמודים: 2 חדשים, 1 עודכנו.')).toBeInTheDocument()
    const post = writes().find((c) => c.key === 'POST /api/admin/ocr-layout/import')
    expect(post.body).toBeInstanceOf(FormData)
    expect(post.body.get('file').name).toBe('batch.zip')
  })
})
