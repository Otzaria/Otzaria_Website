import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import LinksTab, { farLabel } from './LinksTab'
import { buildView } from '@/lib/pageProof/ops'

// קישורי-סעיפים בין עמודים (2026-09-30): הצד שאינו בעמוד — עמוד, שורה ותחילת הטקסט; את קישור שבא מעמוד אחר
// מאשרים/מבטלים בעמוד של הפירוש
describe('LinksTab — קישור לעמוד אחר', () => {
  it('farLabel', () => {
    expect(farLabel(4, 11, 77, 'ב ועוד נראה')).toBe('עמוד 4, שורה 12: «ב ועוד נראה»')
    expect(farLabel(4, null, 77, '')).toBe('עמוד 4, שורה 77')
  })

  it('יוצא לעמוד אחר ונכנס מעמוד אחר', () => {
    const act = { jumpToLine: vi.fn(), linkOk: vi.fn(), linkDel: vi.fn(), unlink: vi.fn() }
    const view = {
      page: 5,
      lines: [{ id: 1, line_no: 0, text: 'ב ועוד נראה שאין' }, { id: 2, line_no: 1, text: 'ג והנה יש' }],
      links: [
        { from_line: 1, from_page: 5, to_line: 77, to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה', kind: 'dh', src: 'auto', conf: 0.9 },
        { from_line: 88, from_page: 6, from_line_no: 2, from_text: 'ג והנה יש לומר', to_line: 2, to_page: 5, kind: 'dh', src: 'auto', conf: 0.8 },
      ],
      missing: [],
    }
    render(<LinksTab view={view} act={act} />)
    expect(screen.getByText(/עמוד 4, שורה 12: «ב ועוד נראה»/)).toBeInTheDocument()
    expect(screen.getByText(/עמוד 6, שורה 3: «ג והנה יש לומר»/)).toBeInTheDocument()
    expect(screen.getByText(/הפירוש של הקישור הזה בעמוד 6 — מאשרים או מבטלים אותו שם/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /נכון/ })).toHaveLength(1)
    // רק הקישור שהפירוש שלו כאן ניתן לביטול כאן
    expect(screen.getAllByRole('button', { name: /בטל קישור/ })).toHaveLength(1)
  })
})

describe('LinksTab — קישור שהמתנדב יצר לעמוד אחר', () => {
  const view = {
    page: 5,
    lines: [
      { id: 1, line_no: 0, text: 'אמר רבי יוחנן' },
      { id: 2, line_no: 1, text: 'והנה יש לומר' },
    ],
    links: [
      // הערה כאן ← גוף בעמוד 4
      { from_line: 1, to_line: 77, to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה', kind: 'note', src: 'human', conf: 1, _added: true, from_words: [0, 0], to_words: [0, 0] },
      // פירוש בעמוד 6 ← גוף כאן
      { from_line: 88, from_page: 6, from_line_no: 2, from_text: 'ג והנה יש', to_line: 2, to_page: 5, kind: 'dh', src: 'human', conf: 1, _added: true, from_words: [0, 0], to_words: [1, 1] },
    ],
    missing: [],
  }
  const act = () => ({ jumpToLine: vi.fn(), linkOk: vi.fn(), linkDel: vi.fn(), unlink: vi.fn(), restoreLink: vi.fn(), otherPage: vi.fn(), cancelLink: vi.fn(), startLink: vi.fn() })

  it('"עמוד N, שורה M: «…»" מיד; "בטל קישור" — act.unlink (שמסיר את הפעולה עצמה; לא link_del, וגם לא "מבטלים בעמוד 6")', async () => {
    const a = act()
    render(<LinksTab view={view} act={a} />)
    expect(screen.getByText(/עמוד 4, שורה 12: «ב ועוד נראה»/)).toBeInTheDocument()
    expect(screen.getByText(/עמוד 6, שורה 3: «ג והנה יש»/)).toBeInTheDocument()
    expect(screen.queryByText(/מאשרים או מבטלים אותו שם/)).toBeNull()
    const cancel = screen.getAllByRole('button', { name: /בטל קישור/ })
    expect(cancel).toHaveLength(2)
    fireEvent.click(cancel[1])
    expect(a.unlink).toHaveBeenCalledWith(view.links[1])
    expect(a.linkDel).not.toHaveBeenCalled()
    expect(screen.getAllByText('נוסף עכשיו')).toHaveLength(2)
  })

  it('קישור ממתין — כפתורי "הצד השני בעמוד אחר" (4, 6, מספר)', () => {
    const a = act()
    render(<LinksTab view={view} act={a} linkPending={{ from: { text: 'רבי' } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'עמוד 6' }))
    fireEvent.click(screen.getByRole('button', { name: 'מספר עמוד…' }))
    expect(a.otherPage.mock.calls).toEqual([[6], [null]])
  })

  it('בתצוגה-בלבד — "בטל קישור" חסום; בלי act.otherPage — בלי כפתורי-עמוד', () => {
    const a = { ...act(), otherPage: null }
    render(<LinksTab view={view} act={a} readOnly linkPending={{ from: { text: 'רבי' } }} />)
    for (const b of screen.getAllByRole('button', { name: /בטל קישור/ })) expect(b).toBeDisabled()
    expect(screen.queryByTestId('other-page-buttons')).toBeNull()
  })
})

// "בטל קישור" לכל קישור, ו"החזר לאוטומטי" (בעל הפרויקט, 2026-10-05)
describe('LinksTab — בטל קישור והחזר לאוטומטי', () => {
  const P = 4
  const line = (id, text) => ({ id, line_no: id - 1, order: id, text, text_ocr: text, stream: id > 5 ? 'notes' : 'main', status: 'pending' })
  const base = {
    page: P,
    size: [1000, 1000],
    lines: [line(1, 'אמר רבי יוחנן'), line(2, 'משום רבי שמעון'), line(6, 'א רבי'), line(7, 'ב משום'), line(8, 'ג עוד')],
    links: [
      { from_line: 6, to_line: 1, to_page: P, kind: 'note', conf: 0.84, src: 'auto', from_words: [0, 0], to_words: [1, 2] },
      { from_line: 7, to_line: 2, to_page: P, kind: 'note', conf: 1, src: 'human', from_words: [0, 0], to_words: [0, 0] },
      // בוטל קודם ("אין קישור")
      { from_line: 8, to_line: null, to_page: null, kind: 'link', conf: 1, src: 'human' },
    ],
    missing: [],
  }
  const act = () => ({ jumpToLine: vi.fn(), linkOk: vi.fn(), unlink: vi.fn(), restoreLink: vi.fn(), cancelLink: vi.fn(), startLink: vi.fn() })
  const items = () => screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-link-item'))

  it('אוטומטי: "✓ נכון" ו"בטל קישור"; ידני (של מתנדב קודם): רק "בטל קישור" — ושניהם בולטים', () => {
    const a = act()
    const view = buildView(base, [])
    render(<LinksTab view={view} baseDoc={base} ops={[]} act={a} />)
    const [auto, human] = items()
    expect(within(auto).getByText(/אוטומטי 84%/)).toBeInTheDocument()
    expect(within(auto).getByRole('button', { name: '✓ נכון' })).toBeInTheDocument()
    const del = within(auto).getByRole('button', { name: /בטל קישור/ })
    expect(del).toHaveClass('bg-danger-600')
    fireEvent.click(del)
    expect(a.unlink).toHaveBeenLastCalledWith(view.links[0])
    expect(within(human).getByText(/אושר/)).toBeInTheDocument()
    expect(within(human).queryByRole('button', { name: '✓ נכון' })).toBeNull()
    fireEvent.click(within(human).getByRole('button', { name: /בטל קישור/ }))
    expect(a.unlink).toHaveBeenLastCalledWith(view.links[1])
    // הקישור שבוטל קודם אינו בין "קישורים בעמוד"
    expect(items()).toHaveLength(2)
    expect(screen.getByText('קישורים בעמוד (2)')).toBeInTheDocument()
  })

  it('קישורים שבוטלו: בוטל עכשיו (אוטומטי — "החזר לאוטומטי"; ידני — "החזר את הקישור"), בוטל קודם — "החזר לאוטומטי"', () => {
    const a = act()
    const ops = [
      { kind: 'link_del', page: P, value: { src_line: 6, page: P } },
      { kind: 'link_del', page: P, value: { src_line: 7, page: P } },
    ]
    render(<LinksTab view={buildView(base, ops)} baseDoc={base} ops={ops} act={a} />)
    expect(screen.getByText('קישורים שבוטלו (3)')).toBeInTheDocument()
    const rows = [...document.querySelectorAll('[data-cancelled-link]')]
    expect(rows.map((r) => r.getAttribute('data-cancelled-link'))).toEqual(['6', '7', '8'])
    expect(within(rows[0]).getByText(/בוטל בעריכה הזו/)).toBeInTheDocument()
    fireEvent.click(within(rows[0]).getByRole('button', { name: /החזר לאוטומטי/ }))
    expect(a.restoreLink.mock.calls[0][0]).toMatchObject({ key: 'now:6', when: 'now', auto: true })
    fireEvent.click(within(rows[1]).getByRole('button', { name: /החזר את הקישור/ }))
    expect(a.restoreLink.mock.calls[1][0]).toMatchObject({ key: 'now:7', auto: false })
    expect(within(rows[2]).getByText(/בוטל קודם/)).toBeInTheDocument()
    fireEvent.click(within(rows[2]).getByRole('button', { name: /החזר לאוטומטי/ }))
    expect(a.restoreLink.mock.calls[2][0].restore).toEqual({ action: 'op', op: { kind: 'link_reset', page: P, value: { src_line: 8, page: P } } })
    expect(items()).toHaveLength(0)
  })

  it('ההחזרה כבר בדרך (link_reset) — "יחזור לאוטומטי" ו"ביטול"; בתצוגה-בלבד — חסום', () => {
    const a = act()
    const ops = [{ kind: 'link_reset', page: P, value: { src_line: 8, page: P } }]
    const { unmount } = render(<LinksTab view={buildView(base, ops)} baseDoc={base} ops={ops} act={a} />)
    const row = document.querySelector('[data-cancelled-link="8"]')
    expect(within(row).getByText(/יחזור לאוטומטי/)).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'ביטול' }))
    expect(a.restoreLink.mock.calls[0][0]).toMatchObject({ pending: true, restore: { action: 'remove' } })
    unmount()
    render(<LinksTab view={buildView(base, [])} baseDoc={base} ops={[]} act={a} readOnly />)
    expect(within(document.querySelector('[data-cancelled-link="8"]')).getByRole('button', { name: /החזר לאוטומטי/ })).toBeDisabled()
  })
})
