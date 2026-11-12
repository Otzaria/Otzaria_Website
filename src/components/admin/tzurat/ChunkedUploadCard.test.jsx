import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import ChunkedUploadCard from './ChunkedUploadCard'
import { makeUploadServer } from './testFixtures'
import { RESUME_STORE, rememberResume, resumeKey } from './uploadPlan'

// כרטיס ההעלאה: בחירת קובץ, שליחה בחלקים עם פס התקדמות, סיום ומעקב העיבוד עד הסיכום;
// "המשך העלאה" לקובץ שנבחר שוב אחרי רענון; "נסה שוב" לעיבוד שנכשל.

const zip = (size = 25, name = 'berakhot.zip') => new File([new Uint8Array(size)], name, { type: 'application/zip', lastModified: 1234 })
const sleep = async () => {}

function start(files, server, props = {}) {
  vi.stubGlobal('fetch', vi.fn(server.handler))
  const onChanged = vi.fn()
  render(<ChunkedUploadCard onChanged={onChanged} sleep={sleep} pollEvery={0} {...props} />)
  fireEvent.change(screen.getByLabelText('קובצי ZIP של צורת הדף'), { target: { files } })
  return { onChanged }
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ChunkedUploadCard', () => {
  it('מעלה בחלקים, מסיים, ועוקב אחרי העיבוד עד הסיכום', async () => {
    const server = makeUploadServer({
      after: [
        { status: 'processing', progress: { pages: 3, items: 10, images: 6 } },
        { status: 'done', progress: { pages: 125, items: 400, images: 250 }, summary: { masechet: 'ברכות', pages: 125 }, errors: ['שורה 7: dafKey לא תקין'] },
      ],
    })
    const { onChanged } = start([zip(25)], server)
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    const summary = await screen.findByTestId('upload-summary')
    expect(summary.textContent).toContain('ברכות')
    expect(summary.textContent).toContain('עמודים: 125')
    expect(screen.getByTestId('upload-errors').textContent).toContain('שורה 7')
    expect(server.puts.map((p) => p.size)).toEqual([10, 10, 5])
    expect(server.calls).toContain('POST /api/admin/tzurat-hadaf/uploads/u1/complete')
    const bar = screen.getByRole('progressbar', { name: 'התקדמות berakhot.zip' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(onChanged).toHaveBeenCalled()
  })

  it('קובץ שנבחר שוב אחרי רענון — מוצע "המשך העלאה", ונשלחים רק החלקים החסרים', async () => {
    const f = zip(25)
    rememberResume(f, 'old1')
    const server = makeUploadServer({
      existing: { old1: { id: 'old1', name: f.name, size: 25, chunkSize: 10, chunks: 3, received: [0, 1], status: 'uploading' } },
      after: [{ status: 'done', summary: { pages: 2 } }],
    })
    start([f], server)
    const resume = screen.getByRole('checkbox', { name: /המשך העלאה/ })
    expect(resume).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    await screen.findByTestId('upload-summary')
    expect(server.puts.map((p) => p.n)).toEqual([2])
    expect(server.calls.some((c) => c === 'POST /api/admin/tzurat-hadaf/uploads')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(RESUME_STORE))[resumeKey(f)]).toBeUndefined()
  })

  it('בלי "המשך העלאה" (ביטול הסימון) — העלאה חדשה מההתחלה', async () => {
    const f = zip(25)
    rememberResume(f, 'old1')
    const server = makeUploadServer({
      existing: { old1: { id: 'old1', name: f.name, size: 25, chunkSize: 10, chunks: 3, received: [0, 1], status: 'uploading' } },
      after: [{ status: 'done', summary: { pages: 2 } }],
    })
    start([f], server)
    fireEvent.click(screen.getByRole('checkbox', { name: /המשך העלאה/ }))
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    await screen.findByTestId('upload-summary')
    expect(server.puts.map((p) => p.n)).toEqual([0, 1, 2])
  })

  it('חלק שלא הגיע אחרי 3 ניסיונות — הודעה וכפתור "המשך העלאה" ששולח רק אותו', async () => {
    const server = makeUploadServer({ failures: { 1: 3 }, after: [{ status: 'done', summary: { pages: 1 } }] })
    start([zip(25)], server)
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    const alert = await screen.findByText(/חלקים לא הגיעו לשרת/)
    expect(alert.textContent).toContain('1 חלקים')
    expect(server.puts.map((p) => p.n)).toEqual([0, 2])
    fireEvent.click(screen.getByRole('button', { name: 'המשך העלאה' }))
    await screen.findByTestId('upload-summary')
    expect(server.puts.map((p) => p.n)).toEqual([0, 2, 1])
  })

  it('עיבוד שנכשל — "נסה שוב" שולח retry וממשיך לעקוב', async () => {
    const server = makeUploadServer({
      after: [
        { status: 'failed', errors: ['manifest.json חסר'] },
        { status: 'done', errors: [], summary: { pages: 9 } },
      ],
    })
    start([zip(5)], server)
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    const entry = await screen.findByTestId('upload-entry')
    await within(entry).findByText('manifest.json חסר')
    // לחיצה כפולה — בקשת retry אחת בלבד
    const again = within(entry).getByRole('button', { name: /נסה שוב/ })
    fireEvent.click(again)
    fireEvent.click(again)
    await waitFor(() => expect(within(entry).getByTestId('upload-summary').textContent).toContain('עמודים: 9'))
    expect(server.calls.filter((c) => c === 'POST /api/admin/tzurat-hadaf/uploads/u1/retry')).toHaveLength(1)
  })

  it('קלט הקובץ הנסתר מחוץ לסדר ה-Tab; "העלה" כבוי בלי disabled (הפוקוס לא נזרק)', async () => {
    const server = makeUploadServer({ after: [{ status: 'done' }] })
    vi.stubGlobal('fetch', vi.fn(server.handler))
    render(<ChunkedUploadCard sleep={sleep} pollEvery={0} />)
    const input = screen.getByLabelText('קובצי ZIP של צורת הדף')
    expect(input).toHaveAttribute('tabindex', '-1')
    expect(input).toHaveAttribute('aria-hidden', 'true')
    const upload = screen.getByRole('button', { name: 'העלה' })
    expect(upload).toHaveAttribute('aria-disabled', 'true')
    expect(upload).not.toBeDisabled()
  })

  it('כמה קבצים — התקדמות כוללת', async () => {
    const server = makeUploadServer({ after: [{ status: 'done' }, { status: 'done' }] })
    start([zip(25, 'a.zip'), zip(15, 'b.zip')], server)
    expect(screen.getAllByTestId('upload-entry')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'התקדמות כוללת' })).toHaveAttribute('aria-valuenow', '100'))
    expect(server.puts).toHaveLength(5)
  })

  it('onBusy — true בזמן ההעלאה (המעטפת שואלת לפני יציאה), false בסוף', async () => {
    const server = makeUploadServer({ after: [{ status: 'done' }] })
    const onBusy = vi.fn()
    start([zip()], server, { onBusy })
    expect(onBusy).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'העלה' }))
    await waitFor(() => expect(onBusy).toHaveBeenCalledWith(true))
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false))
  })
})
