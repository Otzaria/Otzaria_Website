import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OcrConflictsPanel from './OcrConflictsPanel'

const fetchMock = vi.fn()
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

const UPDATED = '2026-10-20T10:00:00.000Z'
const conflict = (over = {}) => ({
  id: 'c1',
  pageNumber: 4,
  status: 'open',
  ocrText: 'טקסט מה-OCR',
  pageContent: 'טקסט שנערך בידי אדם',
  pageExists: true,
  pageIsTwoColumns: false,
  pageUpdatedAt: UPDATED,
  ...over,
})

function listBody(conflicts, extra = {}) {
  return { success: true, total: conflicts.length, openCount: conflicts.filter((c) => c.status === 'open').length, hasMore: false, conflicts, ...extra }
}

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
})

describe('OcrConflictsPanel', () => {
  it('uses the server cursor so a concurrent resolution cannot shift the next page away', async () => {
    const cursor = JSON.stringify({ pageNumber: 50, id: '507f1f77bcf86cd799439050' })
    const server = Array.from({ length: 51 }, (_, i) => conflict({ id: `c${i + 1}`, pageNumber: i + 1 }))
    fetchMock.mockImplementation(async (url) => {
      const qs = new URL(url, 'http://localhost').searchParams
      const after = qs.get('after') ? JSON.parse(qs.get('after')).pageNumber : 0
      const matches = server.filter((c) => c.status === 'open' && c.pageNumber > after)
      return reply(200, listBody(structuredClone(matches.slice(0, 50)), {
        hasMore: matches.length > 50, nextCursor: cursor,
      }))
    })
    render(<OcrConflictsPanel bookId="book1" />)
    const more = await screen.findByRole('button', { name: 'טען עוד' })
    server[0].status = 'dismissed' // another administrator resolves an already-loaded row
    await userEvent.setup().click(more)
    expect(await screen.findByText('עמוד 51')).toBeInTheDocument()
    expect(new URL(fetchMock.mock.calls[1][0], 'http://localhost').searchParams.get('after')).toBe(cursor)
  })

  it('אימוץ בתהליך (applying) — תווית מצב ובלי כפתורי החלטה', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, listBody([conflict({ status: 'applying' })], { openCount: 1 })))
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" />)
    expect(await screen.findByText('אימוץ ה-OCR בתהליך')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'הצג טקסטים' }))
    expect(screen.queryByRole('button', { name: 'שמור את הטקסט הקיים' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'אמץ את טקסט ה-OCR' })).toBeNull()
  })

  it('מציג את הרשימה ואת שני הטקסטים כטקסט רגיל', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, listBody([conflict(), conflict({ id: 'c2', pageNumber: 9, status: 'dismissed', ocrText: '<i>x</i>' })])))
    const user = userEvent.setup()
    const { container } = render(<OcrConflictsPanel jobId="job1" />)

    expect(await screen.findByText('עמוד 4')).toBeInTheDocument()
    expect(screen.getByText('עמוד 9')).toBeInTheDocument()
    expect(screen.getByText(/1 ממתינות מתוך 2/)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/books/ocr/conflicts?jobId=job1&limit=50&offset=0')

    const [first, second] = screen.getAllByRole('button', { name: 'הצג טקסטים' })
    await user.click(first)
    expect(screen.getByText('טקסט שנערך בידי אדם')).toBeInTheDocument()
    expect(screen.getByText('טקסט מה-OCR')).toBeInTheDocument()
    await user.click(second)
    expect(screen.getByText('<i>x</i>')).toBeInTheDocument()
    expect(container.querySelector('i')).toBeNull()
  })

  it('"שמור את הטקסט הקיים" קורא ל-API עם dismiss', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict()])))
      .mockResolvedValueOnce(reply(200, { success: true, conflict: conflict({ status: 'dismissed', resolvedByName: 'מנהל' }) }))
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" onChanged={onChanged} />)

    await user.click(await screen.findByRole('button', { name: 'הצג טקסטים' }))
    await user.click(screen.getByRole('button', { name: 'שמור את הטקסט הקיים' }))

    expect(await screen.findByText('נשמר הטקסט הקיים')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/admin/books/ocr/conflicts/c1')
    expect(JSON.parse(init.body)).toEqual({ action: 'dismiss' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('אימוץ OCR — רק אחרי אישור, ועם updatedAt של העמוד כפי שהוצג', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict()])))
      .mockResolvedValueOnce(reply(200, { success: true, conflict: conflict({ status: 'applied' }) }))
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" />)

    await user.click(await screen.findByRole('button', { name: 'הצג טקסטים' }))
    await user.click(screen.getByRole('button', { name: 'אמץ את טקסט ה-OCR' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('הטקסט הנוכחי בעמוד יוחלף בטקסט ה-OCR. להמשיך?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'כן, לאמץ את ה-OCR' }))

    expect(await screen.findByText('אומץ טקסט ה-OCR')).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ action: 'apply', expectedPageUpdatedAt: UPDATED })
  })

  it('409 (העמוד השתנה שוב) — הודעה וטעינה מחדש', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict()])))
      .mockResolvedValueOnce(reply(409, { error: 'העמוד השתנה שוב — רעננו', code: 'page_changed' }))
      .mockResolvedValueOnce(reply(200, listBody([conflict({ pageContent: 'עריכה חדשה', pageUpdatedAt: '2026-10-20T11:00:00.000Z' })])))
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" />)

    await user.click(await screen.findByRole('button', { name: 'הצג טקסטים' }))
    await user.click(screen.getByRole('button', { name: 'אמץ את טקסט ה-OCR' }))
    await user.click(screen.getByRole('button', { name: 'כן, לאמץ את ה-OCR' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('העמוד השתנה שוב — רעננו')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(screen.getByText('עריכה חדשה')).toBeInTheDocument()
  })

  it('עמוד שנמחק — אין אימוץ, רק שמירת הקיים', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, listBody([conflict({ pageExists: false, pageUpdatedAt: null, pageContent: '' })])))
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" />)
    await user.click(await screen.findByRole('button', { name: 'הצג טקסטים' }))
    expect(screen.getByText(/העמוד נמחק מהספר/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'אמץ את טקסט ה-OCR' })).not.toBeInTheDocument()
  })

  it('דפדוף — "טען עוד" מבקש את ההמשך', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict()], { total: 2, hasMore: true })))
      .mockResolvedValueOnce(reply(200, listBody([conflict({ id: 'c2', pageNumber: 8 })], { total: 2, hasMore: false })))
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" />)
    await user.click(await screen.findByRole('button', { name: 'טען עוד' }))
    expect(await screen.findByText('עמוד 8')).toBeInTheDocument()
    expect(fetchMock.mock.calls[1][0]).toContain('offset=1')
    expect(screen.queryByRole('button', { name: 'טען עוד' })).not.toBeInTheDocument()
  })

  it('ברמת הספר: רק פתוחות, עם העבודה המקורית; "טען עוד" מדלג רק על הפתוחות שנטענו', async () => {
    const fromJob = { jobId: '64b7f0c2a1b2c3d4e5f6000a', jobCreatedAt: '2026-10-01T08:00:00.000Z' }
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict(fromJob), conflict({ ...fromJob, id: 'c2', pageNumber: 6 })], { total: 3, hasMore: true })))
      .mockResolvedValueOnce(reply(200, { success: true, conflict: conflict({ ...fromJob, jobCreatedAt: null, status: 'dismissed' }) }))
      .mockResolvedValueOnce(reply(200, listBody([conflict({ id: 'c3', pageNumber: 8 })], { total: 2, hasMore: false })))
    const user = userEvent.setup()
    render(<OcrConflictsPanel bookId="book1" />)

    expect(await screen.findByText('עמוד 4')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/books/ocr/conflicts?bookId=book1&status=open&limit=50&offset=0')
    expect(screen.getByText(/התנגשויות בקליטה בספר \(2 ממתינות\)/)).toBeInTheDocument()
    expect(screen.getAllByText('#f6000a')).toHaveLength(2)

    // טיפול באחת — היא יוצאת מהרשימה המסוננת בשרת, ולכן ההמשך מתחיל אחרי הפתוחה שנותרה
    await user.click(screen.getAllByRole('button', { name: 'הצג טקסטים' })[0])
    await user.click(screen.getByRole('button', { name: 'שמור את הטקסט הקיים' }))
    expect(await screen.findByText('נשמר הטקסט הקיים')).toBeInTheDocument()
    // תאריך העבודה נשמר גם אחרי שהפריט הוחלף בתשובת הפעולה
    expect(screen.getAllByText(/מ-/)).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'טען עוד' }))
    expect(await screen.findByText('עמוד 8')).toBeInTheDocument()
    expect(fetchMock.mock.calls[2][0]).toContain('bookId=book1&status=open&limit=50&offset=1')
  })

  it('שגיאת טעינה מוצגת', async () => {
    fetchMock.mockResolvedValueOnce(reply(403, { error: 'אין הרשאה לבצע פעולה זו' }))
    render(<OcrConflictsPanel jobId="job1" />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('אין הרשאה לבצע פעולה זו')).toBeInTheDocument()
  })
  it('שגיאת טעינה ואז טעינה מחדש מוצלחת (אחרי 409) — ההודעה נעלמת', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict()])))
      .mockResolvedValueOnce(reply(409, { error: 'העמוד השתנה שוב — רעננו' }))
      .mockResolvedValueOnce(reply(500, { error: 'שגיאת שרת' }))
      .mockResolvedValueOnce(reply(200, { success: true, conflict: conflict({ status: 'dismissed' }) }))
    const user = userEvent.setup()
    render(<OcrConflictsPanel jobId="job1" />)
    await user.click(await screen.findByRole('button', { name: 'הצג טקסטים' }))
    await user.click(screen.getByRole('button', { name: 'שמור את הטקסט הקיים' }))
    // טעינה מחדש נכשלה — הודעת שגיאת הרשימה מוצגת והרשימה הקודמת נשארת
    expect(await screen.findByText('שגיאת שרת')).toBeInTheDocument()
    expect(screen.getByText('עמוד 4')).toBeInTheDocument()
    // טעינה מחדש נוספת (409 שני) שמצליחה מנקה את הודעת השגיאה
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(reply(409, { error: 'טופלה בידי אחר' }))
      .mockResolvedValueOnce(reply(200, listBody([conflict({ pageNumber: 5 })])))
    await user.click(screen.getByRole('button', { name: 'שמור את הטקסט הקיים' }))
    expect(await screen.findByText('עמוד 5')).toBeInTheDocument()
    expect(screen.queryByText('שגיאת שרת')).toBeNull()
  })

  it('החלפת ספר — הרשימה של הספר הקודם לא מוצגת בזמן הטעינה, ותשובה מאוחרת שלו נזרקת', async () => {
    const book1 = deferred()
    const book2 = deferred()
    fetchMock.mockImplementation((url) => (url.includes('bookId=book1') ? book1.promise : book2.promise))
    const { rerender } = render(<OcrConflictsPanel bookId="book1" />)
    rerender(<OcrConflictsPanel bookId="book2" />)
    await act(async () => { book2.resolve(reply(200, listBody([conflict({ id: 'b2', pageNumber: 22 })]))) })
    expect(await screen.findByText('עמוד 22')).toBeInTheDocument()
    // התשובה של הספר הקודם מגיעה באיחור — לא דורסת את הרשימה של הספר הנוכחי
    await act(async () => { book1.resolve(reply(200, listBody([conflict({ id: 'b1', pageNumber: 11 })]))) })
    expect(screen.queryByText('עמוד 11')).toBeNull()
    expect(screen.getByText('עמוד 22')).toBeInTheDocument()
  })

  it('החלפת ספר אחרי טעינה — מוצג טוען ולא הרשימה (או השגיאה) של הספר הקודם', async () => {
    const book2 = deferred()
    fetchMock
      .mockResolvedValueOnce(reply(200, listBody([conflict({ pageNumber: 11 })])))
      .mockReturnValueOnce(book2.promise)
    const { rerender, container } = render(<OcrConflictsPanel bookId="book1" />)
    expect(await screen.findByText('עמוד 11')).toBeInTheDocument()
    rerender(<OcrConflictsPanel bookId="book2" />)
    expect(screen.queryByText('עמוד 11')).toBeNull()
    expect(screen.queryByText(/ממתינות/)).toBeNull()
    expect(container.querySelector('ul')).toBeNull()
    await act(async () => { book2.resolve(reply(200, listBody([conflict({ id: 'b2', pageNumber: 22 })]))) })
    expect(await screen.findByText('עמוד 22')).toBeInTheDocument()
    expect(fetchMock.mock.calls[1][0]).toContain('bookId=book2')
  })

  it('פירוק הרכיב לפני שהטעינה הסתיימה — בלי עדכון state ובלי שגיאות', async () => {
    const pending = deferred()
    fetchMock.mockReturnValueOnce(pending.promise)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render(<OcrConflictsPanel jobId="job1" />)
    unmount()
    await act(async () => { pending.resolve(reply(200, listBody([conflict()]))) })
    expect(errSpy).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
