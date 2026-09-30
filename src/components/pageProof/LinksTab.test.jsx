import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LinksTab, { farLabel } from './LinksTab'

// קישורי-סעיפים בין עמודים (2026-09-30): הצד שאינו בעמוד — עמוד, שורה ותחילת הטקסט; את קישור שבא מעמוד אחר
// מאשרים/מוחקים בעמוד של הפירוש
describe('LinksTab — קישור לעמוד אחר', () => {
  it('farLabel', () => {
    expect(farLabel(4, 11, 77, 'ב ועוד נראה')).toBe('עמוד 4, שורה 12: «ב ועוד נראה»')
    expect(farLabel(4, null, 77, '')).toBe('עמוד 4, שורה 77')
  })

  it('יוצא לעמוד אחר ונכנס מעמוד אחר', () => {
    const act = { jumpToLine: vi.fn(), linkOk: vi.fn(), linkDel: vi.fn() }
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
    expect(screen.getByText(/מאשרים או מוחקים בעמוד 6/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /נכון/ })).toHaveLength(1)
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
  const act = () => ({ jumpToLine: vi.fn(), linkOk: vi.fn(), linkDel: vi.fn(), removeLink: vi.fn(), otherPage: vi.fn(), cancelLink: vi.fn(), startLink: vi.fn() })

  it('"עמוד N, שורה M: «…»" מיד; "ביטול הקישור" מסיר את הפעולה (לא link_del, וגם לא "מאשרים בעמוד 6")', async () => {
    const a = act()
    render(<LinksTab view={view} act={a} />)
    expect(screen.getByText(/עמוד 4, שורה 12: «ב ועוד נראה»/)).toBeInTheDocument()
    expect(screen.getByText(/עמוד 6, שורה 3: «ג והנה יש»/)).toBeInTheDocument()
    expect(screen.queryByText(/מאשרים או מוחקים בעמוד/)).toBeNull()
    const cancel = screen.getAllByRole('button', { name: /ביטול הקישור/ })
    expect(cancel).toHaveLength(2)
    fireEvent.click(cancel[1])
    expect(a.removeLink).toHaveBeenCalledWith(view.links[1])
    expect(a.linkDel).not.toHaveBeenCalled()
  })

  it('קישור ממתין — כפתורי "הצד השני בעמוד אחר" (4, 6, מספר)', () => {
    const a = act()
    render(<LinksTab view={view} act={a} linkPending={{ from: { text: 'רבי' } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'עמוד 6' }))
    fireEvent.click(screen.getByRole('button', { name: 'מספר עמוד…' }))
    expect(a.otherPage.mock.calls).toEqual([[6], [null]])
  })

  it('בתצוגה-בלבד — "ביטול הקישור" חסום; בלי act.otherPage — בלי כפתורי-עמוד', () => {
    const a = { ...act(), otherPage: null }
    render(<LinksTab view={view} act={a} readOnly linkPending={{ from: { text: 'רבי' } }} />)
    for (const b of screen.getAllByRole('button', { name: /ביטול הקישור/ })) expect(b).toBeDisabled()
    expect(screen.queryByTestId('other-page-buttons')).toBeNull()
  })
})
