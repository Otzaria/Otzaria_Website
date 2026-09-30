import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextPanel, { linkFromInfo, MARK_LEGEND, TEXT_HINT } from './TextPanel'

const view = {
  lines: [
    { id: 1, text: 'אמר רבי יוחנן משום רבי', stream: 'main' },
    { id: 2, text: 'רבי יוחנן — הוא בעל הגמרא', stream: 'notes' },
    { id: 3, text: '12', stream: 'header' },
  ],
}
const TABS = [
  { key: 'main', he: 'ראשי', color: '#1a56db', count: 1, furniture: false, approval: { approved: 1, total: 1 } },
  { key: 'notes', he: 'הערות', color: '#0e7f3c', count: 1, furniture: false, approval: { approved: 0, total: 1 } },
  { key: '__furniture', he: 'ריהוט הדף', color: '#9ca3af', count: 1, furniture: true },
]

describe('TextPanel — לוח-הטקסט', () => {
  it('linkFromInfo: המילים שנבחרו והזרם שלהן', () => {
    expect(linkFromInfo(view, TABS, { lineId: 2, words: [0, 1] })).toEqual({ text: 'רבי יוחנן', tabKey: 'notes', streamHe: 'הערות' })
    expect(linkFromInfo(view, TABS, { lineId: 1, words: [2, 2], tabKey: 'main' }).text).toBe('יוחנן')
    expect(linkFromInfo(view, TABS, { lineId: 9, text: 'טקסט', tabKey: 'notes' })).toEqual({ text: 'טקסט', tabKey: 'notes', streamHe: 'הערות' })
    expect(linkFromInfo(view, TABS, null)).toBeNull()
  })

  it('העורך בתוך אזור-הגלילה, עם הגופן והגודל; שורת-רמז', () => {
    render(<TextPanel view={view} tabs={TABS} tabKey="notes" setTabKey={vi.fn()} editorSlot={<div data-testid="editor" />} fontSize={22} fontFamily="Arial, sans-serif" />)
    const scroll = screen.getByTestId('editor').parentElement
    expect(scroll).toHaveAttribute('data-proof-text-scroll')
    expect(scroll).toHaveStyle({ fontSize: '22px', fontFamily: 'Arial, sans-serif' })
    expect(screen.getByText(TEXT_HINT)).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('מקרא גלוי לסימונים: אדום בלי הצעות; כחול/סגול/כתום — ריחוף להצעות', () => {
    render(<TextPanel view={view} tabs={TABS} tabKey="main" setTabKey={vi.fn()} />)
    const legend = screen.getByRole('list', { name: 'מקרא הסימונים בטקסט' })
    const items = within(legend).getAllByRole('listitem').filter((li) => li.getAttribute('aria-hidden') !== 'true')
    expect(items).toHaveLength(MARK_LEGEND.length)
    expect(items[0]).toHaveTextContent('לא בטוח')
    expect(items[0]).toHaveAttribute('title', expect.stringContaining('אין לו הצעה'))
    expect(items[1]).toHaveAttribute('title', expect.stringContaining('ריחוף'))
    expect(TEXT_HINT).toMatch(/ריחוף על מילה בכחול, סגול או כתום/)
  })

  it('קישור ממתין באותה לשונית: מסביר לעבור לזרם השני; ביטול', async () => {
    const onCancelLink = vi.fn()
    render(
      <TextPanel view={view} tabs={TABS} tabKey="notes" setTabKey={vi.fn()} linkPending={{ from: { lineId: 2, words: [0, 1], tabKey: 'notes' } }} onCancelLink={onCancelLink} />
    )
    const banner = screen.getByText(/בחרו עכשיו את המילה המקבילה בזרם השני/).closest('[role="status"]')
    expect(banner).toHaveTextContent('נבחר: «רבי יוחנן» (הערות)')
    expect(banner).toHaveTextContent('Esc לביטול')
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onCancelLink).toHaveBeenCalled()
  })

  it('קישור ממתין בלשונית אחרת: "סמנו כאן את המילה המקבילה"', () => {
    render(<TextPanel view={view} tabs={TABS} tabKey="main" setTabKey={vi.fn()} linkPending={{ from: { lineId: 2, words: [0, 0], tabKey: 'notes' } }} onCancelLink={vi.fn()} />)
    expect(screen.getByText(/סמנו כאן את המילה המקבילה/)).toBeInTheDocument()
  })

  it('סבב שני: פס השורות שזוהו מחדש', () => {
    render(<TextPanel view={view} tabs={TABS} tabKey="main" setTabKey={vi.fn()} recheckCount={3} />)
    expect(screen.getByText(/3 שורות זוהו מחדש ומסומנות בצהוב — בדקו אותן/)).toBeInTheDocument()
  })

  it('כל הפסקאות בזרם אושרו — עם מעבר ללשונית שעוד לא אושרה', async () => {
    const setTabKey = vi.fn()
    render(<TextPanel view={view} tabs={TABS} tabKey="main" setTabKey={setTabKey} approval={{ approved: 1, total: 1 }} />)
    expect(screen.getByText('כל הפסקאות בזרם אושרו')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ללשונית «הערות»' }))
    expect(setTabKey).toHaveBeenCalledWith('notes')
  })

  it('בלי הודעות כשאין מה להודיע; רמז מיוחד לריהוט ולתצוגה-בלבד', () => {
    const { rerender } = render(<TextPanel view={view} tabs={TABS} tabKey="__furniture" setTabKey={vi.fn()} approval={{ approved: 0, total: 0 }} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText(/ריהוט הדף .* אינו נכנס לספר/)).toBeInTheDocument()
    rerender(<TextPanel view={view} tabs={TABS} tabKey="main" setTabKey={vi.fn()} readOnly />)
    expect(screen.getByText(/תצוגה בלבד/)).toBeInTheDocument()
  })
})

describe('TextPanel — הצד השני בעמוד אחר', () => {
  it('קישור ממתין + onOtherPage: הקודם / הבא / מספר-עמוד; בלעדיו — אין כפתורים', async () => {
    const onOtherPage = vi.fn()
    const { unmount } = render(
      <TextPanel view={{ ...view, page: 7 }} tabs={TABS} tabKey="main" setTabKey={vi.fn()} linkPending={{ from: { lineId: 2, words: [0, 1] } }} onCancelLink={vi.fn()} onOtherPage={onOtherPage} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'עמוד 6' }))
    await userEvent.click(screen.getByRole('button', { name: 'עמוד 8' }))
    await userEvent.click(screen.getByRole('button', { name: 'מספר עמוד…' }))
    expect(onOtherPage.mock.calls).toEqual([[6], [8], [null]])
    unmount()
    render(<TextPanel view={{ ...view, page: 7 }} tabs={TABS} tabKey="main" setTabKey={vi.fn()} linkPending={{ from: { lineId: 2, words: [0, 1] } }} onCancelLink={vi.fn()} />)
    expect(screen.queryByTestId('other-page-buttons')).toBeNull()
  })
})
