import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import EditorStatusBar from './EditorStatusBar'
import TrackingStatus from './TrackingStatus'

describe('EditorStatusBar', () => {
  it('מציג מעקב, מיקום, ספירות, תזכורת וקיצורים', () => {
    render(
      <EditorStatusBar
        tracking={{ level: 'word', source: 'layout' }}
        position={{ line: 4, totalLines: 20, word: 3 }}
        wordCount={205}
        suspectCount={6}
        onSuspectsClick={() => {}}
        restRemainingMs={12 * 60_000}
      />
    )
    const bar = screen.getByRole('contentinfo', { name: 'שורת מצב' })
    expect(bar).toHaveTextContent('מעקב מילה')
    expect(bar).toHaveTextContent('שורה 4 מתוך 20 · מילה 3')
    expect(bar).toHaveTextContent('205 מילים')
    expect(bar).toHaveTextContent('הפסקת עיניים בעוד 12 ד׳')
    const shortcuts = screen.getByRole('list', { name: 'קיצורי מקלדת' })
    expect(within(shortcuts).getAllByRole('listitem')).toHaveLength(2)
    // רק קיצורים ממומשים — בלי F6
    expect(shortcuts).not.toHaveTextContent('F6')
  })

  it('שורה אחת: בלי שבירה, המעקב נחתך, והקיצורים רק מ-xl', () => {
    render(<EditorStatusBar tracking={{ level: 'line', source: 'layout', estimated: true }} onTrackingClick={() => {}} />)
    const bar = screen.getByRole('contentinfo', { name: 'שורת מצב' })
    expect(bar.className).toContain('flex-nowrap')
    expect(bar.className).not.toMatch(/(^|\s)flex-wrap/)
    expect(bar.className).toContain('min-h-(--editor-statusbar-height)')
    expect(screen.getByRole('list', { name: 'קיצורי מקלדת' }).className).toMatch(/hidden .*xl:flex/)
  })

  it('לחיצה על המילים לבדיקה', () => {
    const onSuspectsClick = vi.fn()
    render(<EditorStatusBar tracking={{ level: 'line' }} suspectCount={2} onSuspectsClick={onSuspectsClick} />)
    const button = screen.getByRole('button', { name: /2 מילים לבדיקה/ })
    // אין קיצור ממומש למעבר למילה הבאה — בלי aria-keyshortcuts; יש רמז
    expect(button).not.toHaveAttribute('aria-keyshortcuts')
    expect(screen.getAllByRole('tooltip', { hidden: true }).some((t) => t.textContent === 'מעבר למילה הבאה לבדיקה')).toBe(true)
    fireEvent.click(button)
    expect(onSuspectsClick).toHaveBeenCalled()
  })

  it('בלי חשודות ובלי תזכורת — לא מוצגים', () => {
    render(<EditorStatusBar tracking={{ level: 'off' }} suspectCount={0} shortcuts={[]} />)
    expect(screen.queryByText(/לבדיקה/)).toBeNull()
    expect(screen.queryByText(/הפסקת עיניים/)).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('TrackingStatus', () => {
  it('מכריז על הרמה והמקור', () => {
    const { container, rerender } = render(<TrackingStatus level="word" source="local" />)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live).toHaveTextContent('מעקב מילה (מזיהוי בדפדפן)')
    rerender(<TrackingStatus level="ruler" source="manual" />)
    expect(live).toHaveTextContent('סרגל ידני (ידני)')
    expect(container.querySelector('[data-level]')).toHaveAttribute('data-level', 'ruler')
  })

  it('עם onClick — כפתור עם שם מלא', () => {
    const onClick = vi.fn()
    render(<TrackingStatus level="line" source="profile" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /מעקב שורה · מיקום המילה משוער \(מניתוח התמונה\)/ }))
    expect(onClick).toHaveBeenCalled()
  })
})
