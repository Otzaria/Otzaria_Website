import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TextViewToggle from './TextViewToggle'
import TextToolbar from './TextToolbar'

const tip = 'החלפת תצוגה (Ctrl+Shift+M)'

describe('TextViewToggle', () => {
  it('בתצוגה מעוצבת — כפתור "קוד" לא-לחוץ; לחיצה מחליפה', () => {
    const onToggle = vi.fn()
    render(<TextViewToggle value="rich" onToggle={onToggle} tip={tip} keyshortcuts="Control+Shift+M" />)
    // גרסה עם מילה (פאנל רחב) וגרסת אייקון (צר) — container query בוחר אחת; שם נגיש קבוע
    const buttons = screen.getAllByRole('button', { name: 'תצוגת קוד' })
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveTextContent('קוד')
    expect(buttons[0]).not.toHaveTextContent('עיצוב')
    buttons.forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'false'))
    expect(buttons[0]).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+M')
    fireEvent.click(buttons[0])
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('בתצוגת קוד — כפתור "עיצוב" לחוץ; לחיצה מחזירה', () => {
    const onToggle = vi.fn()
    render(<TextViewToggle value="code" onToggle={onToggle} tip={tip} />)
    const buttons = screen.getAllByRole('button', { name: 'תצוגת קוד' })
    expect(buttons[0]).toHaveTextContent('עיצוב')
    buttons.forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(buttons[1])
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('ברירת מחדל — תצוגה מעוצבת', () => {
    render(<TextViewToggle onToggle={() => {}} tip={tip} />)
    screen.getAllByRole('button', { name: 'תצוגת קוד' }).forEach((b) => expect(b).toHaveAttribute('aria-pressed', 'false'))
  })
})

describe('TextToolbar — מתג התצוגה', () => {
  const base = { onUndo() {}, onRedo() {}, onInsertTag() {}, onFind() {}, onMore() {} }

  it('גלוי עם הקיצור האמיתי של המשתמש; בלי handler — לא מוצג', () => {
    const onToggleTextView = vi.fn()
    const { unmount } = render(<TextToolbar {...base} textView="code" onToggleTextView={onToggleTextView} shortcuts={{ toggleTextView: 'Ctrl+Shift+KeyM' }} />)
    const btn = screen.getAllByRole('button', { name: 'תצוגת קוד' })[0]
    expect(btn).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+M')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(onToggleTextView).toHaveBeenCalledTimes(1)
    unmount()
    render(<TextToolbar {...base} />)
    expect(screen.queryByRole('button', { name: 'תצוגת קוד' })).toBeNull()
  })
})
