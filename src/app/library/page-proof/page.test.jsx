import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildView } from '@/lib/pageProof/ops'
import { draftKeyFor, legacyDraftKey, pageDraftKey } from '@/lib/pageProof/drafts'
import { HELP_SEEN_KEY } from '@/components/pageProof/ProofHelp'
import PageProofVolunteer from './page.jsx'

// העורך עצמו נבדק בנפרד; כאן — מה שהדף מעביר לו (draftKey), ומה הדף עושה עם
// actions({ops, view, approval}) שהעורך מחזיר: חלון ההגשה והשליחה.
const h = vi.hoisted(() => ({ props: null, ops: [], approval: null, dialog: null, search: '', router: null, seqPages: null }))
vi.mock('next/navigation', () => ({
  useRouter: () => h.router,
  useSearchParams: () => new URLSearchParams(h.search),
}))
vi.mock('@/components/pageProof/ProofEditor', async () => {
  const { buildView: bv } = await import('@/lib/pageProof/ops')
  return {
    default: (props) => {
      h.props = props
      return <div data-testid="editor">{props.actions?.({ ops: h.ops, view: bv(props.page.doc, h.ops), approval: h.approval })}</div>
    },
  }
})
vi.mock('@/components/layout/Header', () => ({ default: () => null }))
vi.mock('@/hooks/useRequireAuth', () => ({
  useRequireAuth: () => ({ session: { user: { isVerified: true, role: 'user' } }, status: 'authenticated' }),
}))
vi.mock('@/components/providers/DialogContext', () => {
  // אותו אובייקט בכל רינדור — אחרת ה-callbacks של הדף משתנים והטעינה חוזרת
  const dialog = { showAlert: vi.fn(), showConfirm: vi.fn(async () => true) }
  h.dialog = dialog
  return { useDialog: () => dialog }
})

const ID = '64b7f0c2a1b2c3d4e5f60718'
const OTHER = '64b7f0c2a1b2c3d4e5f60719'
const P = 4
const line = (id, extra = {}) => ({ id, order: id, line_no: id - 1, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main', ...extra })
const makePage = (lines = [line(1), line(2), line(3, { stream: 'notes' })]) => ({
  id: ID,
  page: P,
  revision: 1,
  imageUrl: `/api/page-proof/pages/${ID}/image?v=1`,
  doc: { page: P, revision: 1, size: [1000, 2000], lines, frames: [], links: [] },
})

let posts
let pageData
function mockFetch() {
  posts = []
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url)
    if (init?.method === 'POST' && u === '/api/page-proof') {
      posts.push({ url: u, body: JSON.parse(init.body) })
      return { json: async () => ({ success: true, released: 1 }) }
    }
    if (init?.method === 'POST' && u.endsWith('/submit')) {
      const body = JSON.parse(init.body)
      posts.push({ url: u, body })
      return { json: async () => ({ success: true, opCount: body.ops.length }) }
    }
    if (u.startsWith(`/api/page-proof/pages/${ID}`)) return { json: async () => pageData }
    if (u.startsWith('/api/page-proof')) {
      return {
        json: async () => ({
          success: true,
          sequence: { book: { id: 'b1', title: 'ספר ניסוי' }, seq: 0, pages: h.seqPages || [{ id: ID, page: P, state: 'mine', lines: 3, revision: pageData.page.revision }] },
          stats: { done: 0, open: 5, mySubmitted: 0, myApproved: 0 },
        }),
      }
    }
    throw new Error(`fetch לא צפוי: ${u}`)
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
  h.props = null
  h.ops = []
  h.approval = null
  h.search = ''
  h.router = { replace: vi.fn(), push: vi.fn() }
  h.seqPages = null
  pageData = { success: true, mode: 'edit', page: makePage(), submission: null }
  mockFetch()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('דף המתנדב — טיוטות לפי גרסה', { timeout: 20000 }, () => {
  it('העורך מקבל draftKey לפי העמוד והגרסה; טיוטה ישנה תקפה עוברת אליו והמפתחות הישנים נמחקים', async () => {
    const legacy = JSON.stringify({ ops: [{ kind: 'line_ok', page: P, ids: [1] }], at: 1 })
    window.localStorage.setItem(legacyDraftKey(ID), legacy)
    window.localStorage.setItem(draftKeyFor(ID, '0:deadbeef'), '{"ops":[]}')
    window.localStorage.setItem(draftKeyFor(OTHER, '1:aaaa'), '{"ops":[]}')

    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    const key = pageDraftKey(pageData.page)
    expect(h.props.draftKey).toBe(key)
    expect(h.props.readOnly).toBe(false)
    expect(window.localStorage.getItem(key)).toBe(legacy)
    expect(window.localStorage.getItem(legacyDraftKey(ID))).toBeNull()
    expect(window.localStorage.getItem(draftKeyFor(ID, '0:deadbeef'))).toBeNull()
    expect(window.localStorage.getItem(draftKeyFor(OTHER, '1:aaaa'))).not.toBeNull()
  })
})

describe('דף המתנדב — חלון ההגשה', { timeout: 20000 }, () => {
  it('לא הכול אושר: "אשר גם את כל השאר והגש" שולח גם line_ok לשאר, עם ההערה, ומוחק את הטיוטה', async () => {
    h.ops = [{ kind: 'line_ok', page: P, ids: [1, 2], _g: 'g1' }]
    h.approval = { approved: 1, total: 2 }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    const key = h.props.draftKey
    window.localStorage.setItem(key, JSON.stringify({ ops: h.ops, at: 1 }))

    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    expect(screen.getByText('אושרו 1 מתוך 2 פסקאות')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('הערה למנהל (לא חובה)'), 'הכול נבדק')
    await userEvent.click(screen.getByRole('checkbox', { name: 'קראתי את כל הטקסט בעמוד' }))
    await userEvent.click(screen.getByRole('button', { name: 'אשר גם את כל השאר והגש' }))

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].url).toBe(`/api/page-proof/pages/${ID}/submit`)
    // אישורי-השורות מאוחדים לפעולה אחת (ops.packOps — כמו שהשרת שומר)
    expect(posts[0].body).toEqual({
      ops: [{ kind: 'line_ok', page: P, ids: [1, 2, 3] }],
      note: 'הכול נבדק',
      revision: 1,
    })
    await waitFor(() => expect(h.dialog.showAlert).toHaveBeenCalledWith('הוגש', expect.stringContaining('תודה')))
    expect(window.localStorage.getItem(key)).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"הגש רק את מה שאישרתי" שולח את הפעולות כמות-שהן', async () => {
    h.ops = [{ kind: 'line_ok', page: P, ids: [1, 2] }]
    h.approval = { approved: 1, total: 2 }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    await userEvent.click(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body.ops).toEqual([{ kind: 'line_ok', page: P, ids: [1, 2] }])
  })

  it('בלי שום פעולה: "הגש רק את מה שאישרתי" חסום ומוסבר, ולא נשלח דבר', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    expect(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' })).toBeDisabled()
    expect(screen.getByText(/אין מה להגיש/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(posts).toHaveLength(0)
  })

  it('שגיאה מהשרת מוצגת בחלון, והחלון נשאר פתוח', async () => {
    h.ops = [{ kind: 'line_ok', page: P, ids: [1, 2, 3] }]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    global.fetch.mockImplementationOnce(async () => ({ json: async () => ({ success: false, error: 'העמוד כבר הוגש או נלקח בידי מתנדב אחר' }) }))
    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    await userEvent.click(screen.getByRole('button', { name: 'הגש' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('העמוד כבר הוגש')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('דף המתנדב — מעבר שני', { timeout: 20000 }, () => {
  it('עמוד שחזר מזיהוי-מחדש: הודעה עם מספר השורות לבדיקה, ותגית "מעבר שני" ברצף', async () => {
    const page = makePage([line(1), line(2, { recheck: true }), line(3, { recheck: true })])
    page.revision = 2
    page.doc.revision = 2
    pageData = { success: true, mode: 'edit', page, submission: null }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(screen.getByRole('status')).toHaveTextContent('2 שורות זוהו מחדש')
    expect(screen.getByRole('button', { name: /עמוד 4/ })).toHaveTextContent('מעבר שני')
    expect(h.props.draftKey).toMatch(new RegExp(`^page-proof-draft:${ID}:2:`))
  })

  it('בלי שורות recheck — אין הודעה', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(buildView(pageData.page.doc, []).lines).toHaveLength(3)
  })
})

describe('דף המתנדב — עזרה', { timeout: 20000 }, () => {
  it('נפתחת לבד בפעם הראשונה כשעמוד נפתח לעריכה, ונפתחת שוב מ"מה עושים כאן?"', async () => {
    window.localStorage.removeItem(HELP_SEEN_KEY)
    render(<PageProofVolunteer />)
    expect(await screen.findByRole('dialog', { name: 'מה עושים בעמוד?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'הבנתי, מתחילים' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'מה עושים כאן?' }))
    expect(screen.getByRole('dialog', { name: 'מה עושים בעמוד?' })).toBeInTheDocument()
  })
})

describe('דף המתנדב — פתיחה מרשת-העמודים (?page=) ורצף אחר', { timeout: 20000 }, () => {
  it('?page=<id> ← הבקשה לרצף כוללת את העמוד, והוא נפתח (לא העמוד הראשון שלכם ברצף)', async () => {
    h.search = `page=${ID}`
    h.seqPages = [
      { id: OTHER, page: P - 1, state: 'mine', lines: 3, revision: 1 },
      { id: ID, page: P, state: 'mine', lines: 3, revision: 1 },
    ]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    const urls = global.fetch.mock.calls.map(([u]) => String(u))
    expect(urls[0]).toBe(`/api/page-proof?page=${ID}`)
    expect(urls).toContain(`/api/page-proof/pages/${ID}`)
    expect(urls).not.toContain(`/api/page-proof/pages/${OTHER}`)
    expect(h.dialog.showAlert).not.toHaveBeenCalled()
  })

  it('העמוד שביקשו אינו זמין (מתנדב אחר) ← הסבר, ונפתח העמוד הראשון שלכם', async () => {
    h.search = `page=${OTHER}`
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(h.dialog.showAlert).toHaveBeenCalledWith('העמוד אינו זמין', expect.stringMatching(/מתנדב אחר/))
    expect(global.fetch.mock.calls.map(([u]) => String(u))).toContain(`/api/page-proof/pages/${ID}`)
  })

  it('"רצף אחר" משחרר רק את הרצף הזה (ספר + מספר-רצף) ומנקה את ?page= מהכתובת', async () => {
    h.search = `page=${ID}`
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByRole('button', { name: /רצף אחר/ }))
    await waitFor(() => expect(posts.some((p) => p.url === '/api/page-proof')).toBe(true))
    expect(posts.find((p) => p.url === '/api/page-proof').body).toEqual({ action: 'release', book: 'b1', seq: 0 })
    expect(h.router.replace).toHaveBeenCalledWith('/library/page-proof', { scroll: false })
    // הטעינה שאחרי הדילוג — בלי העמוד מהכתובת
    await waitFor(() => expect(global.fetch.mock.calls.map(([u]) => String(u))).toContain('/api/page-proof?skip=b1%3A0'))
  })

  it('קישור לבחירת עמודים מספר (רשת-העמודים) בכותרת הדף', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(screen.getByRole('link', { name: /בחירת עמודים מספר/ })).toHaveAttribute('href', '/library/page-proof/books')
  })
})
