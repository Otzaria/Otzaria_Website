import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EditorTopBar from './EditorTopBar'
import SaveStatusIndicator from './SaveStatusIndicator'

function setup(props = {}) {
  const handlers = {
    onOpenCommands: vi.fn(),
    onOpenDisplay: vi.fn(),
    onOpenGuidelines: vi.fn(),
    onFinish: vi.fn(),
  }
  render(
    <EditorTopBar
      bookTitle="משנה ברכות"
      bookHref="/library/books/mishna"
      pageNumber={3}
      totalPages={120}
      saveStatus="saved"
      lastSavedAt={Date.now()}
      shortcuts={{ commandPalette: 'Ctrl+KeyK', finish: 'Ctrl+Enter' }}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('EditorTopBar', () => {
  it('onBack: לחיצה רגילה על "חזרה לספר" קוראת לו במקום לנווט; Ctrl+לחיצה נשארת קישור', () => {
    const onBack = vi.fn()
    setup({ onBack })
    const link = screen.getByRole('link', { name: 'חזרה לספר משנה ברכות' })
    const plain = fireEvent.click(link)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(plain).toBe(false) // preventDefault — הניווט עובר דרך onBack
    fireEvent.click(link, { ctrlKey: true })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('כותרת, שם הספר (h1), עמוד X מתוך Y וחזרה לספר', () => {
    setup()
    expect(screen.getByRole('banner', { name: 'כותרת העורך' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'משנה ברכות' })).toHaveClass('font-display')
    expect(screen.getByText(/מתוך/).textContent).toBe('עמוד 3 מתוך 120')
    expect(screen.getByRole('link', { name: 'חזרה לספר משנה ברכות' })).toHaveAttribute('href', '/library/books/mishna')
  })

  it('כפתורי הפעולה קוראים ל-callbacks; "סיים עמוד" הוא הכפתור הראשי', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'פקודות וכלים' }))
    fireEvent.click(screen.getByRole('button', { name: 'תצוגה ונוחות עיניים' }))
    fireEvent.click(screen.getByRole('button', { name: 'הנחיות לספר' }))
    fireEvent.click(screen.getByRole('button', { name: 'סיים עמוד' }))
    expect(h.onOpenCommands).toHaveBeenCalled()
    expect(h.onOpenDisplay).toHaveBeenCalled()
    expect(h.onOpenGuidelines).toHaveBeenCalled()
    expect(h.onFinish).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'פקודות וכלים' })).toHaveAttribute('aria-keyshortcuts', 'Control+K')
  })

  it('אין ניווט לעמוד קודם/הבא — רק חזרה לספר והתווית "עמוד X מתוך Y"', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'עמוד קודם' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'עמוד הבא' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'מעבר בין עמודים' })).toBeNull()
    expect(screen.getByRole('link', { name: /חזרה לספר/ })).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  it('עמוד פנוי — "תפוס עמוד" ראשי, בלי "סיים עמוד"', () => {
    const onClaim = vi.fn()
    const h = setup({ claimState: 'available', onClaim })
    expect(screen.queryByRole('button', { name: 'סיים עמוד' })).toBeNull()
    const claim = screen.getByRole('button', { name: 'תפוס עמוד' })
    expect(claim.className).toContain('bg-(--button-filled-bg)')
    fireEvent.click(claim)
    expect(onClaim).toHaveBeenCalled()
    expect(h.onFinish).not.toHaveBeenCalled()
  })

  it('עמוד שתפסתי — "סיים עמוד" עם Ctrl+Enter, בלי "תפוס עמוד"', () => {
    setup({ claimState: 'mine', onClaim: vi.fn() })
    expect(screen.queryByRole('button', { name: 'תפוס עמוד' })).toBeNull()
    expect(screen.getByRole('button', { name: 'סיים עמוד' })).toHaveAttribute('aria-keyshortcuts', 'Control+Enter')
    // הרמז מציג את קיצור הסיום מהקיצורים של המשתמש
    expect(screen.getAllByRole('tooltip', { hidden: true }).some((t) => t.textContent === 'סיום העמוד (Ctrl+Enter)')).toBe(true)
  })

  it('קיצור שהמשתמש שינה — מוצג ברמז וב-aria-keyshortcuts; בלי קיצור — בלי התכונה', () => {
    render(<EditorTopBar bookTitle="ס" bookHref="/x" pageNumber={1} saveStatus="saved" onOpenCommands={vi.fn()} onOpenDisplay={vi.fn()} onFinish={vi.fn()} shortcuts={{ commandPalette: 'Alt+KeyP' }} />)
    const commands = screen.getByRole('button', { name: 'פקודות וכלים' })
    expect(commands).toHaveAttribute('aria-keyshortcuts', 'Alt+P')
    expect(screen.getAllByRole('tooltip', { hidden: true }).some((t) => t.textContent === 'פקודות וכלים (Alt+P)')).toBe(true)
    expect(screen.getByRole('button', { name: 'סיים עמוד' })).not.toHaveAttribute('aria-keyshortcuts')
  })

  it('חזרה לספר — עם רמז', () => {
    setup()
    expect(screen.getAllByRole('tooltip', { hidden: true }).some((t) => t.textContent === 'חזרה לספר')).toBe(true)
  })

  it('תפוס על ידי אחר — סטטוס עם השם, בלי תפיסה ובלי סיום', () => {
    setup({ claimState: 'other', holderName: 'דוד' })
    expect(screen.getByText('בטיפול של דוד', { selector: 'span.truncate' })).toBeInTheDocument()
    // השם המלא גם ברמז (התג נחתך בכותרת צרה)
    expect(screen.getAllByRole('tooltip', { hidden: true }).some((t) => t.textContent === 'בטיפול של דוד')).toBe(true)
    expect(screen.queryByRole('button', { name: 'סיים עמוד' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'תפוס עמוד' })).toBeNull()
  })

  it('תפוס על ידי אחר בלי שם / הושלם — טקסט כללי', () => {
    const { unmount } = render(<EditorTopBar bookTitle="ס" bookHref="/b" pageNumber={1} saveStatus="saved" onOpenCommands={vi.fn()} onOpenDisplay={vi.fn()} onFinish={vi.fn()} claimState="other" />)
    expect(screen.getByText('תפוס ע״י מתנדב אחר', { selector: 'span.truncate' })).toBeInTheDocument()
    unmount()
    setup({ claimState: 'completed' })
    expect(screen.getByText('העמוד הושלם', { selector: 'span.truncate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'סיים עמוד' })).toBeNull()
  })

  it('מצב שמירה מוכרז', () => {
    setup({ saveStatus: 'saving' })
    expect(screen.getByRole('status')).toHaveTextContent('שומר…')
  })
})

describe('SaveStatusIndicator', () => {
  it('נכשל — טקסט שגיאה וכפתור "נסה שוב"', () => {
    const onRetry = vi.fn()
    render(<SaveStatusIndicator status="error" onRetry={onRetry} />)
    expect(screen.getByRole('status')).toHaveTextContent('השמירה נכשלה')
    fireEvent.click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('בלי onRetry — אין כפתור; dirty', () => {
    render(<SaveStatusIndicator status="dirty" />)
    expect(screen.getByRole('status')).toHaveTextContent('יש שינויים שלא נשמרו')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
