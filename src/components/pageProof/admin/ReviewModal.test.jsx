import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReviewModal from './ReviewModal'

// העורך עצמו נבדק בנפרד; כאן — החוזה של ReviewModal מולו: props
// {page, initialOps, readOnly, persist, actions} ו-actions({ops, approval})
const h = vi.hoisted(() => ({ ops: [], props: null, dialog: null, reply: null }))
vi.mock('../ProofEditor', () => ({
  default: (props) => {
    h.props = props
    return <div data-testid="editor">{props.actions?.({ ops: h.ops, approval: { approved: 1, total: 2 } })}</div>
  },
}))
vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => h.dialog,
}))

const P = 3
const subOps = [{ kind: 'line_ok', page: P, ids: [1] }]
const payload = (over = {}) => ({
  success: true,
  page: { id: 'p1', title: 'ספר', page: P, required: 1, revision: 1, doc: { page: P, size: [100, 100], lines: [] }, ...over.page },
  submission: { id: 's1', status: 'submitted', ops: subOps, userName: 'דוד', createdAt: '2026-09-29T10:00:00Z', note: '', needsRecut: false, revision: 1, ...over.submission },
  siblings: [],
})

let patches
function mockFetch(data) {
  patches = []
  global.fetch = vi.fn(async (url, init) => {
    if (init?.method === 'PATCH') {
      patches.push(JSON.parse(init.body))
      return { json: async () => h.reply || { success: true, status: 'approved', opCount: 1, needsRecut: false, pageStatus: 'done' } }
    }
    return { json: async () => data }
  })
}

beforeEach(() => {
  h.ops = subOps
  h.props = null
  h.reply = null
  h.dialog = { showAlert: vi.fn(), showConfirm: vi.fn(async () => true) }
})
afterEach(() => {
  vi.restoreAllMocks()
})

// הרצת כל הטסטים במקביל על מחשב עמוס: 5 השניות של ברירת-המחדל אינן מספיקות לטסט הראשון בקובץ
describe('ReviewModal מול העורך החדש', { timeout: 20000 }, () => {
  it('אישור בלי עריכה — בלי ops; onDone מקבל גם את מצב העמוד', async () => {
    mockFetch(payload())
    const onDone = vi.fn()
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={onDone} />)
    await screen.findByTestId('editor')
    expect(h.props).toMatchObject({ readOnly: true, persist: false, initialOps: subOps })
    expect(screen.getByText('אושרו 1/2 פסקאות')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('s1', 'approved', { pageStatus: 'done', needsRecut: false }))
    expect(patches).toEqual([{ action: 'approve', note: '' }])
  })

  it('עריכה לפני אישור — נשלחות הפעולות בצורת-החוזה בלבד (בלי _g/_c)', async () => {
    mockFetch(payload())
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByTestId('editor')
    h.ops = [...subOps, { kind: 'text', page: P, ids: [2], value: 'מתוקן', _g: 'g1', _c: 'text:2', _t: 5 }]
    await userEvent.click(screen.getByRole('checkbox', { name: 'עריכה לפני אישור' }))
    expect(h.props.readOnly).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].ops).toEqual([...subOps, { kind: 'text', page: P, ids: [2], value: 'מתוקן' }])
  })

  it('עריכה שלא שינתה דבר (רק שדות פנימיים) — נשלח בלי ops', async () => {
    mockFetch(payload())
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByTestId('editor')
    h.ops = subOps.map((o) => ({ ...o, _g: 'g9' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'עריכה לפני אישור' }))
    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(patches).toEqual([{ action: 'approve', note: '' }]))
  })

  it('הגשה עם תיקוני-חיתוך — הודעה על הזיהוי-מחדש', async () => {
    mockFetch(payload({ submission: { needsRecut: true } }))
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByText(/כולל תיקוני-חיתוך/)).toBeInTheDocument()
  })

  it('הגשה על גרסה קודמת של העמוד — הודעה, ובלי "עריכה לפני אישור"', async () => {
    mockFetch(payload({ page: { revision: 2 }, submission: { revision: 1 } }))
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByText(/ההגשה נעשתה על גרסה 1 של העמוד/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'עריכה לפני אישור' })).not.toBeInTheDocument()
  })

  it('Esc סוגר — אלא אם מישהו בעורך כבר טיפל בו', async () => {
    mockFetch(payload())
    const onClose = vi.fn()
    render(<ReviewModal id="s1" onClose={onClose} onDone={vi.fn()} />)
    const editor = await screen.findByTestId('editor')
    const swallow = (e) => e.key === 'Escape' && e.preventDefault()
    editor.addEventListener('keydown', swallow)
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    editor.removeEventListener('keydown', swallow)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('אישור שתיקוני-החיתוך שלו לא יחזרו מהתוכנה (הגשה אחרת כבר יצאה) — הסבר למנהל', async () => {
    mockFetch(payload({ submission: { needsRecut: true } }))
    h.reply = { success: true, status: 'approved', opCount: 1, needsRecut: true, recutSkipped: true, pageStatus: 'done' }
    const onDone = vi.fn()
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={onDone} />)
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.dialog.showAlert).toHaveBeenCalledWith('תיקוני-החיתוך לא יחזרו מהתוכנה', expect.stringContaining('קובץ הכפולים'))
  })

  it('עמוד שממתין לזיהוי-מחדש — "שחרור מהמתנה" (אחרי אישור) שולח release_recut ומעדכן', async () => {
    mockFetch(payload({ page: { status: 'recut' }, submission: { status: 'approved' } }))
    h.reply = { success: true, status: 'approved', pageStatus: 'done' }
    const onPageChanged = vi.fn()
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} onPageChanged={onPageChanged} />)
    await userEvent.click(await screen.findByRole('button', { name: 'שחרור מהמתנה' }))
    await waitFor(() => expect(patches).toEqual([{ action: 'release_recut' }]))
    expect(h.dialog.showConfirm).toHaveBeenCalled()
    await waitFor(() => expect(onPageChanged).toHaveBeenCalledWith('s1', 'done'))
    expect(screen.queryByRole('button', { name: 'שחרור מהמתנה' })).not.toBeInTheDocument()
  })

  it('בקשת מתנדב לזיהוי-מחדש: מסומנת, בלי "דחייה"; "ביטול הבקשה" — אישור, release_recut, והעמוד חזר אל המתנדב', async () => {
    const cut = [{ kind: 'line_split', page: P, ids: [1], value: { x: 50 } }]
    h.ops = cut
    mockFetch(payload({ page: { status: 'recut' }, submission: { status: 'approved', ops: cut, needsRecut: true, recutRequest: true } }))
    h.reply = { success: true, status: 'rejected', pageStatus: 'open', canceledRequests: 1, returnedToRequester: true }
    const onPageChanged = vi.fn()
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} onPageChanged={onPageChanged} />)
    expect(await screen.findByTestId('recut-request')).toHaveTextContent('בקשת מתנדב לזיהוי-מחדש')
    expect(screen.queryByRole('button', { name: 'דחייה' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'אישור' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'ביטול הבקשה' }))
    expect(h.dialog.showConfirm).toHaveBeenCalledWith('ביטול הבקשה לזיהוי-מחדש', expect.stringContaining('יחזור אל המתנדב שביקש'))
    await waitFor(() => expect(patches).toEqual([{ action: 'release_recut' }]))
    await waitFor(() => expect(h.dialog.showAlert).toHaveBeenCalledWith('בוצע', 'הבקשה בוטלה, והעמוד חזר אל המתנדב שביקש.'))
    expect(onPageChanged).toHaveBeenCalledWith('s1', 'open')
  })

  it('עמוד שאינו ממתין — אין כפתור שחרור', async () => {
    mockFetch(payload({ page: { status: 'done' } }))
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByTestId('editor')
    expect(screen.queryByRole('button', { name: 'שחרור מהמתנה' })).not.toBeInTheDocument()
  })
})

describe('ReviewModal — קישור לעמוד אחר', { timeout: 20000 }, () => {
  it('קישור שהמתייג יצר לעמוד אחר — מסומן בכותרת: העמוד, השורה ותחילת הטקסט', async () => {
    const link = { kind: 'link_add', page: P, ids: [1, 77], value: { kind: 'note', from_words: [0, 0], to_words: [0, 0], to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה' } }
    h.ops = [link]
    mockFetch(payload({ page: { doc: { page: P, size: [100, 100], lines: [{ id: 1, text: 'שורה' }] } }, submission: { ops: [link] } }))
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    expect(await screen.findByTestId('far-link')).toHaveTextContent('קישור לעמוד 4, שורה 12: «ב ועוד נראה»')
  })

  it('בלי קישור לעמוד אחר — בלי הסימון', async () => {
    mockFetch(payload())
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByTestId('editor')
    expect(screen.queryByTestId('far-link')).toBeNull()
  })
})
