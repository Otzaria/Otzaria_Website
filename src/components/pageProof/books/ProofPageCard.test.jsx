import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ProofPageCard from './ProofPageCard'
import { formatSince, formatUntil } from '@/lib/pageProof/dates'

// כרטיס עמוד ברשת-העמודים: תווית-המצב והכפתור הנכון לכל מצב, ותפיסה/שחרור
// שעוברים קודם בחלון-שאלה (useDialog מדומה — הכרטיס לא קורא ל-onClaim לפני
// שהמשתמש אישר).

const { showConfirm } = vi.hoisted(() => ({ showConfirm: vi.fn() }))
vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({ showConfirm, showAlert: vi.fn() }),
}))

const NOW = new Date('2026-09-29T12:00:00Z')
const HOUR = 3600 * 1000

const page = (over = {}) => ({
  id: '64b7f0c2a1b2c3d4e5f60001',
  page: 12,
  seq: 2,
  revision: 1,
  lineCount: 30,
  required: 1,
  state: 'open',
  claimer: null,
  leasedUntil: null,
  submittedAt: null,
  ...over,
})

const renderCard = (over = {}, props = {}) => {
  const handlers = { onClaim: vi.fn(), onRelease: vi.fn(), onPreview: vi.fn() }
  const p = page(over)
  render(<ProofPageCard page={p} now={NOW} {...handlers} {...props} />)
  return { p, ...handlers }
}

const EDITOR = '/library/page-proof?page=64b7f0c2a1b2c3d4e5f60001'

beforeEach(() => {
  showConfirm.mockReset()
})

describe('ProofPageCard — תווית וכפתור לפי מצב', () => {
  it('פנוי: "תפוס ועבוד", בלי קישור לעורך ובלי שחרור', () => {
    renderCard()
    expect(screen.getByText('עמוד 12')).toBeInTheDocument()
    expect(screen.getByText('פנוי')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'תפוס ועבוד' })).toBeEnabled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /שחרור/ })).not.toBeInTheDocument()
  })

  it('בטיפולך: "המשך לעבוד" לעורך, "משויך אליך", עד מתי העמוד שמור לך (כמה נשאר — בריחוף), וכפתור שחרור', () => {
    const until = new Date(NOW.getTime() + 5.5 * HOUR)
    renderCard({ state: 'mine', leasedUntil: until.toISOString() })
    expect(screen.getByText('בטיפולך')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'המשך לעבוד' })).toHaveAttribute('href', EDITOR)
    expect(screen.getByText('משויך אליך')).toBeInTheDocument()
    const kept = screen.getByText(`שמור לך עד ${formatUntil(until, NOW)}`)
    expect(kept).toHaveAttribute('title', 'עוד 5 שעות')
    expect(screen.getByRole('button', { name: 'שחרור עמוד 12' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'תפוס ועבוד' })).not.toBeInTheDocument()
  })

  it('תפוס: שם המתנדב שמחזיק בו ועד מתי, והסבר במקום כפתור', () => {
    const until = new Date(NOW.getTime() + 2 * HOUR)
    renderCard({ state: 'taken', claimer: 'ראובן', leasedUntil: until.toISOString() })
    expect(screen.getByText(`שמור עד ${formatUntil(until, NOW)}`)).toBeInTheDocument()
    expect(screen.getByText('תפוס')).toBeInTheDocument()
    expect(screen.getByText('ע"י ראובן')).toBeInTheDocument()
    expect(screen.getByText('תפוס בידי מתנדב אחר')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /תפוס/ })).not.toBeInTheDocument()
  })

  it('הוגש: "צפייה" לעורך, ו"הוגש — ממתין לבדיקת מנהל (מאז …)" (התאריך העברי ולפני כמה ימים — בריחוף)', () => {
    const at = new Date(NOW.getTime() - 50 * HOUR).toISOString()
    renderCard({ state: 'submitted', submittedAt: at })
    expect(screen.getByText('הוגש')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'צפייה' })).toHaveAttribute('href', EDITOR)
    const waiting = screen.getByText(`הוגש — ממתין לבדיקת מנהל (מאז ${formatSince(at, NOW)})`)
    expect(waiting).toHaveAttribute('title', expect.stringMatching(/^הוגש .+, לפני 2 ימים$/))
  })

  it('אושר: מתי הוגש (תאריך עברי ולפני כמה ימים)', () => {
    renderCard({ state: 'approved', submittedAt: new Date(NOW.getTime() - 50 * HOUR).toISOString() })
    expect(screen.getByText(/^הוגש .+, לפני 2 ימים$/)).toBeInTheDocument()
  })

  it('אושר: "צפייה"', () => {
    renderCard({ state: 'approved', submittedAt: NOW.toISOString() })
    expect(screen.getByText('אושר')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'צפייה' })).toHaveAttribute('href', EDITOR)
  })

  it('דרוש בודק נוסף: "תפוס כבודק שני"', () => {
    renderCard({ state: 'second', required: 2 })
    expect(screen.getByText('דרוש בודק נוסף')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'תפוס כבודק שני' })).toBeEnabled()
  })

  it('ממתין לזיהוי-מחדש: הסבר מושבת, בלי פעולה', () => {
    renderCard({ state: 'recut' })
    expect(screen.getAllByText('ממתין לזיהוי-מחדש')).toHaveLength(2) // התווית וההסבר
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /תפוס/ })).not.toBeInTheDocument()
  })

  it('הושלם: רק התווית', () => {
    renderCard({ state: 'done' })
    expect(screen.getByText('הושלם')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1) // רק ההגדלה
  })

  it('ספר מושהה: אין תפיסה חדשה', () => {
    renderCard({}, { canClaimNew: false })
    expect(screen.getByText('הספר מושהה')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'תפוס ועבוד' })).not.toBeInTheDocument()
  })

  it('תצוגה צפופה: תוויות קצרות (המלאה ב-title) ובלי שורת-הזמן (עד מתי — בריחוף)', () => {
    const until = new Date(NOW.getTime() + 2 * HOUR)
    renderCard({ state: 'taken', claimer: 'ראובן', leasedUntil: until.toISOString() }, { compact: true })
    expect(screen.getByText('ע"י ראובן')).toHaveAttribute('title', `ע"י ראובן · שמור עד ${formatUntil(until, NOW)}`)
    expect(screen.queryByText(/^שמור /)).not.toBeInTheDocument()
    expect(screen.getAllByText('תפוס')).toHaveLength(2) // התווית וההסבר המקוצר
    expect(screen.queryByText('תפוס בידי מתנדב אחר')).not.toBeInTheDocument()
  })

  it('תצוגה צפופה: "בודק נוסף" ו"בודק שני"', () => {
    renderCard({ state: 'second', required: 2 }, { compact: true })
    expect(screen.getByText('בודק נוסף')).toHaveAttribute('title', 'דרוש בודק נוסף')
    expect(screen.getByRole('button', { name: 'בודק שני' })).toHaveAttribute('title', 'תפוס כבודק שני')
  })

  it('עמוד שחזר מזיהוי-מחדש מסומן "מעבר שני"', () => {
    renderCard({ revision: 2 })
    expect(screen.getByText('מעבר שני')).toBeInTheDocument()
  })
})

describe('ProofPageCard — תמונה, תפיסה ושחרור', () => {
  it('תמונה ממוזערת עם גרסת-העמוד ומספר העמוד; לחיצה ← הגדלה', () => {
    const { p, onPreview } = renderCard({ revision: 3 })
    const img = screen.getByRole('img', { name: 'עמוד 12' })
    expect(img).toHaveAttribute('src', '/api/page-proof/pages/64b7f0c2a1b2c3d4e5f60001/thumb?v=3')
    expect(img).toHaveAttribute('loading', 'lazy')
    fireEvent.click(screen.getByRole('button', { name: 'הגדלת עמוד 12' }))
    expect(onPreview).toHaveBeenCalledWith(p)
  })

  it('תמונה שלא נטענה ← סמל במקומה', () => {
    renderCard()
    fireEvent.error(screen.getByRole('img', { name: 'עמוד 12' }))
    expect(screen.queryByRole('img', { name: 'עמוד 12' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 'הגדלת עמוד 12' })).getByText('description')).toBeInTheDocument()
  })

  it('"תפוס ועבוד" שואל קודם, ורק אישור קורא ל-onClaim', () => {
    const { p, onClaim } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'תפוס ועבוד' }))
    expect(showConfirm).toHaveBeenCalledTimes(1)
    const [title, message, onConfirm, confirmText, cancelText] = showConfirm.mock.calls[0]
    expect(title).toBe('עבודה על עמוד 12')
    expect(message).toMatch(/48 שעות/)
    expect([confirmText, cancelText]).toEqual(['תפוס ועבוד', 'ביטול'])
    expect(onClaim).not.toHaveBeenCalled()
    onConfirm()
    expect(onClaim).toHaveBeenCalledWith(p)
  })

  it('בודק שני — שאלה עם הסבר על הבדיקה הכפולה', () => {
    const { onClaim } = renderCard({ state: 'second', required: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'תפוס כבודק שני' }))
    const [title, message, onConfirm, confirmText] = showConfirm.mock.calls[0]
    expect(title).toBe('בדיקה שנייה של עמוד 12')
    expect(message).toMatch(/בדיקה כפולה/)
    expect(confirmText).toBe('תפוס כבודק שני')
    onConfirm()
    expect(onClaim).toHaveBeenCalledTimes(1)
  })

  it('ביטול בחלון-השאלה ← לא תופסים', () => {
    const { onClaim } = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'תפוס ועבוד' }))
    expect(onClaim).not.toHaveBeenCalled()
  })

  it('שחרור שואל קודם, ואינו פותח את ההגדלה', () => {
    const { p, onRelease, onPreview } = renderCard({ state: 'mine', leasedUntil: new Date(NOW.getTime() + HOUR).toISOString() })
    fireEvent.click(screen.getByRole('button', { name: 'שחרור עמוד 12' }))
    expect(onPreview).not.toHaveBeenCalled()
    const [title, message, onConfirm, confirmText] = showConfirm.mock.calls[0]
    expect(title).toBe('שחרור עמוד')
    expect(message).toMatch(/יחזור למאגר/)
    expect(confirmText).toBe('שחרר')
    expect(onRelease).not.toHaveBeenCalled()
    onConfirm()
    expect(onRelease).toHaveBeenCalledWith(p)
  })

  it('בזמן פעולה (busy) הכפתורים מושבתים', () => {
    renderCard({}, { busy: true })
    expect(screen.getByRole('button', { name: 'תפוס ועבוד' })).toBeDisabled()
  })
})
