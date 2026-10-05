import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildView } from '@/lib/pageProof/ops'
import { draftKeyFor, legacyDraftKey, pageDraftKey } from '@/lib/pageProof/drafts'
import { HELP_SEEN_KEY } from '@/components/pageProof/ProofHelp'
import { RECUT_OFF_HELP } from '@/lib/pageProof/helpTexts'
import { formatSince, formatUntil } from '@/lib/pageProof/dates'
import PageProofVolunteer from './page.jsx'

// העורך עצמו נבדק בנפרד; כאן — מה שהדף מעביר לו (draftKey), ומה הדף עושה עם
// actions({ops, view, approval}) שהעורך מחזיר: חלון ההגשה והשליחה. וגם: הכניסה
// לדף אינה תופסת שום עמוד — היא טוענת רק את "העמודים שלי" (/api/page-proof/mine) —
// ואין בדף שום חלוקה אוטומטית ("רצף אחר" הוסר; עמודים נבחרים רק ברשת-העמודים).
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
  recutPending: null,
  submitted: null,
  recutReply: null,
  puts: [],
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
// בקשות ל-GET /api/page-proof (שבעבר תפס "רצף אחר") — להבדיל מ-/mine ומ-/pages/…;
// הדף לא שולח אותן לעולם (ואין להן תשובה מדומה: קריאה כזו הייתה נכשלת)
const claimCalls = () =>
  global.fetch.mock.calls
    .filter(([u, init]) => (init?.method || 'GET') === 'GET' && (String(u) === '/api/page-proof' || String(u).startsWith('/api/page-proof?')))
    .map(([u]) => String(u))
function mockFetch() {
  posts = []
  global.fetch = vi.fn(async (url, init) => {
    const u = String(url)
    if (init?.method === 'POST' && u.endsWith('/recut-request')) {
      const body = JSON.parse(init.body)
      posts.push({ url: u, body })
      return { json: async () => h.recutReply || { success: true, submissionId: 's9', opCount: body.ops.length, pending: 1 } }
    }
    // הטיוטה בשרת (docs/63 §2 — useServerDraft)
    if (init?.method === 'PUT' && u.endsWith('/draft')) {
      const body = JSON.parse(init.body)
      h.puts.push({ url: u, body })
      return { ok: true, status: 200, json: async () => ({ success: true, updatedAt: new Date().toISOString(), count: body.ops.length, dropped: 0, stage: body.stage ?? null }) }
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
          recutPending: h.recutPending ?? [],
          submitted: h.submitted ?? [],
          sequence: asked && !h.unavailable ? seqOf() : null,
          unavailable: asked && h.unavailable ? h.unavailable : null,
          stats: STATS,
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
  // ברירת-המחדל: פתיחה של עמוד שבטיפולכם (?page=) — העורך נפתח
  h.search = `page=${ID}`
  h.router = { replace: vi.fn(), push: vi.fn() }
  h.seqPages = null
  h.held = null
  h.unavailable = null
  h.recutPending = null
  h.submitted = null
  h.recutReply = null
  h.puts = []
  pageData = { success: true, mode: 'edit', page: makePage(), submission: null }
  mockFetch()
})
afterEach(() => {
  vi.clearAllMocks()
})

// הטיוטה בשרת (docs/63 §2): החדשה מבין המקומית לזו שבשרת נכנסת לעורך; כל שינוי נשמר באתר; טיוטה שעברה ממתנדב
// קודם — הודעה עם "התחל מאפס"
describe('דף המתנדב — הטיוטה בשרת', { timeout: 20000 }, () => {
  const SRV_OP = { kind: 'text', page: P, ids: [1], value: 'שורה 1 מהמחשב האחר' }
  const serverDraft = (extra = {}) => ({
    ops: [SRV_OP],
    count: 1,
    stage: 'text',
    revision: 1,
    updatedAt: new Date(Date.now() + 1000).toISOString(),
    byName: 'מתנדב',
    mine: true,
    carried: null,
    recut: null,
    inherited: null,
    handover: false,
    ...extra,
  })

  it('הטיוטה בשרת חדשה מהמקומית ("עבדתי ממחשב אחר") — היא נכנסת לעורך, ו"נשמר באתר"', async () => {
    const key = pageDraftKey(pageData.page)
    window.localStorage.setItem(key, JSON.stringify({ ops: [{ kind: 'line_ok', page: P, ids: [2] }], at: Date.now() - 3600e3 }))
    pageData = { ...pageData, draft: serverDraft(), now: new Date().toISOString() }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(JSON.parse(window.localStorage.getItem(key)).ops).toEqual([SRV_OP])
    expect(screen.getByTestId('draft-status')).toHaveTextContent('נשמר באתר')
  })

  it('שינוי בעורך נשמר באתר (PUT עם הגרסה והפעולות)', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    const op = { kind: 'line_ok', page: P, ids: [1], _s: 's1' }
    act(() => h.props.onOpsChange([op]))
    await waitFor(() => expect(h.puts.some((x) => x.body.ops.length === 1)).toBe(true), { timeout: 8000 })
    const put = h.puts.find((x) => x.body.ops.length === 1)
    expect(put.url).toBe(`/api/page-proof/pages/${ID}/draft`)
    expect(put.body).toMatchObject({ revision: 1, ops: [{ kind: 'line_ok', page: P, ids: [1] }] })
  })

  it('טיוטה שעברה ממתנדב קודם — הודעה עם מספר השינויים; "התחל מאפס" מרוקן אותה באתר וטוען את העמוד מחדש', async () => {
    pageData = { ...pageData, draft: serverDraft({ handover: true, inherited: { source: 'draft', byName: 'אחר', count: 1, ops: [SRV_OP], basedOn: null } }) }
    render(<PageProofVolunteer />)
    const note = await screen.findByTestId('inherited-notice')
    expect(note).toHaveTextContent('ממשיכים מהעבודה של מתנדב קודם (שינוי אחד)')
    const before = urls().filter((u) => u === `/api/page-proof/pages/${ID}`).length
    pageData = { ...pageData, draft: serverDraft({ ops: [], count: 0, stage: 'structure' }) }
    await userEvent.click(screen.getByRole('button', { name: /התחל מאפס/ }))
    await waitFor(() => expect(h.puts.some((x) => x.body.reset === true)).toBe(true))
    expect(h.puts.find((x) => x.body.reset).body.ops).toEqual([])
    await waitFor(() => expect(urls().filter((u) => u === `/api/page-proof/pages/${ID}`).length).toBe(before + 1))
    await waitFor(() => expect(screen.queryByTestId('inherited-notice')).not.toBeInTheDocument())
    expect(window.localStorage.getItem(pageDraftKey(pageData.page))).toBeNull()
  })
})

// הבודק השני (docs/63 §4): הטיוטה ההתחלתית — ההגשה של המתנדב הקודם; ההודעה, והעורך מסמן את מה שהתקבל
describe('דף המתנדב — הבודק השני', { timeout: 20000 }, () => {
  it('עמוד שמתנדב אחר כבר הגיש — ההודעה "בדיקה נוספת", השלב "מבנה", והעורך מקבל את פעולות ההגשה הקודמת כ-inherited', async () => {
    const prev = [{ kind: 'text', page: P, ids: [1], value: 'שורה 1 של הקודם' }]
    const inherited = { source: 'submission', byName: 'אחר', count: 1, ops: prev, basedOn: { id: 'sA', byName: 'אחר', kind: 'submission' } }
    pageData = {
      ...pageData,
      draft: { ops: prev, count: 1, stage: 'structure', revision: 1, updatedAt: new Date().toISOString(), byName: 'מתנדב', mine: true, carried: null, recut: null, inherited, handover: false, started: true },
    }
    render(<PageProofVolunteer />)
    const note = await screen.findByTestId('inherited-notice')
    expect(note).toHaveTextContent('בדיקה נוספת של העמוד')
    expect(note).toHaveTextContent('מתחילים מההגשה של מתנדב קודם (שינוי אחד)')
    expect(h.props.inherited).toEqual(inherited)
    expect(h.props.focus).toBe('structure')
    expect(JSON.parse(window.localStorage.getItem(h.props.draftKey)).ops).toEqual(prev)
  })
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

// ההגשה — משלב "טקסט" (docs/63 §3): עמוד חדש נפתח בשלב "מבנה"
const toText = () => userEvent.click(screen.getByRole('button', { name: /דלג — המבנה נכון/ }))

describe('דף המתנדב — חלון ההגשה', { timeout: 20000 }, () => {
  it('לא הכול אושר: "אשר גם את כל השאר והגש" שולח גם line_ok לשאר, עם ההערה, ומוחק את הטיוטה', async () => {
    h.ops = [{ kind: 'line_ok', page: P, ids: [1, 2], _g: 'g1' }]
    h.approval = { approved: 1, total: 2 }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    const key = h.props.draftKey
    window.localStorage.setItem(key, JSON.stringify({ ops: h.ops, at: 1 }))

    await toText()
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
    await toText()
    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    await userEvent.click(screen.getByRole('button', { name: 'הגש רק את מה שאישרתי' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body.ops).toEqual([{ kind: 'line_ok', page: P, ids: [1, 2] }])
  })

  it('בלי שום פעולה: "הגש רק את מה שאישרתי" חסום ומוסבר, ולא נשלח דבר', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    await toText()
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
    await toText()
    await waitFor(() => expect(h.puts.some((x) => x.body.stage === 'text')).toBe(true))
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
    await toText()
    await userEvent.click(screen.getByRole('button', { name: /הגשת העמוד/ }))
    await userEvent.click(screen.getByRole('button', { name: 'הגש' }))
    expect(await screen.findByText('סיימתם את הרצף — תודה!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /לבחירת העמודים הבאים בספר/ })).toHaveAttribute('href', '/library/page-proof/books/g1')
    expect(claimCalls()).toEqual([])
  })

  it('אין חלוקה אוטומטית: אין כפתור "רצף אחר" — בפס-הרצף קישור לרשת-העמודים של הספר, ואף בקשה ל-/api/page-proof', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(screen.queryByRole('button', { name: /רצף אחר/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/רצף אחר/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /עמודים נוספים בספר/ })).toHaveAttribute('href', '/library/page-proof/books/g1')
    expect(claimCalls()).toEqual([])
    expect(posts).toEqual([])
  })

  it('קישור לבחירת עמודים מספר (רשת-העמודים) בכותרת הדף', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(screen.getByRole('link', { name: /בחירת עמודים מספר/ })).toHaveAttribute('href', '/library/page-proof/books')
  })
})

// שני השלבים (docs/63 §3): עמוד חדש נפתח בשלב "מבנה"; "✓ המבנה נכון" בלי שינוי-חיתוך ← "טקסט"; עם שינוי-חיתוך ←
// זיהוי-מחדש בלי מנהל (העמוד יחזור לשלב "טקסט"); אי אפשר לשלוח — "טקסט" כמו היום (השורות נעולות עד ההגשה)
describe('דף המתנדב — שני השלבים', { timeout: 20000 }, () => {
  const CUT_OP = { kind: 'line_split', page: P, ids: [2], value: { x: 500 }, _g: 'g2' }
  const TEXT_OP = { kind: 'text', page: P, ids: [1], value: 'שורה 1 מתוקנת', _g: 'g1' }
  const stageOf = () => screen.getByTestId('stage-bar').getAttribute('data-stage')
  // העורך המדומה אינו מדווח את הפעולות לבד — כמו onOpsChange של ProofEditor
  const report = (ops) => act(() => h.props.onOpsChange(ops))

  it('עמוד חדש — שלב "מבנה": העורך מקבל focus, הכפתור "✓ המבנה נכון — להגהת הטקסט", והשלב נשמר בטיוטה', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(stageOf()).toBe('structure')
    expect(h.props.focus).toBe('structure')
    expect(screen.getByRole('button', { name: /המבנה נכון — להגהת הטקסט/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /הגשת העמוד/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('stage-panel')).toHaveTextContent('מסגרות אושרו')
    await waitFor(() => expect(h.puts.some((x) => x.body.stage === 'structure')).toBe(true))
  })

  it('בלי שינוי-חיתוך — "טקסט" מיד (גם ב"דלג — המבנה נכון"), ו"חזרה לשלב המבנה" מחזירה', async () => {
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    report([TEXT_OP])
    await userEvent.click(screen.getByRole('button', { name: /דלג — המבנה נכון/ }))
    await waitFor(() => expect(stageOf()).toBe('text'))
    expect(h.props.focus).toBe('text')
    expect(screen.getByRole('button', { name: /הגשת העמוד/ })).toBeInTheDocument()
    await waitFor(() => expect(h.puts.some((x) => x.body.stage === 'text')).toBe(true))
    expect(posts).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: /חזרה לשלב המבנה/ }))
    expect(stageOf()).toBe('structure')
  })

  it('עם שינוי-חיתוך (ואפשר לשלוח): הטיוטה נשמרת בשלב "טקסט", רק תיקוני-החיתוך נשלחים — בלי חלון-אישור — והעמוד "בזיהוי-מחדש"', async () => {
    pageData = { ...pageData, canRecut: true }
    h.ops = [TEXT_OP, CUT_OP]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    report([TEXT_OP, CUT_OP])
    const btn = screen.getByRole('button', { name: /המבנה נכון — לזיהוי-מחדש/ })
    expect(btn).toHaveAttribute('title', expect.stringMatching(/יחזור אליכם לשלב הטקסט/))
    await userEvent.click(btn)
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(h.dialog.showConfirm).not.toHaveBeenCalled()
    expect(posts[0]).toEqual({ url: `/api/page-proof/pages/${ID}/recut-request`, body: { revision: 1, ops: [{ kind: 'line_split', page: P, ids: [2], value: { x: 500 } }] } })
    // לפני השליחה — הטיוטה כולה באתר, בשלב "טקסט"
    const saved = h.puts.filter((x) => x.body.stage === 'text').pop()
    expect(saved.body.ops).toHaveLength(2)
    await waitFor(() => expect(h.dialog.showAlert).toHaveBeenCalledWith('נשלח לזיהוי-מחדש', expect.stringContaining('יחזור אליכם לשלב הטקסט')))
    expect(await screen.findByText('סיימתם את הרצף — תודה!')).toBeInTheDocument()
    const seqBtn = screen.getByRole('button', { name: /עמוד 4/ })
    expect(seqBtn).toHaveTextContent('בזיהוי-מחדש')
    expect(seqBtn).toBeDisabled()
  })

  it('המנהל כיבה את השליחה — "טקסט" כמו היום: בלי בקשה, הסבר שהשורות נעולות עד ההגשה, ונוסח-העזרה של ההגשה', async () => {
    pageData = { ...pageData, recutRequests: false, canRecut: false }
    h.ops = [TEXT_OP, CUT_OP]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(h.props.help).toBe(RECUT_OFF_HELP)
    report([TEXT_OP, CUT_OP])
    expect(screen.getByRole('button', { name: /המבנה נכון — להגהת הטקסט/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /המבנה נכון — להגהת הטקסט/ }))
    await waitFor(() => expect(stageOf()).toBe('text'))
    expect(posts).toEqual([])
    expect(screen.getByTestId('stage-note')).toHaveTextContent('השורות שנחתכו נעולות לעריכה')
    expect(screen.getByTestId('stage-note')).toHaveTextContent('יישלחו עם ההגשה')
  })

  it('השרת דוחה את השליחה (recut_off באמצע / תקרה) — "טקסט" עם ההסבר והסיבה, והעורך נשאר פתוח', async () => {
    pageData = { ...pageData, canRecut: true }
    h.recutReply = { success: false, code: 'recut_off', error: 'שליחה לזיהוי-מחדש כבויה כרגע.' }
    h.ops = [CUT_OP]
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    report([CUT_OP])
    await userEvent.click(screen.getByRole('button', { name: /המבנה נכון — לזיהוי-מחדש/ }))
    await waitFor(() => expect(stageOf()).toBe('text'))
    expect(screen.getByTestId('stage-note')).toHaveTextContent('שליחה לזיהוי-מחדש כבויה כרגע')
    expect(screen.getByTestId('editor')).toBeInTheDocument()
    expect(h.props.help).toBe(RECUT_OFF_HELP)
  })

  it('עמוד שחזר מזיהוי-מחדש — נפתח ישר בשלב "טקסט" (מהטיוטה בשרת); "במה כבר טיפלתי" — חזר', async () => {
    const page = makePage([line(1), line(21, { recheck: true }), line(22, { recheck: true }), line(3, { stream: 'notes' })])
    page.revision = 2
    page.doc.revision = 2
    const at = new Date().toISOString()
    pageData = {
      success: true,
      mode: 'edit',
      page,
      submission: null,
      draft: { ops: [TEXT_OP], count: 1, stage: 'text', revision: 2, updatedAt: at, byName: 'מתנדב', mine: true, carried: { from: 1, kept: 1, cut: 1, dropped: [] }, recut: { sentAt: at, backAt: at }, inherited: null, handover: false },
    }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(stageOf()).toBe('text')
    expect(screen.getByTestId('stage-panel')).toHaveTextContent('חזר מזיהוי-מחדש')
    expect(screen.getByRole('status', { name: 'הטיוטה עברה לגרסה החדשה של העמוד' })).toHaveTextContent('תיקון אחד נשמר')
  })

  it('עמוד שכבר בעבודה מלפני השלבים (טיוטה מקומית בלי שלב) — "טקסט", כדי לא להחזיר מתנדב אחורה', async () => {
    window.localStorage.setItem(pageDraftKey(pageData.page), JSON.stringify({ ops: [TEXT_OP], at: Date.now() }))
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    expect(stageOf()).toBe('text')
  })

  it('העמוד חזר מזיהוי-מחדש: מה שתקף מהטיוטה הקודמת עבר אליו — וההודעה מספרת מה נשמר ומה לא', async () => {
    const old = makePage()
    window.localStorage.setItem(pageDraftKey(old), JSON.stringify({ ops: [TEXT_OP, CUT_OP, { kind: 'text', page: P, ids: [2], value: 'על שורה שנחתכה' }], at: 1 }))
    const page = makePage([line(1), line(21, { recheck: true }), line(22, { recheck: true }), line(3, { stream: 'notes' })])
    page.revision = 2
    page.doc.revision = 2
    pageData = { success: true, mode: 'edit', page, submission: null }
    render(<PageProofVolunteer />)
    await screen.findByTestId('editor')
    const note = screen.getByRole('status', { name: 'הטיוטה עברה לגרסה החדשה של העמוד' })
    expect(note).toHaveTextContent('תיקון אחד נשמר')
    expect(note).toHaveTextContent('תיקון-החיתוך לא הועבר — העמוד נחתך מחדש')
    expect(note).toHaveTextContent('תיקון אחד לא חל על השורות החדשות')
    expect(note).toHaveTextContent('טקסט: «על שורה שנחתכה»')
    expect(JSON.parse(window.localStorage.getItem(h.props.draftKey)).ops).toEqual([TEXT_OP])
    expect(window.localStorage.getItem(pageDraftKey(old))).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'סגירת ההודעה' }))
    expect(screen.queryByRole('status', { name: 'הטיוטה עברה לגרסה החדשה של העמוד' })).not.toBeInTheDocument()
  })

  it('"העמודים שלי" מציגים את העמודים שנשלחו ועוד לא חזרו', async () => {
    h.search = ''
    h.recutPending = [{ id: OTHER, gid: 'g1', title: 'ספר ניסוי', page: 9, requestedAt: new Date().toISOString(), picked: false }]
    render(<PageProofVolunteer />)
    const box = await screen.findByRole('region', { name: 'ממתינים לזיהוי-מחדש (1)' })
    expect(box).toHaveTextContent('ספר ניסוי · עמוד 9')
  })
})

// "שמור לך עד …" (שבת וחג אינם נספרים) ו"הוגש — ממתין לבדיקת מנהל (מאז …)" (פורום, 2026-10-05)
describe('דף המתנדב — עד מתי העמוד שמור, ומה עם עמוד שהוגש', { timeout: 20000 }, () => {
  it('העמוד שבעורך: "עמוד N שמור לך עד …" לפי המועד שהפתיחה קבעה', async () => {
    const until = new Date(Date.now() + 40 * 3600e3)
    pageData = { ...pageData, leasedUntil: until.toISOString() }
    render(<PageProofVolunteer />)
    const chip = await screen.findByTestId('lease-until')
    expect(chip).toHaveTextContent(`עמוד ${P} שמור לך עד ${formatUntil(until, new Date())}`)
    expect(chip).toHaveAttribute('title', expect.stringMatching(/שבת וחג אינם נספרים/))
  })

  it('"העמודים שלי": ההגשות שממתינות לבדיקת מנהל, עם "מאז"; לחיצה פותחת לצפייה עם אותה הודעה', async () => {
    h.search = ''
    const at = new Date(Date.now() - 26 * 3600e3).toISOString()
    h.held = []
    h.submitted = [{ id: ID, submissionId: 's1', gid: 'g1', title: 'ספר ניסוי', page: P, submittedAt: at, revision: 1 }]
    h.seqPages = [{ id: ID, page: P, state: 'submitted', lines: 3, revision: 1, leasedUntil: null, submittedAt: at }]
    pageData = { success: true, mode: 'view', page: makePage(), submission: { id: 's1', status: 'submitted', ops: [], note: '', createdAt: at } }
    render(<PageProofVolunteer />)
    const box = await screen.findByRole('region', { name: 'ממתינים לבדיקת מנהל (1)' })
    const since = formatSince(at, new Date())
    expect(box).toHaveTextContent(`הוגש — ממתין לבדיקת מנהל (מאז ${since})`)
    await userEvent.click(within(box).getByRole('button', { name: /ספר ניסוי · עמוד/ }))
    expect(h.router.replace).toHaveBeenCalledWith(`/library/page-proof?page=${ID}`, { scroll: false })
    await screen.findByTestId('editor')
    expect(urls()).toContain(`/api/page-proof/mine?page=${ID}`)
    expect(screen.getByText(`הוגש — ממתין לבדיקת מנהל (מאז ${since})`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /עמוד 4 · הוגש/ })).toHaveAttribute('title', expect.stringContaining(`ממתין לבדיקת מנהל (מאז ${since})`))
  })
})
