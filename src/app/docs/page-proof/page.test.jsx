import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GUIDE_PATH } from '@/lib/pageProof/helpTexts'
import { STAGE_TEXT } from '@/lib/pageProof/stages'

// דף ההנחיות למתנדבים (/docs/page-proof): דף אחד, ציבורי, עם איורים סינתטיים — "הקו האחיד" במקום תשובות פזורות
// באשכול. הכותרת והתחתית של האתר — מדומות (נבדקות במקום אחר).
vi.mock('@/components/layout/OtzariaSoftwareHeader', () => ({ default: () => null }))
vi.mock('@/components/layout/OtzariaSoftwareFooter', () => ({ default: () => null }))

import PageProofGuidePage, { metadata } from './page'

describe('דף ההנחיות להגהת עמודים', () => {
  it('הכתובת שהעורך מקשר אליה היא הדף הזה', () => {
    expect(GUIDE_PATH).toBe('/docs/page-proof')
    expect(metadata.title).toMatch(/הנחיות להגהת עמודים/)
  })

  it('שני השלבים, הקישורים והזמנים — עם האיורים, בשם "פגם בדפוס"', () => {
    render(<PageProofGuidePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'הנחיות להגהת עמודים' })).toBeInTheDocument()
    for (const h of ['שלב 1: המבנה', 'שלב 2: הטקסט', 'קישורים', 'זמנים', 'שאלות']) {
      expect(screen.getByRole('heading', { level: 2, name: h })).toBeInTheDocument()
    }
    // האיורים: שני טורים, ריהוט, פיצול, מספר-סעיף — עם תיאור לקוראי-מסך
    const figs = screen.getAllByRole('img')
    expect(figs.length).toBeGreaterThanOrEqual(4)
    for (const f of figs) expect(f).toHaveAccessibleName()
    expect(screen.getByRole('img', { name: /^עמוד בשני טורים/ })).toBeInTheDocument()

    const body = document.body.textContent
    expect(body).toMatch(/שני טורים = שתי מסגרות/)
    expect(body).toMatch(/כותרת פרק או סעיף \(גם בתוך ההערות\) — לא מסגרת נפרדת/)
    expect(body).toMatch(/בסגנון-הפסקה "כותרת"/)
    expect(body).toMatch(/מספר סעיף.*מודגש \(B\), בלי גרשיים/)
    expect(body).toMatch(/פגם בדפוס/)
    expect(body).toMatch(/כשהמצב דולק, כל תיקון-טקסט נכנס לספר, אבל השורה לא משמשת לאימון המחשב/)
    expect(body).toMatch(/בטל קישור/)
    expect(body).toMatch(/החזר לאוטומטי/)
    expect(body).toMatch(/48 שעות.*\(שבת וחג אינם נספרים\)/)
    expect(body).toMatch(/הוגש — ממתין לבדיקת מנהל/)
    expect(body).toMatch(/בלי סימונים/)
    expect(body).not.toMatch(/לספר בלבד/)
  })

  it('שמות הכפתורים של שני השלבים — אותו נוסח כמו בעורך (STAGE_TEXT), ו"החזר למקור" לתיקון של מתנדב קודם', () => {
    render(<PageProofGuidePage />)
    const body = document.body.textContent
    for (const t of [STAGE_TEXT.finish, STAGE_TEXT.finishRecut, STAGE_TEXT.skip, STAGE_TEXT.back]) expect(body).toContain(`"${t}"`)
    expect(body).toMatch(/"הגשת העמוד" — משלב הטקסט/)
    expect(body).toMatch(/"החזר למקור"/)
  })

  it('קישור לדף ההגהה — בלי prefetch (הדף דורש התחברות)', () => {
    render(<PageProofGuidePage />)
    const sec = screen.getByRole('heading', { level: 2, name: 'שאלות' }).closest('section')
    expect(within(sec).getByRole('link', { name: 'לדף הגהת העמודים' })).toHaveAttribute('href', '/library/page-proof')
  })
})
