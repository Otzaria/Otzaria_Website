import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import FinishPageDialog, { isFreshSubmitChord } from './FinishPageDialog'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

function setup(props = {}) {
  const handlers = { onSubmit: vi.fn(), onClose: vi.fn(), onGoToSuspects: vi.fn() }
  render(
    <FinishPageDialog
      bookTitle="משנה ברכות"
      pageNumber={3}
      suspectCount={6}
      textLineCount={20}
      scanLineCount={20}
      saveStatus="saved"
      lastSavedAt={Date.now()}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('FinishPageDialog', () => {
  it('דיאלוג עם כותרת, תת-כותרת ושלוש בדיקות', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'סיום עמוד' })
    expect(dialog).toHaveAccessibleDescription(/משנה ברכות · עמוד 3/)
    const items = within(screen.getByRole('list', { name: 'בדיקות לפני הסיום' })).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('6 מילים חשודות לא נבדקו')
    expect(items[1]).toHaveTextContent('כל 20 השורות שבצילום הוקלדו')
    expect(items[2]).toHaveTextContent('הכול נשמר')
  })

  it('"עבור אליהן" קורא ל-onGoToSuspects; בלי חשודות — אין כפתור', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'עבור אליהן' }))
    expect(h.onGoToSuspects).toHaveBeenCalled()
  })

  it('בלי חשודות — אין "עבור אליהן"; שורות שונות מוצגות', () => {
    setup({ suspectCount: 0, textLineCount: 19 })
    expect(screen.queryByRole('button', { name: 'עבור אליהן' })).toBeNull()
    expect(screen.getByText('19 שורות בטקסט, 20 בצילום')).toBeInTheDocument()
  })

  it('הפוקוס לא על הכפתור הראשי; לחיצה שולחת את ההערה', () => {
    const h = setup()
    const submit = screen.getByRole('button', { name: 'סיים ועבור לעמוד הבא' })
    expect(submit).not.toHaveFocus()
    fireEvent.change(screen.getByRole('textbox', { name: 'הערה לבודק (לא חובה)' }), { target: { value: '  כתם בשורה 12 ' } })
    fireEvent.click(submit)
    expect(h.onSubmit).toHaveBeenCalledWith({ note: 'כתם בשורה 12' })
  })

  it('Ctrl+Enter שולח; מקש מוחזק (repeat) — לא', () => {
    const h = setup()
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true, repeat: true })
    expect(h.onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(h.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Enter לבד בהערה — לא שולח', () => {
    const h = setup()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(h.onSubmit).not.toHaveBeenCalled()
  })

  it('בזמן שליחה — לא שולח שוב, ו"חזור לעריכה" מושבת', () => {
    const h = setup({ submitting: true })
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true })
    expect(h.onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'חזור לעריכה' })).toBeDisabled()
  })

  it('"חזור לעריכה" סוגר', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'חזור לעריכה' }))
    expect(h.onClose).toHaveBeenCalled()
  })
})

describe('FinishPageDialog — התאמה לזרימה הקיימת', () => {
  it('בלי שדה הערה, נוסח פעולה מותאם ותוכן נוסף', () => {
    const h = setup({ showNote: false, submitLabel: 'סיים והעלה', children: <p>מה יקרה</p> })
    expect(screen.queryByLabelText(/הערה לבודק/)).toBeNull()
    expect(screen.getByText('מה יקרה')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'סיים והעלה' }))
    expect(h.onSubmit).toHaveBeenCalledWith({ note: '' })
  })
})

describe('isFreshSubmitChord', () => {
  const ev = (o) => ({ key: 'Enter', ctrlKey: true, metaKey: false, repeat: false, timeStamp: 100, ...o })
  it('רק Ctrl/⌘+Enter, לא repeat, ולא אירוע מלפני הפתיחה', () => {
    expect(isFreshSubmitChord(ev(), 50)).toBe(true)
    expect(isFreshSubmitChord(ev({ ctrlKey: false, metaKey: true }), 50)).toBe(true)
    expect(isFreshSubmitChord(ev({ ctrlKey: false }), 50)).toBe(false)
    expect(isFreshSubmitChord(ev({ key: 's' }), 50)).toBe(false)
    expect(isFreshSubmitChord(ev({ repeat: true }), 50)).toBe(false)
    // הלחיצה שפתחה את החלון — לפני ה-mount
    expect(isFreshSubmitChord(ev({ timeStamp: 40 }), 50)).toBe(false)
  })
})
