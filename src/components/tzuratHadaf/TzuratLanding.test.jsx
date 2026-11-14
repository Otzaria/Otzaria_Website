import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TzuratLanding from './TzuratLanding'
import PracticeRunner from './PracticeRunner'
import HelpDialog, { HELP_KEYS } from './HelpDialog'
import { fixtureItem, res } from './testFixtures'

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const overview = (me, canAdmin = false) =>
  res(200, {
    books: [{ slug: 'berakhot', masechet: 'ברכות', order: 1, pages: 10, pagesOpen: 8, pagesDone: 2, items: 100, itemsOpen: 50, itemsAgreed: 25, itemsDisputed: 3 }],
    me: { practiceDone: false, decisions: 12, agreed: 5, pages: 1, pagesApproved: 0, reports: 2, points: 7, ...me },
    canAdmin,
  })

describe('TzuratLanding', () => {
  it('תרגול לפני שמתחילים, שני המסלולים, ההתקדמות והתרומות', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => overview({})))
    render(<TzuratLanding />)
    expect(await screen.findByTestId('practice-cta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /החלטות מהירות/ })).toHaveAttribute('href', '/library/tzurat-hadaf/fast')
    expect(screen.getByRole('link', { name: /בדיקת עמוד/ })).toHaveAttribute('href', '/library/tzurat-hadaf/pages')
    expect(screen.getByRole('link', { name: 'ברכות' })).toHaveAttribute('href', '/library/tzurat-hadaf/pages?m=berakhot')
    expect(screen.getByRole('progressbar', { name: 'עמודים' })).toHaveAttribute('aria-valuenow', '20')
    expect(screen.getByRole('link', { name: /ההנחיות למתנדבים/ })).toHaveAttribute('href', '/docs/tzurat-hadaf')
    expect(screen.queryByRole('link', { name: /ניהול צורת הדף/ })).toBeNull()
  })

  it('בלי סימון "אני קורא כתב רש"י"; מנהל רואה קישור לניהול; אחרי תרגול — בלי ההזמנה', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => overview({ practiceDone: true }, true)))
    render(<TzuratLanding />)
    expect(await screen.findByRole('link', { name: /ניהול צורת הדף/ })).toHaveAttribute('href', '/library/admin/tzurat-hadaf')
    expect(screen.queryByTestId('practice-cta')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('PracticeRunner', () => {
  it('עונים על כל הכרטיסים, שולחים יחד, ורואים תוצאה, תשובה נכונה והסבר; יותר משלוש טעויות — הנחיות', async () => {
    const items = [1, 2, 3, 4].map((n) => ({ ...fixtureItem({ id: `p${n}` }), explain: `הסבר ${n}` }))
    const fn = vi.fn(async (url, init = {}) => {
      if (init.method === 'POST')
        return res(200, { score: 0, total: 4, results: items.map((it) => ({ id: it.id, correct: false, expected: 'b', explain: it.explain })) })
      return res(200, { items })
    })
    vi.stubGlobal('fetch', fn)
    render(<PracticeRunner />)
    for (let n = 1; n <= 4; n++) {
      await screen.findByText(`שאלה ${n} מתוך 4`)
      fireEvent.keyDown(window, { key: '1' })
      fireEvent.click(screen.getByRole('button', { name: n < 4 ? 'הבאה' : /סיום ובדיקה/ }))
    }
    expect(await screen.findByTestId('practice-score')).toHaveTextContent('ענית נכון על 0 מתוך 4')
    const post = fn.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ answers: items.map((it) => ({ id: it.id, choice: 'a' })) })
    expect(screen.getAllByText(/התשובה הנכונה: א"ר/)).toHaveLength(4)
    expect(screen.getByText('הסבר 3')).toBeInTheDocument()
    expect(screen.getByTestId('practice-suggest')).toHaveTextContent(/ראשי תיבות/)
    expect(screen.getAllByRole('link', { name: /למסלול המהיר/ })[0]).toHaveAttribute('href', '/library/tzurat-hadaf/fast')
  })
})

describe('HelpDialog', () => {
  it('נפתח לבד בביקור הראשון, עובר בין השקופיות, וזוכר שנראה', async () => {
    const { unmount } = render(<HelpDialog track="fast" />)
    expect(await screen.findByRole('dialog')).toHaveTextContent('מה עושים כאן')
    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('איך עונים')
    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    fireEvent.click(screen.getByRole('button', { name: /הבנתי/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem(HELP_KEYS.fast)).toBe('1')
    unmount()
    render(<HelpDialog track="fast" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
