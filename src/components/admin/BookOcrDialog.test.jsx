import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookOcrDialog from './BookOcrDialog'

const book = { id: '507f1f77bcf86cd799439011', name: 'ספר בדיקה' }
const fetchMock = vi.fn()

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

const ONLINE = { configured: true, lastSeenAt: new Date().toISOString(), availability: 'online' }

function statusBody({
  job = null, worker = ONLINE, counts = { pagesWithImage: 10, editedPagesCount: 0 }, conflictsOpen = 0,
  bookConflictsOpen = conflictsOpen, olderResultConflicts = [],
} = {}) {
  return { success: true, counts, job, worker, conflictsOpen, bookConflictsOpen, olderResultConflicts }
}

function localJob(overrides = {}) {
  return {
    id: '507f1f77bcf86cd799439022',
    method: 'local',
    status: 'queued',
    totalPages: 10,
    processedPages: 0,
    successPages: 0,
    failedPages: 0,
    progress: { phase: null, pagesDone: 0, pagesTotal: 10 },
    workerMessage: null,
    decision: null,
    summary: { applied: 0, failed: 0, conflicts: 0, missing: 0 },
    pageErrors: [],
    resultConflicts: [],
    resultRejections: [],
    ...overrides,
  }
}

/**
 * routes: { status?: () => body | body[], start?: (body) => response, cancel?: (body) => response, ... }
 * מחזיר את רשימת הקריאות לכל נתיב (גוף JSON מפוענח).
 */
function mockApi({ status = () => statusBody(), start, cancel, conflicts, conflictAction, review } = {}) {
  const calls = { start: [], cancel: [], status: 0, conflicts: [], conflictAction: [], review: [] }
  fetchMock.mockImplementation(async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined
    if (url.startsWith('/api/admin/books/ocr/status')) {
      calls.status++
      return reply(200, status(calls.status))
    }
    if (url === '/api/admin/books/ocr/start') {
      calls.start.push(body)
      return start(body, calls.start.length)
    }
    if (url === '/api/admin/books/ocr/cancel') {
      calls.cancel.push(body)
      return cancel(body)
    }
    if (url.startsWith('/api/admin/books/ocr/conflicts/')) {
      calls.conflictAction.push({ url, body })
      return conflictAction(url, body)
    }
    if (url.startsWith('/api/admin/books/ocr/conflicts')) {
      calls.conflicts.push(url)
      return conflicts(url)
    }
    if (url === '/api/admin/books/ocr/result-conflicts') {
      calls.review.push(body)
      return review(body)
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  return calls
}

const renderDialog = (props = {}) => render(<BookOcrDialog book={book} onClose={vi.fn()} localRetryDelayMs={0} {...props} />)

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
  window.sessionStorage.clear()
})

describe('BookOcrDialog — ספק מחשב מקומי', () => {
  it('בחירת local ולחיצה שולחות method:local עם requestId ו-options; בלי splitColumns', async () => {
    const calls = mockApi({ start: () => reply(202, { success: true, jobId: 'j1', status: 'queued', totalPages: 10 }) })
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    // חיתוך לטורים אינו נתמך בעיבוד המקומי — מוסתר
    expect(screen.queryByText('חיתוך ל-2 טורים (ימין/שמאל)')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText(/מודרני/))
    await user.click(screen.getByLabelText('רש"י'))
    await user.click(screen.getByRole('button', { name: /שלח לתור 10 עמודים/ }))

    await waitFor(() => expect(calls.start).toHaveLength(1))
    const sent = calls.start[0]
    expect(sent).toMatchObject({
      bookId: book.id,
      method: 'local',
      existingTextMode: 'skip',
      options: { lm: 'modern', defaultScript: 'rashi' },
    })
    expect(sent.requestId).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(sent).not.toHaveProperty('splitColumns')
  })

  it('כשל רשת (כולל הניסיונות החוזרים) ולחיצה שוב — אותו requestId בכל הבקשות', async () => {
    let fail = true
    const calls = mockApi({
      start: () => {
        if (fail) throw new TypeError('Failed to fetch')
        return reply(202, { success: true, jobId: 'j1', status: 'queued', totalPages: 10 })
      },
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('לא תיווצר עבודה כפולה')
    // ניסיון ראשון + 6 ניסיונות חוזרים אוטומטיים
    expect(calls.start).toHaveLength(7)

    fail = false
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    await waitFor(() => expect(calls.start).toHaveLength(8))
    const ids = new Set(calls.start.map((b) => b.requestId))
    expect(ids.size).toBe(1)
  })

  it('שינוי הטיפול בעמודים ערוכים יוצר requestId חדש', async () => {
    const calls = mockApi({
      status: () => statusBody({ counts: { pagesWithImage: 10, editedPagesCount: 4 } }),
      start: () => reply(500, { error: 'הכנת קובץ הקלט נכשלה בשל תקלה זמנית. אפשר לנסות שוב', code: 'preparation_retry' }),
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('הכנת קובץ הקלט נכשלה')
    // 500 — אותו requestId נשמר ללחיצה חוזרת
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    await waitFor(() => expect(calls.start).toHaveLength(2))
    expect(calls.start[1].requestId).toBe(calls.start[0].requestId)

    await user.click(screen.getByLabelText(/דרוס אותם/))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    await waitFor(() => expect(calls.start).toHaveLength(3))
    expect(calls.start[2].existingTextMode).toBe('overwrite')
    expect(calls.start[2].requestId).not.toBe(calls.start[0].requestId)
  })

  it('202 עם status:failed אינו "התחיל" — הודעה, והטופס נשאר', async () => {
    mockApi({ start: () => reply(202, { success: true, jobId: 'j1', status: 'failed', totalPages: 0 }) })
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('כבר נכשלה ולא התחילה')
    expect(screen.getByRole('button', { name: /שלח לתור/ })).toBeInTheDocument()
  })

  it.each([
    [409, { error: 'כבר קיימת עבודת OCR פעילה לספר הזה', code: 'active_job' }, 'כבר קיימת עבודת OCR פעילה לספר הזה'],
    [413, { error: 'הספר גדול מדי', code: 'too_many_pages' }, 'הספר גדול מדי'],
    [422, { error: 'חסרות תמונות', code: 'missing_image', pageNumbers: [3, 4] }, 'חסרות תמונות (עמודים: 3, 4)'],
    [503, { error: 'ספק המחשב המקומי אינו מוגדר בשרת', code: 'local_not_configured' }, 'ספק המחשב המקומי אינו מוגדר בשרת'],
  ])('תשובה %i מוצגת בעברית', async (code, body, text) => {
    const calls = mockApi({ start: () => reply(code, body) })
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(calls.start).toHaveLength(1)
  })

  it('409 preparing — ניסיון חוזר אוטומטי עם אותו requestId עד 202', async () => {
    const calls = mockApi({
      start: (_b, n) => (n < 3
        ? reply(409, { error: 'הבקשה עדיין בהכנה, נסו שוב בעוד רגע', code: 'preparing' })
        : reply(202, { success: true, jobId: 'j1', status: 'queued', totalPages: 10 })),
      status: (n) => statusBody({ job: n > 1 ? localJob() : null }),
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    expect(await screen.findByText('ממתין למחשב המקומי')).toBeInTheDocument()
    expect(calls.start).toHaveLength(3)
    expect(new Set(calls.start.map((b) => b.requestId)).size).toBe(1)
  })

  it('סגירת הדיאלוג באמצע הניסיונות החוזרים — אין בקשות start נוספות, וה-requestId נשמר לפתיחה הבאה', async () => {
    const calls = mockApi({ start: () => reply(503, { error: 'השרת עמוס' }) })
    const user = userEvent.setup()
    const { unmount } = renderDialog({ localRetryDelayMs: 60000 })

    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    await waitFor(() => expect(calls.start).toHaveLength(1))
    expect(await screen.findByRole('status')).toHaveTextContent('מנסה שוב')
    const startInit = fetchMock.mock.calls.find(([url]) => url === '/api/admin/books/ocr/start')[1]
    expect(startInit.signal.aborted).toBe(false)
    unmount()
    // הסגירה מבטלת את הלולאה (ההמתנה של 60 שניות נקטעת) — לא נשלחת בקשה נוספת
    expect(startInit.signal.aborted).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.start).toHaveLength(1)

    // פתיחה מחדש (הדיאלוג נפתח על OCRWin) ובחירת "מחשב מקומי" — אותו requestId: ההכנה בשרת,
    // אם התחילה, נמשכת ולא נוצרת עבודה כפולה
    const firstId = calls.start[0].requestId
    const again = mockApi({ start: () => reply(202, { success: true, jobId: 'j1', status: 'queued', totalPages: 10 }) })
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    await waitFor(() => expect(again.start).toHaveLength(1))
    expect(again.start[0].requestId).toBe(firstId)
  })

  it('requestId שמור של בקשה שהגיעה לשרת (עבודת local פעילה) — נמחק, וההתחלה אחרי הסיום חדשה', async () => {
    const calls = mockApi({ start: () => { throw new TypeError('Failed to fetch') } })
    const user = userEvent.setup()
    const first = renderDialog()
    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('לא תיווצר עבודה כפולה')
    const staleId = calls.start[0].requestId
    first.unmount()

    // פתיחה מחדש: הבקשה בכל זאת נקלטה בשרת והעבודה פעילה
    mockApi({ status: () => statusBody({ job: localJob({ status: 'queued' }) }) })
    const second = renderDialog()
    expect(await screen.findByText('ממתין למחשב המקומי')).toBeInTheDocument()
    second.unmount()

    // אחרי שהעבודה הסתיימה — התחלה חדשה עם requestId חדש (לא "העבודה של הבקשה הזו כבר הסתיימה")
    const later = mockApi({
      status: () => statusBody({ job: localJob({ status: 'completed', summary: { applied: 10, failed: 0, conflicts: 0, missing: 0 } }) }),
      start: () => reply(202, { success: true, jobId: 'j2', status: 'queued', totalPages: 10 }),
    })
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))
    await waitFor(() => expect(later.start).toHaveLength(1))
    expect(later.start[0].requestId).not.toBe(staleId)
  })

  it('ספק local מושבת כשאינו מוגדר בשרת', async () => {
    mockApi({ status: () => statusBody({ worker: { configured: false, lastSeenAt: null, availability: 'never' } }) })
    renderDialog()
    const btn = await screen.findByRole('button', { name: /מחשב מקומי/ })
    expect(btn).toBeDisabled()
    expect(within(btn).getByText('לא מוגדר בשרת')).toBeInTheDocument()
  })
})

describe('BookOcrDialog — מצבי עבודה מקומית', () => {
  it('queued עם מחשב לא זמין — הודעת אי-הזמינות (תצוגה בלבד), בלי שום ביטול', async () => {
    const calls = mockApi({
      status: () => statusBody({
        job: localJob({ status: 'queued' }),
        worker: { configured: true, lastSeenAt: new Date(Date.now() - 30 * 60_000).toISOString(), availability: 'offline' },
      }),
    })
    renderDialog()
    expect(await screen.findByText('ממתין למחשב המקומי')).toBeInTheDocument()
    expect(screen.getByText(/המחשב המעבד לא זמין \(נראה לאחרונה: לפני 30 דקות\)/)).toBeInTheDocument()
    expect(screen.getByText(/העבודה שמורה בתור ותמשיך כשיחזור/)).toBeInTheDocument()
    expect(calls.cancel).toHaveLength(0)
  })

  it('מחשב שמעולם לא התחבר — גם כן לא זמין', async () => {
    mockApi({ status: () => statusBody({ job: localJob(), worker: { configured: true, lastSeenAt: null, availability: 'never' } }) })
    renderDialog()
    expect(await screen.findByText(/המחשב המעבד לא זמין \(נראה לאחרונה: מעולם לא התחבר\)/)).toBeInTheDocument()
  })

  it('running — פס התקדמות לפי pagesDone/pagesTotal', async () => {
    mockApi({ status: () => statusBody({ job: localJob({ status: 'running', progress: { phase: 'ocr', pagesDone: 3, pagesTotal: 12 } }) }) })
    renderDialog()
    expect(await screen.findByText('בעיבוד')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText('3 מתוך 12 עמודים')).toBeInTheDocument()
    expect(screen.queryByText(/המחשב המעבד לא זמין/)).not.toBeInTheDocument()
  })

  it.each([
    ['preparing', 'מכין קובץ לעיבוד'],
    ['pausing', 'בהשהיה'],
    ['paused_runner', 'מושהה — GitHub Runner פעיל'],
    ['delivery_pending', 'העיבוד הסתיים — ממתין למסירה'],
    ['applying', 'קולט תוצאות לעמודים'],
  ])('מצב %s מוצג כ"%s"', async (status, label) => {
    mockApi({ status: () => statusBody({ job: localJob({ status }) }) })
    renderDialog()
    expect(await screen.findByText(label)).toBeInTheDocument()
  })

  it('needs_attention — workerMessage כטקסט רגיל בלבד (לא HTML)', async () => {
    const msg = 'חסר קובץ מודל <b>tess</b> <img src=x onerror=alert(1)>'
    mockApi({ status: () => statusBody({ job: localJob({ status: 'needs_attention', workerMessage: msg }) }) })
    const { container } = renderDialog()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('דורש טיפול במחשב המעבד')
    expect(alert).toHaveTextContent(msg)
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('ביטול שמקבל 409 apply_started מציג "הקליטה כבר החלה"', async () => {
    const calls = mockApi({
      status: () => statusBody({ job: localJob({ status: 'delivery_pending' }) }),
      cancel: () => reply(409, { error: 'הקליטה כבר החלה — לא ניתן לבטל', code: 'apply_started' }),
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: 'ביטול העבודה' }))
    await user.click(screen.getByRole('button', { name: 'כן, לבטל' }))
    expect(await screen.findByText('הקליטה כבר החלה — לא ניתן לבטל')).toBeInTheDocument()
    expect(calls.cancel).toEqual([{ jobId: '507f1f77bcf86cd799439022' }])
  })

  it('ביטול מוצלח — לפי מזהה העבודה, ו"בוטל" מוצג לפי status', async () => {
    let cancelled = false
    const calls = mockApi({
      status: () => statusBody({
        job: cancelled
          ? localJob({ status: 'cancelled', cancelReason: 'admin', cancelledByName: 'מנהל א' })
          : localJob({ status: 'running', cancelReason: 'admin' }),
      }),
      cancel: () => {
        cancelled = true
        return reply(200, { success: true })
      },
    })
    const user = userEvent.setup()
    renderDialog()
    // cancelReason לבדו (בלי status) אינו "בוטל"
    expect(await screen.findByText('בעיבוד')).toBeInTheDocument()
    expect(screen.queryByText('בוטל')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ביטול העבודה' }))
    await user.click(screen.getByRole('button', { name: 'כן, לבטל' }))
    expect(await screen.findByText('בוטל')).toBeInTheDocument()
    expect(screen.getByText('בוטלה בידי מנהל א.')).toBeInTheDocument()
    expect(calls.cancel).toHaveLength(1)
  })

  it('applying — כפתור הביטול מנוטרל', async () => {
    mockApi({ status: () => statusBody({ job: localJob({ status: 'applying', decision: 'apply' }) }) })
    renderDialog()
    expect(await screen.findByRole('button', { name: 'ביטול העבודה' })).toBeDisabled()
  })

  it('failed עם errorCode no_pages_succeeded — הודעת הכשל', async () => {
    mockApi({
      status: () => statusBody({
        job: localJob({ status: 'failed', errorCode: 'no_pages_succeeded', error: '', summary: { applied: 0, failed: 3, conflicts: 0, missing: 0 } }),
      }),
    })
    renderDialog()
    expect(await screen.findByText(/העבודה נכשלה: אף עמוד לא נקלט/)).toBeInTheDocument()
    expect(screen.getByText('נכשלו: 3')).toBeInTheDocument()
  })

  it('completed עם התנגשויות — סיכום ופאנל ההתנגשויות', async () => {
    const calls = mockApi({
      status: () => statusBody({
        job: localJob({ status: 'completed', resultOutcome: 'success', summary: { applied: 7, failed: 0, conflicts: 1, missing: 2 } }),
        conflictsOpen: 1,
      }),
      conflicts: () => reply(200, {
        success: true,
        total: 1,
        openCount: 1,
        hasMore: false,
        conflicts: [{ id: 'c1', pageNumber: 4, status: 'open', ocrText: 'OCR', pageContent: 'אנושי', pageExists: true, pageUpdatedAt: '2026-10-20T10:00:00.000Z' }],
      }),
    })
    renderDialog()
    expect(await screen.findByText('הוחלו: 7')).toBeInTheDocument()
    expect(screen.getByText('עמודים שנמחקו: 2')).toBeInTheDocument()
    expect(await screen.findByText('עמוד 4')).toBeInTheDocument()
    // הפאנל ברמת הספר — ההתנגשויות הפתוחות מכל העבודות, לא רק של האחרונה
    expect(calls.conflicts[0]).toContain(`bookId=${book.id}&status=open`)
  })

  it('תוצאה מתנגשת — "סמן כנבדק" שולח את ה-sha', async () => {
    const sha = 'a'.repeat(64)
    const calls = mockApi({
      status: () => statusBody({
        job: localJob({ status: 'completed', resultConflicts: [{ sha256: sha, receivedAt: '2026-10-20T10:00:00.000Z', bytes: 2048, reviewedAt: null }] }),
      }),
      review: () => reply(200, { success: true, sha256: sha, reviewedAt: '2026-10-20T11:00:00.000Z' }),
    })
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: 'סמן כנבדק' }))
    expect(await screen.findByText('נבדק')).toBeInTheDocument()
    expect(calls.review).toEqual([{ jobId: '507f1f77bcf86cd799439022', sha256: sha }])
  })

  it('תוצאה שנדחתה מוצגת עם הסיבה', async () => {
    mockApi({
      status: () => statusBody({
        job: localJob({ status: 'delivery_pending', resultRejections: [{ sha256: 'b'.repeat(64), receivedAt: '2026-10-20T10:00:00.000Z', bytes: 10, reason: 'validation_failed', details: 'pages[0]: missing text' }] }),
      }),
    })
    renderDialog()
    expect(await screen.findByText('התוצאה לא עברה בדיקת תקינות')).toBeInTheDocument()
    expect(screen.getByText('pages[0]: missing text')).toBeInTheDocument()
  })
})

// רגרסיה לסקירה W03: עבודה חדשה לא מסתירה התנגשויות ותוצאות מתנגשות של עבודות local קודמות
describe('BookOcrDialog — התנגשויות ברמת הספר', () => {
  const OLD_JOB = '64b7f0c2a1b2c3d4e5f6000a'
  const oldConflictList = () => reply(200, {
    success: true,
    total: 1,
    openCount: 1,
    hasMore: false,
    conflicts: [{
      id: 'c-old', jobId: OLD_JOB, jobCreatedAt: '2026-10-01T08:00:00.000Z', pageNumber: 3, status: 'open',
      ocrText: 'OCR', pageContent: 'אנושי', pageExists: true, pageUpdatedAt: '2026-10-20T10:00:00.000Z',
    }],
  })

  it('עבודה מקומית עם התנגשות פתוחה ואחריה עבודת OCRWin — הפאנל עדיין מציג אותה, עם העבודה המקורית', async () => {
    const calls = mockApi({
      status: () => statusBody({
        job: { id: 'j-ocrwin', method: 'ocrwin', status: 'completed', totalPages: 4, processedPages: 4, successPages: 4, failedPages: 0 },
        conflictsOpen: 0,
        bookConflictsOpen: 1,
      }),
      conflicts: oldConflictList,
    })
    renderDialog()
    expect(await screen.findByText(/העבודה האחרונה הסתיימה/)).toBeInTheDocument()
    expect(await screen.findByText('עמוד 3')).toBeInTheDocument()
    expect(screen.getByText(/1 ממתינות/)).toBeInTheDocument()
    expect(screen.getByText('#f6000a')).toBeInTheDocument()
    expect(calls.conflicts[0]).toContain(`bookId=${book.id}&status=open`)
  })

  it('עבודה מקומית חדשה בלי התנגשויות משלה — ההתנגשויות הקודמות בספר עדיין מוצגות', async () => {
    const calls = mockApi({
      status: () => statusBody({
        job: localJob({ status: 'completed', resultOutcome: 'success', summary: { applied: 10, failed: 0, conflicts: 0, missing: 0 } }),
        conflictsOpen: 0,
        bookConflictsOpen: 1,
      }),
      conflicts: oldConflictList,
    })
    renderDialog()
    expect(await screen.findByText('עמוד 3')).toBeInTheDocument()
    expect(calls.conflicts).toHaveLength(1)
  })

  it('בלי התנגשויות פתוחות בספר ובלי התנגשויות בעבודה האחרונה — אין פאנל', async () => {
    const calls = mockApi({
      status: () => statusBody({ job: { id: 'j-ocrwin', method: 'ocrwin', status: 'completed', totalPages: 4, processedPages: 4, successPages: 4, failedPages: 0 } }),
    })
    renderDialog()
    expect(await screen.findByText(/העבודה האחרונה הסתיימה/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'התנגשויות בקליטה' })).not.toBeInTheDocument()
    expect(calls.conflicts).toHaveLength(0)
  })

  it('תוצאה מתנגשת שלא נבדקה מעבודה קודמת — מוצגת עם העבודה, ו"סמן כנבדק" שולח את מזהה העבודה הקודמת', async () => {
    const sha = 'd'.repeat(64)
    let reviewed = false
    const calls = mockApi({
      status: () => statusBody({
        job: { id: 'j-ocrwin', method: 'ocrwin', status: 'completed', totalPages: 4, processedPages: 4, successPages: 4, failedPages: 0 },
        olderResultConflicts: reviewed ? [] : [{ jobId: OLD_JOB, jobCreatedAt: '2026-10-01T08:00:00.000Z', sha256: sha, receivedAt: '2026-10-01T09:00:00.000Z', bytes: 2048, reviewedAt: null }],
      }),
      review: () => {
        reviewed = true
        return reply(200, { success: true, sha256: sha, reviewedAt: '2026-10-20T11:00:00.000Z' })
      },
    })
    const user = userEvent.setup()
    renderDialog()
    const section = await screen.findByRole('region', { name: 'תוצאות מתנגשות מעבודות קודמות' })
    expect(within(section).getByText('#f6000a')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'סמן כנבדק' }))
    expect(calls.review).toEqual([{ jobId: OLD_JOB, sha256: sha }])
    // אחרי הרענון התוצאה כבר לא ממתינה — הרשימה נעלמת
    await waitFor(() => expect(screen.queryByRole('region', { name: 'תוצאות מתנגשות מעבודות קודמות' })).not.toBeInTheDocument())
  })
})

describe('BookOcrDialog — Gemini/OCRWin ללא שינוי', () => {
  it('OCRWin: גוף הבקשה הקיים, בלי requestId', async () => {
    const calls = mockApi({ start: () => reply(200, { success: true, jobId: 'j', totalPages: 10 }) })
    const user = userEvent.setup()
    renderDialog()
    await user.click(await screen.findByRole('button', { name: /התחל OCR ל-10 עמודים/ }))
    await waitFor(() => expect(calls.start).toHaveLength(1))
    expect(calls.start[0]).toEqual({ bookId: book.id, method: 'ocrwin', model: 'gemini-2.5-pro', existingTextMode: 'skip', splitColumns: false })
  })

  it('עבודת OCRWin רצה — תצוגת ההתקדמות הקיימת ועצירה לפי bookId', async () => {
    const calls = mockApi({
      status: () => statusBody({ job: { id: 'j', method: 'ocrwin', status: 'running', totalPages: 4, processedPages: 1, successPages: 1, failedPages: 0, currentPageNumber: 2 } }),
      cancel: () => reply(200, { success: true }),
    })
    const user = userEvent.setup()
    renderDialog()
    expect(await screen.findByText(/1 מתוך 4 עמודים/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /עצור את העבודה/ }))
    await waitFor(() => expect(calls.cancel).toEqual([{ bookId: book.id }]))
  })
})

describe('BookOcrDialog — המשך הכנה של עבודת local שנתקעה', () => {
  const prepJob = (overrides = {}) =>
    localJob({
      status: 'preparing',
      totalPages: 0,
      existingTextMode: 'skip',
      options: { lm: 'rabbinic', defaultScript: 'square' },
      requestId: 'server-req-1234',
      preparingStale: true,
      ...overrides,
    })

  it('אחרי 500 preparation_retry — "המשך הכנה" מוצג (ולא כפתור ההתחלה) ושולח את אותו requestId', async () => {
    let started = false
    let sentRequestId = null
    const calls = mockApi({
      status: () => {
        if (!sentRequestId) return statusBody()
        if (started) return statusBody({ job: localJob({ status: 'queued' }) })
        // השרת השאיר את העבודה ב-preparing; ה-lease שוחרר (preparation_retry)
        return statusBody({ job: prepJob({ requestId: sentRequestId }) })
      },
      start: (body, n) => {
        sentRequestId = body.requestId
        if (n === 1) {
          return reply(500, { error: 'הכנת קובץ הקלט נכשלה בשל תקלה זמנית. אפשר לנסות שוב', code: 'preparation_retry', jobId: 'j1' })
        }
        started = true
        return reply(202, { success: true, jobId: 'j1', status: 'queued', totalPages: 10 })
      },
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: /מחשב מקומי/ }))
    await user.click(screen.getByRole('button', { name: /שלח לתור/ }))

    const resume = await screen.findByRole('button', { name: /המשך הכנה/ })
    expect(screen.getByRole('alert')).toHaveTextContent('תקלה זמנית')
    expect(screen.queryByRole('button', { name: /שלח לתור/ })).not.toBeInTheDocument()

    await user.click(resume)
    await waitFor(() => expect(calls.start).toHaveLength(2))
    expect(calls.start[1]).toEqual({
      bookId: book.id,
      method: 'local',
      requestId: calls.start[0].requestId,
      existingTextMode: 'skip',
      options: { lm: 'rabbinic', defaultScript: 'square' },
    })
    expect(await screen.findByText('ממתין למחשב המקומי')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /המשך הכנה/ })).not.toBeInTheDocument()
  })

  it('המזהה השמור אבד (פתיחה מחדש) — ההמשך משתמש ב-requestId ובפרמטרים שהשרת מחזיר', async () => {
    const calls = mockApi({
      status: () => statusBody({ job: prepJob({ existingTextMode: 'overwrite', options: { lm: 'off', defaultScript: 'rashi' } }) }),
      start: () => reply(409, { error: 'הבקשה עדיין בהכנה, נסו שוב בעוד רגע', code: 'preparing', jobId: 'j1' }),
    })
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: /המשך הכנה/ }))
    // 409 preparing (בקשה אחרת מחזיקה את ה-lease) — ניסיונות חוזרים, תמיד אותה בקשה
    expect(await screen.findByRole('alert')).toHaveTextContent('לא תיווצר עבודה כפולה')
    expect(calls.start).toHaveLength(7)
    for (const sent of calls.start) {
      expect(sent).toEqual({
        bookId: book.id,
        method: 'local',
        requestId: 'server-req-1234',
        existingTextMode: 'overwrite',
        options: { lm: 'off', defaultScript: 'rashi' },
      })
    }
  })

  it('הכנה פעילה (lease בתוקף) — אין "המשך הכנה"', async () => {
    mockApi({ status: () => statusBody({ job: prepJob({ preparingStale: false }) }) })
    renderDialog()
    expect(await screen.findByText('מכין קובץ לעיבוד')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /המשך הכנה/ })).not.toBeInTheDocument()
  })
})
