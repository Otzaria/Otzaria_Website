import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DisplaySettingsSheet, { CONFUSABLE_SAMPLE } from './DisplaySettingsSheet'
import { DEFAULT_EDITOR_PREFS, mergeEditorPrefs } from '@/hooks/editorPrefs'

const sample = () => screen.getByLabelText('דוגמה: אותיות דומות')

function Harness({ onClose = () => {}, spy = () => {} }) {
  const [prefs, setPrefs] = useState(DEFAULT_EDITOR_PREFS)
  return (
    <DisplaySettingsSheet
      value={prefs}
      onChange={(patch) => { spy(patch); setPrefs((p) => mergeEditorPrefs(p, patch)) }}
      onClose={onClose}
    />
  )
}

describe('DisplaySettingsSheet', () => {
  it('גיליון לא מודאלי עם שם; הפוקוס נכנס אליו', () => {
    render(<Harness />)
    const sheet = screen.getByRole('dialog', { name: 'תצוגה ונוחות עיניים' })
    expect(sheet).toHaveAttribute('aria-modal', 'false')
    expect(sheet).toHaveFocus()
  })

  it('ערכה, גופן וריווח — radiogroup מבוקרים', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    expect(screen.getByRole('radiogroup', { name: 'ערכת צבעים' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'ערב' }))
    expect(spy).toHaveBeenLastCalledWith({ theme: 'evening' })
    expect(screen.getByRole('radio', { name: 'ערב' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'נוטו סנס עברי' }))
    expect(spy).toHaveBeenLastCalledWith({ fontFamily: 'noto' })
    expect(sample()).toHaveStyle({ fontFamily: 'var(--font-noto-hebrew), var(--font-sans)' })
    fireEvent.click(screen.getByRole('radio', { name: 'Open Sans' }))
    expect(spy).toHaveBeenLastCalledWith({ fontFamily: 'openSans' })
    expect(sample()).toHaveStyle({ fontFamily: 'var(--font-open-sans), var(--font-noto-hebrew), var(--font-sans)' })
    expect(screen.getByRole('radio', { name: 'Open Sans' })).toHaveAccessibleDescription('בלי טעמים')
    fireEvent.click(screen.getByRole('radio', { name: 'פרנק ריהל' }))
    expect(sample()).toHaveStyle({ fontFamily: 'var(--font-frank)' })
    fireEvent.click(screen.getByRole('radio', { name: 'גלישה רגילה' }))
    expect(spy).toHaveBeenLastCalledWith({ lineSpacing: 'fixed' })
  })

  it('ריווח שורות: ארבע דרגות, "מרווח" כברירת מחדל; נפרד מסידור השורות', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    const group = screen.getByRole('radiogroup', { name: 'ריווח שורות' })
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['צפוף', 'רגיל', 'מרווח', 'מרווח מאוד'])
    expect(within(group).getByRole('radio', { name: 'מרווח' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(group).getByRole('radio', { name: 'מרווח מאוד' }))
    expect(spy).toHaveBeenLastCalledWith({ lineHeight: 'loose' })
    expect(within(group).getByRole('radio', { name: 'מרווח מאוד' })).toHaveAttribute('aria-checked', 'true')
    // סידור השורות לא זז
    expect(screen.getByRole('radio', { name: 'שורה מול שורה' })).toHaveAttribute('aria-checked', 'true')
  })

  it('רווח בין פסקאות: רק בתצוגה המעוצבת, עם הסבר', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    const group = screen.getByRole('radiogroup', { name: 'רווח בין פסקאות' })
    expect(screen.getByText('בתצוגה המעוצבת בלבד')).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: 'גדול' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(group).getByRole('radio', { name: 'בינוני' }))
    expect(spy).toHaveBeenLastCalledWith({ paraSpacing: 'medium' })
    fireEvent.click(screen.getByRole('radio', { name: 'קוד' }))
    expect(screen.queryByRole('radiogroup', { name: 'רווח בין פסקאות' })).not.toBeInTheDocument()
  })

  it('גופן: קבוצות "עם תגים" ו"בלי תגים", ובכל אפשרות דוגמה בגופן עצמו', () => {
    render(<Harness />)
    const picker = screen.getByRole('radiogroup', { name: 'גופן' })
    expect(screen.getByRole('group', { name: 'עם תגים' })).toContainElement(screen.getByRole('radio', { name: 'פרנק ריהל' }))
    const sans = screen.getByRole('group', { name: 'בלי תגים — נוח למסך' })
    // הסדר בקבוצה: Sans Serif, אסיסטנט, נוטו, ואחריהם IBM Plex, Google Sans, Open Sans
    const sansOrder = ['Sans Serif', 'אסיסטנט', 'נוטו סנס עברי', 'IBM Plex', 'Google Sans', 'Open Sans']
    expect(within(sans).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(sansOrder)
    expect(picker.querySelectorAll('[data-font-preview]')).toHaveLength(7)
    // Sans Serif של המערכת — ראשון בקבוצת "בלי תגים"
    expect(within(sans).getAllByRole('radio')[0]).toHaveAccessibleName('Sans Serif')
    expect(screen.getAllByText(CONFUSABLE_SAMPLE).length).toBeGreaterThanOrEqual(7)
  })

  it('מחוון הגודל משנה את שורת הדוגמה', () => {
    render(<Harness />)
    const size = screen.getByRole('slider', { name: 'גודל' })
    expect(size).toHaveAttribute('aria-valuetext', '18 פיקסלים')
    fireEvent.change(size, { target: { value: '22' } })
    expect(sample()).toHaveStyle({ fontSize: '22px' })
    fireEvent.change(screen.getByRole('slider', { name: 'בהירות' }), { target: { value: '80' } })
    expect(screen.getByRole('slider', { name: 'בהירות' })).toHaveAttribute('aria-valuetext', '80%')
  })

  it('עוצמת הסימון — "חזק" כברירת מחדל, אפשר לעבור ל"רגיל"', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    expect(screen.getByRole('radiogroup', { name: 'עוצמת הסימון' })).toBeInTheDocument()
    const group = screen.getByRole('radiogroup', { name: 'עוצמת הסימון' })
    expect(within(group).getByRole('radio', { name: 'חזק' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(group).getByRole('radio', { name: 'רגיל' }))
    expect(spy).toHaveBeenLastCalledWith({ highlightStrength: 'normal' })
    expect(within(group).getByRole('radio', { name: 'רגיל' })).toHaveAttribute('aria-checked', 'true')
  })

  it('מתגי מעקב ומנוחה', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    // רצועת השורה המוגדלת הוסרה (הרכיב נמחק) — אין מתג שלא עושה כלום
    expect(screen.queryByRole('switch', { name: 'רצועת שורה מוגדלת' })).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'גלילה מתואמת' }))
    expect(spy).toHaveBeenLastCalledWith({ followScroll: false })
    // תזכורת המנוחה כבויה כברירת מחדל
    expect(screen.getByRole('switch', { name: 'תזכורת כל 20 דקות' })).toHaveAttribute('aria-checked', 'false')
  })

  it('עימוד ספר: שני מתגים כבויים כברירת מחדל בתצוגה המעוצבת, נעלמים בתצוגת "קוד"', () => {
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    const win = screen.getByRole('switch', { name: /חלון בתחילת פסקה/ })
    expect(win).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: /סיום משולש/ })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(win)
    expect(spy).toHaveBeenLastCalledWith({ paraWindow: true })
    expect(win).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'קוד' }))
    expect(screen.queryByRole('switch', { name: /חלון בתחילת פסקה/ })).toBeNull()
  })

  it('Esc וכפתור הסגירה סוגרים; הפוקוס חוזר למי שפתח', () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(<Harness onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
