import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Card, { cardClasses } from './Card'

describe('Card', () => {
  it('סטטי — div כברירת מחדל, בלי ריחוף ובלי טבעת פוקוס', () => {
    render(<Card data-testid="c">תוכן</Card>)
    const card = screen.getByTestId('c')
    expect(card.tagName).toBe('DIV')
    expect(card).toHaveAttribute('data-tone', 'default')
    expect(card).not.toHaveAttribute('data-interactive')
  })

  it('as + role עוברים הלאה (למשל li, או role="note")', () => {
    render(<ul><Card as="li" tone="tonal" role="note">הערה</Card></ul>)
    const note = screen.getByRole('note')
    expect(note.tagName).toBe('LI')
    expect(note).toHaveAttribute('data-tone', 'tonal')
  })

  it('href — קישור אינטראקטיבי (group, ריחוף, פוקוס); כתובת מלאה → <a>', () => {
    render(<Card href="https://example.com/file.zip">קובץ</Card>)
    const link = screen.getByRole('link', { name: 'קובץ' })
    expect(link).toHaveAttribute('href', 'https://example.com/file.zip')
    expect(link).not.toHaveAttribute('target')
    expect(link).toHaveAttribute('data-interactive')
    // group — כדי שפעולה בתוך הכרטיס (group-hover:) תגיב יחד איתו; זה החוזה מול הצרכנים
    expect(link).toHaveClass('group')
  })

  it('external — target=_blank ו-rel בטוח', () => {
    render(<Card href="https://play.google.com" external>חנות</Card>)
    expect(screen.getByRole('link', { name: 'חנות' })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('onClick — <button type="button"> שלם', () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>Windows</Card>)
    const button = screen.getByRole('button', { name: 'Windows' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveAttribute('data-interactive')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalled()
  })
})

describe('cardClasses', () => {
  it('כל גוון — צבעים רק מטוקני הכרטיס (בלי hex ובלי צבע Tailwind גולמי), וגוונים שונים נבדלים', () => {
    const tones = (['default', 'raised', 'tonal'] as const).map((tone) => cardClasses({ tone }))
    for (const c of tones) {
      expect(c).not.toMatch(/#[0-9a-f]{3,8}|bg-white|-(gray|neutral|stone)-\d/)
      expect(c).toMatch(/--card-/)
    }
    expect(new Set(tones).size).toBe(tones.length)
  })

  it('ריפוד ואינטראקטיביות מוסיפים מחלקות; ברירת המחדל — בלי ריפוד ובלי ריחוף', () => {
    const base = cardClasses()
    expect(cardClasses({ padding: 'md' })).not.toBe(base)
    expect(cardClasses({ padding: 'md' })).not.toBe(cardClasses({ padding: 'lg' }))
    expect(base).not.toMatch(/hover:/)
    expect(cardClasses({ interactive: true })).toMatch(/hover:/)
  })
})
