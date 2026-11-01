import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TextToolbar from './TextToolbar'

function setup(props = {}) {
  const h = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onInsertTag: vi.fn(),
    onFind: vi.fn(),
    onSpellcheck: vi.fn(),
    onImageToText: vi.fn(),
    onSplit: vi.fn(),
    onMore: vi.fn()
  }
  render(<TextToolbar {...h} {...props} />)
  return h
}

describe('TextToolbar', () => {
  it('כל כלי העריכה גלויים כשאין מדידה (jsdom) — ושורת הכלים לא נגללת', () => {
    setup()
    const bar = screen.getByRole('group', { name: 'כלי הטקסט' })
    expect(bar.className).toContain('overflow-x-clip')
    expect(bar.className).not.toContain('overflow-x-auto')
    for (const name of ['ביטול', 'ביצוע מחדש', 'הדגשה', 'נטוי', 'קו תחתון', 'כותרת רמה 1', 'כותרת רמה 2', 'כותרת רמה 3',
      'הגדלת קטע', 'הקטנת קטע', 'חיפוש והחלפה', 'בדיקת איות', 'הוספת תמונה לטקסט', 'פיצול לשני טורים', 'כל הפקודות']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('קבוצות בגלולות (בלי קווי הפרדה); כותרות — טקסט דק שלא מתהפך, B כבד, ביטול/ביצוע — מתהפכים ב-RTL', () => {
    setup()
    const bar = screen.getByRole('group', { name: 'כלי הטקסט' })
    const visible = [...bar.children].filter((el) => !el.hasAttribute('inert'))
    const pills = visible.filter((el) => el.className.includes('bg-(--tool-group-bg)'))
    expect(pills.length).toBeGreaterThanOrEqual(6)
    expect(bar.querySelector('.bg-outline-variant')).toBeNull()
    const bold = screen.getByRole('button', { name: 'הדגשה' })
    expect(pills.find((p) => p.contains(bold))).toContainElement(screen.getByRole('button', { name: 'קו תחתון' }))
    const glyph = (name) => screen.getByRole('button', { name }).querySelector('.material-symbols-outlined')
    const text = (name) => screen.getByRole('button', { name }).querySelector('span[dir="ltr"]')
    expect(text('כותרת רמה 2')).toHaveTextContent('H2')
    expect(text('כותרת רמה 2').className).toContain('font-light')
    expect(text('כותרת רמה 2').className).toContain('[unicode-bidi:isolate]')
    expect(text('כותרת רמה 2').className).not.toContain('scale-x')
    expect(text('הדגשה')).toHaveTextContent('B')
    expect(text('הדגשה').className).toContain('font-extrabold')
    expect(glyph('נטוי')).toHaveTextContent('format_italic')
    expect(glyph('ביטול').className).toContain('rtl:-scale-x-100')
    expect(glyph('ביצוע מחדש').className).toContain('rtl:-scale-x-100')
  })

  it('מתגי עיצוב: "לחוץ" לפי activeFormats (העיצוב שתחת הסמן)', () => {
    setup({ activeFormats: { b: true, small: true, h2: true } })
    const state = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed')
    expect(state('הדגשה')).toBe('true')
    expect(state('נטוי')).toBe('false')
    expect(state('הקטנת קטע')).toBe('true')
    expect(state('הגדלת קטע')).toBe('false')
    expect(state('כותרת רמה 2')).toBe('true')
    expect(state('כותרת רמה 1')).toBe('false')
  })

  it('נקה עיצוב — כפתור עם קיצור, לא מוציא את הפוקוס מהשדה; בלי handler — לא מוצג', () => {
    const onClearFormatting = vi.fn()
    setup({ onClearFormatting, shortcuts: { clearFormatting: 'Ctrl+Backslash' } })
    const btn = screen.getByRole('button', { name: 'נקה עיצוב' })
    expect(btn).toHaveAttribute('aria-keyshortcuts', 'Control+\\')
    fireEvent.click(btn)
    expect(onClearFormatting).toHaveBeenCalledTimes(1)
  })

  it('בלי onClearFormatting — אין כפתור "נקה עיצוב"', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'נקה עיצוב' })).toBeNull()
  })

  it('מצב לחוץ (פיצול לטורים) — מילוי secondary-container', () => {
    setup({ twoColumns: true })
    const split = screen.getByRole('button', { name: 'איחוד לטור אחד' })
    expect(split).toHaveAttribute('aria-pressed', 'true')
    expect(split.className).toContain('bg-(--tool-bg-pressed)')
  })

  it('ביטול/ביצוע מחדש: אפורים ומושבתים כשאין מה לבטל/לבצע', () => {
    const h = setup({ canUndo: false, canRedo: false })
    const undo = screen.getByRole('button', { name: 'ביטול' })
    const redo = screen.getByRole('button', { name: 'ביצוע מחדש' })
    expect(undo).toBeDisabled()
    expect(redo).toBeDisabled()
    expect(undo.className).toContain('opacity-')
    fireEvent.click(undo)
    expect(h.onUndo).not.toHaveBeenCalled()
  })

  it('ביטול פעיל כשיש מה לבטל, ביצוע מחדש — לא', () => {
    setup({ canUndo: true, canRedo: false })
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'ביצוע מחדש' })).toBeDisabled()
  })

  it('תגיות: כל כפתור מוסיף את התגית שלו', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'נטוי' }))
    fireEvent.click(screen.getByRole('button', { name: 'כותרת רמה 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'הקטנת קטע' }))
    expect(h.onInsertTag.mock.calls.map((c) => c[0])).toEqual(['i', 'h3', 'small'])
  })

  it('כלים ופעולות', () => {
    const h = setup({ twoColumns: true })
    fireEvent.click(screen.getByRole('button', { name: 'בדיקת איות' }))
    fireEvent.click(screen.getByRole('button', { name: 'איחוד לטור אחד' }))
    fireEvent.click(screen.getByRole('button', { name: 'כל הפקודות' }))
    expect(h.onSpellcheck).toHaveBeenCalled()
    expect(h.onSplit).toHaveBeenCalled()
    expect(h.onMore).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'איחוד לטור אחד' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('כלי בלי handler — לא מוצג', () => {
    setup({ onSpellcheck: undefined, onImageToText: undefined })
    expect(screen.queryByRole('button', { name: 'בדיקת איות' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'הוספת תמונה לטקסט' })).toBeNull()
  })

  it('רמז עם הקיצור המותאם', () => {
    setup({ shortcuts: { bold: 'ctrl+b' } })
    expect(screen.getByRole('button', { name: 'הדגשה' })).toHaveAccessibleDescription(/Ctrl\+B/i)
  })

  it('גודל הגופן: − / ערך / + גלויים, ממקור אחד (fontSize), בגבולות הטווח', () => {
    const onFontSizeChange = vi.fn()
    setup({ fontSize: 18, onFontSizeChange, fontSizeRange: { min: 12, max: 40, step: 1 }, shortcuts: { textZoomIn: 'Ctrl+Shift+Equal' } })
    const bigger = screen.getByRole('button', { name: 'הגדלת גופן הטקסט' })
    expect(bigger).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+=')
    fireEvent.click(bigger)
    expect(onFontSizeChange).toHaveBeenLastCalledWith(19)
    fireEvent.click(screen.getByRole('button', { name: 'הקטנת גופן הטקסט' }))
    expect(onFontSizeChange).toHaveBeenLastCalledWith(17)
    expect(screen.getByRole('status')).toHaveTextContent('גודל הגופן 18')
  })

  it('גודל הגופן בקצה הטווח — הכפתור מושבת; בלי handler — לא מוצג', () => {
    setup({ fontSize: 40, onFontSizeChange: vi.fn(), fontSizeRange: { min: 12, max: 40, step: 1 } })
    expect(screen.getByRole('button', { name: 'הגדלת גופן הטקסט' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'הקטנת גופן הטקסט' })).toBeEnabled()
  })

  it('גודל הגופן — הקבוצה השנייה בשורה, מיד אחרי ביטול/ביצוע מחדש ולפני העיצוב', () => {
    setup({ fontSize: 18, onFontSizeChange: vi.fn() })
    const bar = screen.getByRole('group', { name: 'כלי הטקסט' })
    const pills = [...bar.children].filter((el) => !el.hasAttribute('inert') && el.className.includes('bg-(--tool-group-bg)'))
    expect(pills[0]).toContainElement(screen.getByRole('button', { name: 'ביטול' }))
    expect(pills[1]).toContainElement(screen.getByRole('button', { name: 'הקטנת גופן הטקסט' }))
    expect(pills[1]).toContainElement(screen.getByRole('button', { name: 'הגדלת גופן הטקסט' }))
    expect(pills[2]).toContainElement(screen.getByRole('button', { name: 'הדגשה' }))
  })

  it('בלי onFontSizeChange — אין כפתורי גודל', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'הגדלת גופן הטקסט' })).toBeNull()
  })

  it('יישור: כפתור אחד שפותח תפריט בחירה, עם הסימון של היישור הנוכחי', () => {
    const onTextAlignChange = vi.fn()
    setup({ textAlign: 'justify', onTextAlignChange })
    const trigger = screen.getByRole('button', { name: 'יישור הטקסט' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'יישור לימין' })).toBeNull()
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent.replace(/[a-z_]+/g, ''))).toEqual(['יישור לשני הצדדים', 'יישור לימין', 'יישור למרכז', 'יישור לשמאל'])
    expect(screen.getByRole('menuitemradio', { name: 'יישור לשני הצדדים' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'יישור לימין' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'יישור למרכז' }))
    expect(onTextAlignChange).toHaveBeenCalledWith('center')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('בלי קיצור לחלון הפקודות — "כל הפקודות" בלי קיצור קבוע בקוד', () => {
    setup({ shortcuts: {} })
    const more = screen.getByRole('button', { name: 'כל הפקודות' })
    expect(more).not.toHaveAttribute('aria-keyshortcuts')
    expect(screen.getAllByRole('tooltip', { hidden: true }).some((t) => t.textContent === 'כל הפקודות')).toBe(true)
  })
})

