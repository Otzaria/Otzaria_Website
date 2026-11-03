import { describe, it, expect } from 'vitest'
import { BUTTON_SIZES, BUTTON_VARIANTS, DISABLED_CLASSES, buttonClasses, buttonIconClasses } from './buttonStyles'
import { FOCUS_RING } from './focusRing'

const tokens = (s: string) => s.split(' ')

describe('buttonClasses', () => {
  it('ברירת מחדל = filled בגודל md; טבעת הפוקוס המשותפת (FOCUS_RING) ורדיוס מטוקן הכפתור', () => {
    const c = buttonClasses()
    expect(c).toBe(buttonClasses({ variant: 'filled', size: 'md' }))
    expect(tokens(c)).toEqual(expect.arrayContaining(tokens(FOCUS_RING)))
    expect(c).toMatch(/--button-radius/)
  })

  it.each(BUTTON_VARIANTS.filter((v) => v !== 'donation'))('וריאנט %s — צבעים רק מטוקני הכפתור (בלי hex ובלי צבע Tailwind גולמי)', (variant) => {
    const c = buttonClasses({ variant })
    expect(c).not.toMatch(/#[0-9a-f]{3,8}|bg-white|text-white|-(gray|blue|red|neutral)-\d/)
    expect(c).toContain(`--button-${variant}-`)
  })

  it.each(BUTTON_SIZES)('גודל %s — גובה מטוקן הגובה של אותו גודל (מטרת מגע ≥44px)', (size) => {
    expect(buttonClasses({ size })).toMatch(new RegExp(`--button-height-${size}\\b`))
  })

  it('tool — 38px חזותית ומטרת מגע של 44px דרך ::before (כמו header)', () => {
    const c = buttonClasses({ size: 'tool', iconOnly: true })
    expect(c).toMatch(/min-w-\(--button-height-tool\)/)
    expect(c).toContain('before:h-[max(100%,var(--touch-target))]')
    expect(buttonIconClasses({ size: 'tool' })).toContain('--button-icon-size-tool')
  })

  it('tool ("אוורירי וקל") — שקט: צבע הכלים הרך, משקל רגיל, אייקון דק ורדיוס גלולה', () => {
    const c = tokens(buttonClasses({ variant: 'text', size: 'tool', iconOnly: true }))
    expect(c).toEqual(expect.arrayContaining(['text-(--tool-fg)', 'hover:bg-(--tool-bg-hover)', 'font-normal', 'rounded-(--button-radius-tool)']))
    expect(c).not.toContain('font-semibold')
    expect(c).not.toContain('font-medium')
    expect(c).not.toContain('text-(--button-text-fg)')
    expect(buttonIconClasses({ size: 'tool' })).toContain('font-(--tool-icon-weight)')
  })

  it('tool filled (הפעולה הראשית בשורת העורך) — באותו גובה, משקל medium', () => {
    const c = tokens(buttonClasses({ variant: 'filled', size: 'tool' }))
    expect(c).toEqual(expect.arrayContaining(['min-h-(--button-height-tool)', 'font-medium', 'bg-(--button-filled-bg)']))
  })

  it('pressed — מילוי secondary-container רך במקום הצבע השקט; לא משפיע על וריאנט אחר', () => {
    const on = tokens(buttonClasses({ variant: 'text', size: 'tool', pressed: true }))
    expect(on).toEqual(expect.arrayContaining(['bg-(--tool-bg-pressed)', 'text-(--tool-fg-pressed)']))
    expect(on).not.toContain('text-(--tool-fg)')
    expect(buttonClasses({ variant: 'filled', pressed: true })).toBe(buttonClasses({ variant: 'filled' }))
  })

  it('גדלים אחרים — בלי שינוי: semibold ורדיוס הכפתור', () => {
    const c = tokens(buttonClasses({ variant: 'text', size: 'sm' }))
    expect(c).toEqual(expect.arrayContaining(['font-semibold', 'rounded-(--button-radius)', 'text-(--button-text-fg)']))
  })

  it('גדלים שונים נותנים מחלקות שונות', () => {
    const all = BUTTON_SIZES.map((size) => buttonClasses({ size }))
    expect(new Set(all).size).toBe(all.length)
  })

  it('donation — רק מחלקת המותג (הצבע והפוקוס ב-.donation-button), בלי טוקני הכפתור הרגילים; lg שונה', () => {
    const c = buttonClasses({ variant: 'donation' })
    expect(tokens(c)).toContain('donation-button')
    expect(c).not.toMatch(/--button-/)
    expect(buttonClasses({ variant: 'donation', size: 'lg' })).not.toBe(c)
  })

  it('iconOnly — רוחב מינימלי מטוקן הגובה (ריבוע), ושונה מכפתור עם טקסט', () => {
    const c = buttonClasses({ iconOnly: true, size: 'sm' })
    expect(c).toMatch(/min-w-\(--button-height-sm\)/)
    expect(c).not.toBe(buttonClasses({ size: 'sm' }))
  })

  it('disabled מוסיף את מחלקות המצב המושבת; fullWidth משנה; className של הצרכן בסוף (גובר בסדר)', () => {
    const c = buttonClasses({ fullWidth: true, disabled: true, className: 'tall:px-9' })
    expect(tokens(c)).toEqual(expect.arrayContaining(tokens(DISABLED_CLASSES)))
    expect(c).not.toBe(buttonClasses({ disabled: true, className: 'tall:px-9' }))
    expect(c.endsWith('tall:px-9')).toBe(true)
  })
})

describe('buttonIconClasses', () => {
  it('גודל הגליף לפי גודל הכפתור, ו-iconSize מפורש גובר עליו', () => {
    expect(buttonIconClasses({ size: 'md' })).toMatch(/--button-icon-size-md/)
    expect(buttonIconClasses({ size: 'md', iconSize: 'lg' })).toBe(buttonIconClasses({ size: 'lg' }))
  })
  it('donation — מחלקת האייקון של כפתור התרומה, לא גודל מטוקן', () => {
    expect(buttonIconClasses({ variant: 'donation' })).not.toMatch(/--button-icon-size/)
  })
})
