import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import SubmissionReviewDrawer from './SubmissionReviewDrawer'
import SubmissionsSection from './SubmissionsSection'
import { fixtureModel } from './testFixtures'

// סקירת הגשה: שבירת השורות לפני/אחרי (applyLineOps על מודל קטן), העוגנים שייגזרו, הורדת פעולה
// לפני אישור (lineOps ערוך נשלח), תשובות, תיקונים ידניים, דיווחים עם אזורים, "מבט כללי", ודחייה עם הערה.


const API = '/api/admin/tzurat-hadaf'
const OPS = [
  { op: 'start', block: 'g', line: 1, ref: 'R', wi: 2 },
  { op: 'confirm', block: 'g', line: 2 },
]

const detail = (extra = {}) => ({
  submission: {
    id: 's1',
    userName: 'לוי',
    round: 1,
    status: 'submitted',
    note: 'השורה השנייה התחילה מוקדם',
    checks: { blocks: 'ok', headers: 'issue' },
    lineOps: OPS,
    itemAnswers: [{ item: 'i1', verdict: 'print' }],
    manualItems: ['i9'],
    reports: ['r1'],
    ...extra,
  },
  page: {
    id: 'p1',
    slug: 'berakhot',
    masechet: 'ברכות',
    daf: 'ב.',
    round: 1,
    scan: { url: '/api/tzurat-hadaf/pages/p1/image?side=scan', w: 100, h: 140 },
    ours: { url: '/api/tzurat-hadaf/pages/p1/image?side=ours', w: 100, h: 140 },
    model: fixtureModel(),
  },
  items: [
    { id: 'i1', kind: 'g', otz: ['אמר'], print: ['אמרו'], ctxBefore: ['רבי'], ctxAfter: ['עד'] },
    { id: 'i9', kind: 'g', manual: true, otz: ['מ7'], print: ['מז'] },
  ],
  reports: [{ id: 'r1', category: 'size', text: 'הגיליון קטן', status: 'new', regions: [{ side: 'scan', x: 0.1, y: 0.2, w: 0.3, h: 0.1 }] }],
})

function mockServer(data = detail()) {
  const patches = []
  const gets = []
  const fn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
    if (url === `${API}/submissions/s1` && method === 'GET') return reply(200, data)
    if (url === `${API}/submissions/s1` && method === 'PATCH') {
      const body = JSON.parse(init.body)
      patches.push(body)
      return reply(200, { submission: { ...data.submission, status: body.action === 'approve' ? 'approved' : 'rejected' } })
    }
    if (url.startsWith(`${API}/submissions?`)) {
      gets.push(url)
      return reply(200, { pages: 2, submissions: [{ id: 's1', slug: 'berakhot', masechet: 'ברכות', daf: 'ב.', userName: 'לוי', round: 1, status: 'submitted', counts: { anchors: 2, items: 1, manual: 1, reports: 1 }, at: '2026-10-24T10:00:00Z' }], total: 1 })
    }
    throw new Error(`fetch לא צפוי: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return { patches, gets }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

const open = async (props = {}) => {
  const onDone = vi.fn()
  const onClose = vi.fn()
  render(<ToastProvider><SubmissionReviewDrawer id="s1" onDone={onDone} onClose={onClose} {...props} /></ToastProvider>)
  await screen.findByTestId('line-changes')
  return { onDone, onClose }
}

describe('SubmissionReviewDrawer', () => {
  it('שורות לפני/אחרי, שורה שאושרה, והעוגנים שייגזרו', async () => {
    mockServer()
    await open()
    const rows = screen.getAllByTestId('line-row')
    expect(rows.map((r) => [within(r).getByTestId('line-before').textContent, within(r).getByTestId('line-after').textContent])).toEqual([
      ['מ0 מ1 מ2', 'מ0 מ1'],
      ['מ3 מ4 מ5', 'מ2 מ3 מ4 מ5'],
      ['מ6 מ7 מ8', 'מ6 מ7 מ8'],
    ])
    expect(rows[2].textContent).toContain('אושרה')
    const anchors = within(screen.getByTestId('anchors')).getAllByRole('listitem').map((li) => li.textContent)
    expect(anchors).toEqual(['g · שורה 2: מתחילה ב-R #2', 'g · שורה 3: נבדקה ונכונה'])
  })

  it('תשובות (מסומנות), תיקון ידני, דיווח עם אזור על הסריקה, מבט כללי והערת המתנדב', async () => {
    mockServer()
    await open()
    expect(screen.getByTestId('item-answer').textContent).toContain('אוצריא: אמר')
    expect(screen.getByTestId('item-answer').textContent).toContain('הדפוס לפי זיהוי הטקסט: אמרו')
    expect(screen.getByTestId('item-answer').textContent).toContain('כמו הדפוס')
    expect(screen.getByTestId('manual-item').textContent).toContain('מז')
    expect(screen.getByTestId('sub-report').textContent).toContain('הגיליון קטן')
    expect(screen.getByText(/כותרות: בעיה/)).toBeInTheDocument()
    expect(screen.getByText(/השורה השנייה התחילה מוקדם/)).toBeInTheDocument()
    // מסגרות: 3 שורות שהשתנו בסריקה (לשורה 2 אין scan) + אזור הדיווח; בעמוד שלנו — 3 שורות
    const [scanFig, oursFig] = screen.getAllByRole('figure')
    expect(within(scanFig).getAllByTestId('region-box')).toHaveLength(3)
    expect(within(oursFig).getAllByTestId('region-box')).toHaveLength(3)
    expect(within(scanFig).getByRole('img').getAttribute('src')).toBe('/api/tzurat-hadaf/pages/p1/image?side=scan')
  })

  it('אישור בלי שינוי — בלי lineOps', async () => {
    const { patches } = mockServer()
    const { onDone } = await open()
    fireEvent.change(screen.getByLabelText('הערת בודק'), { target: { value: 'יפה' } })
    fireEvent.click(screen.getByRole('button', { name: 'אשר' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('s1', 'approved'))
    expect(patches).toEqual([{ action: 'approve', note: 'יפה' }])
  })

  it('הורדת פעולה לפני אישור — התצוגה מתעדכנת ו-lineOps הערוך נשלח', async () => {
    const { patches } = mockServer()
    const { onDone } = await open()
    fireEvent.click(screen.getByRole('checkbox', { name: /השאר: גמרא · שורה 2/ }))
    // בלי ההזזה נשארת רק השורה שאושרה
    expect(screen.getAllByTestId('line-row')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'אשר בלי פעולה אחת' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(patches).toEqual([{ action: 'approve', note: '', lineOps: [OPS[1]] }])
  })

  it('דחייה עם הערה — אחרי אישור בחלון', async () => {
    const { patches } = mockServer()
    const { onDone } = await open()
    fireEvent.change(screen.getByLabelText('הערת בודק'), { target: { value: 'השבירה שגויה' } })
    fireEvent.click(screen.getByRole('button', { name: 'דחה' }))
    const dialog = await screen.findByRole('dialog', { name: 'לדחות את ההגשה?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'דחה' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('s1', 'rejected'))
    expect(patches).toEqual([{ action: 'reject', note: 'השבירה שגויה' }])
  })

  it('דחייה שבוטלה בחלון — לא נשלח כלום', async () => {
    const { patches } = mockServer()
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'דחה' }))
    const dialog = await screen.findByRole('dialog', { name: 'לדחות את ההגשה?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'לדחות את ההגשה?' })).toBeNull())
    expect(patches).toEqual([])
  })

  it('הגשה שכבר אושרה — בלי כפתורי פעולה ובלי תיבות סימון', async () => {
    mockServer(detail({ status: 'approved', reviewedByName: 'מנהל' }))
    await open()
    expect(screen.queryByRole('button', { name: /^אשר/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'דחה' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText(/נבדק ע״י מנהל/)).toBeInTheDocument()
  })

  it('התחברות שפגה באישור — הודעה בעברית, וההגשה לא מסומנת כמאושרת', async () => {
    mockServer()
    const { onDone } = await open()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 0, type: 'opaqueredirect', json: async () => null })))
    fireEvent.click(screen.getByRole('button', { name: 'אשר' }))
    expect(await screen.findByText('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('SubmissionsSection', () => {
  it('"פתח" פותח את מגירת הסקירה; אחרי אישור המגירה נסגרת, השורה נשארת במקומה עם "מאושר", והמונים מתעדכנים', async () => {
    mockServer()
    const onChanged = vi.fn()
    render(<ToastProvider><SubmissionsSection onChanged={onChanged} /></ToastProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'פתח את ההגשה ברכות ב.' }))
    expect(await screen.findByRole('dialog', { name: 'הגשה: ברכות ב.' })).toBeInTheDocument()
    await screen.findByTestId('line-changes')
    fireEvent.click(screen.getByRole('button', { name: 'אשר' }))
    await waitFor(() => expect(screen.queryByTestId('line-changes')).toBeNull())
    const row = screen.getByTestId('submission-row')
    expect(within(row).getByText('מאושר')).toBeInTheDocument()
    // המונה מתעדכן מקומית, והסה"כ ברשימה יורד יחד איתו
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onChanged).toHaveBeenCalledWith('submission', 'submitted', 'approved')
    expect(screen.getByText('0 הגשות')).toBeInTheDocument()
    expect(await screen.findByText('ההגשה אושרה')).toBeInTheDocument()
  })

  it('עימוד והחלפת מצב — אותה בקשה כמו קודם (status, page), וחזרה לעמוד 1', async () => {
    const { gets } = mockServer()
    render(<ToastProvider><SubmissionsSection /></ToastProvider>)
    await screen.findByTestId('submission-row')
    expect(gets[0]).toBe(`${API}/submissions?status=submitted&page=1`)
    await userEvent.click(screen.getByRole('button', { name: /הבא/ }))
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/submissions?status=submitted&page=2`))
    await userEvent.click(screen.getByRole('radio', { name: 'מאושר' }))
    await waitFor(() => expect(gets.at(-1)).toBe(`${API}/submissions?status=approved&page=1`))
  })

  it('שגיאת טעינה במגירה — הודעה ו"נסה שוב", בלי לסגור', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'תקלה' }) })))
    const onClose = vi.fn()
    render(<ToastProvider><SubmissionReviewDrawer id="s1" onClose={onClose} /></ToastProvider>)
    expect(await screen.findByText('לא הצלחנו לטעון את ההגשה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /נסה שוב/ })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
