import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildView } from '@/lib/pageProof/ops'
import { draftKeyFor, legacyDraftKey, pageDraftKey } from '@/lib/pageProof/drafts'
import { HELP_SEEN_KEY } from '@/components/pageProof/ProofHelp'
import PageProofVolunteer from './page.jsx'

// העורך עצמו נבדק בנפרד; כאן — מה שהדף מעביר לו (draftKey), ומה הדף עושה עם
// actions({ops, view, approval}) שהעורך מחזיר: חלון ההגשה והשליחה. וגם: הכניסה
// לדף אינה תופסת שום עמוד — היא טוענת רק את "העמודים שלי" (/api/page-proof/mine).
const h = vi.hoisted(() => ({
  props: null,
  ops: [],
  approval: null,
  dialog: null,
  search: '',
  router: null,
  seqPages: null,
  held: null,
  unavailable: null,
}))
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
const STATS = { done: 0, open: 5, mySubmitted: 0, myApproved: 0 }
const FUTURE = new Date(Date.now() + 30 * 3600e3).toISOString()
const seqOf = () => ({
  book: { id: 'b1', gid: 'g1', title: 'ספר ניסוי' },
  seq: 0,
  pages: h.seqPages || [{ id: ID, page: P, state: 'mine', lines: 3, revision: pageData.page.revision, leasedUntil: FUTURE }],
})
const urls = () => global.fetch.mock.calls.map(([u]) => String(u))
// בקשות שתופסות עמודים (GET /api/page-proof — "רצף אחר"), להבדיל מ-/mine, מ-/pages/…
// ומהשחרור (POST)
const claimCalls = () =>
  global.fetch.mock.calls
    .filter(([u, init]) => (init?.method || 'GET') === 'GET' && (String(u) === '/api/page-proof' || String(u).startsWith('/api/page-proof?')))
    .map(([u]) => String(u))
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
    if (u.startsWith('/api/page-proof/mine')) {
      const asked = new URL(u, 'http://x').searchParams.get('page')
      return {
        json: async () => ({
          success: true,
          held: h.held ?? [seqOf()],
          sequence: asked && !h.unavailable ? seqOf() : null,
          unavailable: asked && h.unavailable ? h.unavailable : null,
          stats: STATS,
        }),
      }
    }
    if (u === '/api/page-proof' || u.startsWith('/api/page-proof?')) {
      return { json: async () => ({ success: true, sequence: seqOf(), stats: STATS }) }
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
  // ברירת-המחדל: פתיחה של עמוד שבטיפולכם (?page=) — העורך נפתח
  h.search = `page=${ID}`
  h.router = { replace: vi.fn(), push: vi.fn() }
  h.seqPages = null
  h.held = null
  h.unavailable = null
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

describe('דף המתנדב — הכניסה אינה תופסת עמודים ("העמודים שלי")', { timeout: 20000 }, () => {
  it('כניסה בלי ?page= ← רק "העמודים שלי" (קריאה בלבד); לחיצה על עמוד פותחת אותו בעורך', async () => {
    h.search = ''
    render(<PageProofVolunteer />)
    expect(await screen.findByRole('heading', { name: 'העמודים שלי' })).toBeInTheDocument()
    // בקשה אחת — קריאה בלבד; שום תפיסה, והעורך לא נפתח לבד
    expect(urls()).toEqual(['/api/page-proof/mine'])
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /עמוד 4/ })
    expect(btn).toHaveTextContent(/שמור לך עד/)
    await userEvent.click(btn)
    await screen.findByTestId('editor')
    expect(urls()).toContain(`/api/page-proof/pages/${ID}`)
    expect(h.router.replace).toHaveBeenCalledWith(`/library/page-proof?page=${ID}`, { scroll: false })
    expect(claimCalls()).toEqual([])
  })

  it('אין עמודים בטיפול ← הסבר וקישור לבחירת עמודים — ושום עמוד אינו נתפס', async () => {
    h.search = ''
    h.held = []
    render(<PageProofVolunteer />)
    expect(await screen.findByText('אין לכם עמודים בטיפול כרגע.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'בחירת עמודים' })).toHaveAttribute('href', '/library/page-proof/books')
    expect(urls()).toEqual(['/api/page-proof/mine'])
  })

  it('?page=<id> ← הבקשה (קריאה בלבד) כוללת את העמוד, והוא נפתח (לא העמוד הראשון שלכם ברצף)', async () => {
    h.seqPages = [
      { id: OTHER, page: P - 1, state: 'mine', lines: 3, revision: 1, leasedUntil: FUTURE },
      { id: ID, page: P, state: 'mine', lines: 3, revision: 1, leasedUntil: FUTURE },
    ]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(urls()[0]).toBe(`/api/page-proof/mine?page=${ID}`)
    expect(urls()).toContain(`/api/page-proof/pages/${ID}`)
    expect(urls()).not.toContain(`/api/page-proof/pages/${OTHER}`)
    expect(claimCalls()).toEqual([])
    expect(h.dialog.showAlert).not.toHaveBeenCalled()
  })

  it('העמוד שביקשו אינו בטיפולכם ← הסבר וקישור לרשת של הספר; שום עמוד אינו נתפס או נפתח במקומו', async () => {
    h.search = `page=${OTHER}`
    h.unavailable = { id: OTHER, gid: 'g1', page: 7, state: 'taken' }
    render(<PageProofVolunteer />)
    expect(await screen.findByText('עמוד 7 אינו בטיפולכם כרגע')).toBeInTheDocument()
    expect(screen.getByText('מתנדב אחר עובד עליו כרגע.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'לרשת-העמודים של הספר' })[0]).toHaveAttribute('href', '/library/page-proof/books/g1')
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
    expect(urls()).toEqual([`/api/page-proof/mine?page=${OTHER}`])
  })

  it('עמוד שהתפיסה עליו פגה (פנוי שוב) ← ההסבר אומר שאפשר לתפוס אותו שוב, והטיוטה נשמרה', async () => {
    h.search = `page=${OTHER}`
    h.unavailable = { id: OTHER, gid: 'g1', page: 7, state: 'open' }
    render(<PageProofVolunteer />)
    expect(await screen.findByText(/עברו 48 שעות.*לתפוס אותו שוב.*טיוטה/)).toBeInTheDocument()
  })

  it('"העמודים שלי" מתוך העורך ← חזרה לרשימה (טעינה מחדש, קריאה בלבד)', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByRole('button', { name: /העמודים שלי/ }))
    expect(await screen.findByRole('heading', { name: 'העמודים שלי' })).toBeInTheDocument()
    expect(urls().filter((u) => u.startsWith('/api/page-proof/mine'))).toHaveLength(2)
    expect(claimCalls()).toEqual([])
  })

  it('אחרי הגשת העמוד האחרון ברצף ← מעבר לרשת של הספר לבחירת העמודים הבאים (בלי לתפוס רצף לבד)', async () => {
    h.ops = [{ kind: 'line_ok', page: P, ids: [1, 2, 3] }]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    await userEvent.click(screen.getByRole('button', { name: 'הגש' }))
    expect(await screen.findByText('סיימתם את הרצף — תודה!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /לבחירת העמודים הבאים בספר/ })).toHaveAttribute('href', '/library/page-proof/books/g1')
    expect(claimCalls()).toEqual([])
  })

  it('"רצף אחר" — רק בלחיצה: משחרר את הרצף הזה (ספר + מספר-רצף), מנקה את ?page= ותופס רצף אחר', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(claimCalls()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: /רצף אחר/ }))
    expect(h.dialog.showConfirm).toHaveBeenCalledWith('רצף אחר', expect.stringMatching(/48 שעות/))
    await waitFor(() => expect(posts.some((p) => p.url === '/api/page-proof')).toBe(true))
    expect(posts.find((p) => p.url === '/api/page-proof').body).toEqual({ action: 'release', book: 'b1', seq: 0 })
    expect(h.router.replace).toHaveBeenCalledWith('/library/page-proof', { scroll: false })
    await waitFor(() => expect(claimCalls()).toEqual(['/api/page-proof?skip=b1%3A0']))
  })

  it('קישור לבחירת עמודים מספר (רשת-העמודים) בכותרת הדף', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(screen.getByRole('link', { name: /בחירת עמודים מספר/ })).toHaveAttribute('href', '/library/page-proof/books')
  })
})
