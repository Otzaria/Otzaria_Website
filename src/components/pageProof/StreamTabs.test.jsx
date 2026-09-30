import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StreamTabs from './StreamTabs'

const TABS = [
  // הריהוט ראשון בכוונה — הרכיב מעביר אותו לסוף
  { key: '__furniture', he: 'ריהוט הדף', color: '#9ca3af', count: 3, furniture: true },
  { key: 'main', he: 'ראשי', color: '#1a56db', count: 32, furniture: false, approval: { approved: 12, total: 12 } },
  { key: 'notes', he: 'הערות', color: '#0e7f3c', count: 18, furniture: false, approval: { approved: 2, total: 9 } },
]

describe('StreamTabs — לשוניות-הזרמים', () => {
  it('ריהוט הדף אחרון ומעומעם; מספר שורות לכל לשונית', () => {
    render(<StreamTabs tabs={TABS} tabKey="main" setTabKey={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([expect.stringContaining('ראשי'), expect.stringContaining('הערות'), expect.stringContaining('ריהוט הדף')])
    expect(tabs[0]).toHaveTextContent('32')
    expect(tabs[2]).toHaveAttribute('data-furniture', 'true')
    expect(tabs[2].className).toContain('text-on-surface/45')
  })

  it('הלשונית הפעילה מסומנת, ו-✓ רק כשכל הפסקאות בה אושרו', () => {
    render(<StreamTabs tabs={TABS} tabKey="notes" setTabKey={vi.fn()} />)
    const main = screen.getByRole('tab', { name: /ראשי/ })
    const notes = screen.getByRole('tab', { name: /הערות/ })
    expect(notes).toHaveAttribute('aria-selected', 'true')
    expect(main).toHaveAttribute('aria-selected', 'false')
    expect(main).toHaveAccessibleName(/כל הפסקאות אושרו/)
    expect(notes).not.toHaveAccessibleName(/כל הפסקאות אושרו/)
    expect(notes).toHaveAttribute('title', expect.stringContaining('אושרו 2 מתוך 9 פסקאות'))
  })

  it('לחיצה ומקלדת (← = הבאה בעברית) מחליפות לשונית', async () => {
    const setTabKey = vi.fn()
    render(<StreamTabs tabs={TABS} tabKey="main" setTabKey={setTabKey} />)
    await userEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    expect(setTabKey).toHaveBeenLastCalledWith('notes')
    const main = screen.getByRole('tab', { name: /ראשי/ })
    fireEvent.keyDown(main, { key: 'ArrowLeft' })
    expect(setTabKey).toHaveBeenLastCalledWith('notes')
    fireEvent.keyDown(main, { key: 'ArrowRight' })
    expect(setTabKey).toHaveBeenLastCalledWith('__furniture')
    fireEvent.keyDown(main, { key: 'End' })
    expect(setTabKey).toHaveBeenLastCalledWith('__furniture')
    expect(main).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: /הערות/ })).toHaveAttribute('tabindex', '-1')
  })

  it('עמוד בלי טקסט', () => {
    render(<StreamTabs tabs={[]} tabKey={null} setTabKey={vi.fn()} />)
    expect(screen.getByText('אין טקסט בעמוד הזה')).toBeInTheDocument()
  })
})
