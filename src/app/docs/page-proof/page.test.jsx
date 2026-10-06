import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import { GUIDE_PATH } from '@/lib/pageProof/helpTexts'
import { STAGE_TEXT } from '@/lib/pageProof/stages'

// דף ההנחיות למתנדבים (/docs/page-proof): דף אחד, ציבורי, עם איורים סינתטיים — "הקו האחיד" במקום תשובות פזורות
// באשכול. התוכן — הנוסח ששמור מדף הניהול (guideStore.loadGuide), ובלעדיו הנוסח המקורי. הכותרת והתחתית של האתר — מדומות.
vi.mock('@/components/layout/OtzariaSoftwareHeader', () => ({ default: () => null }))
vi.mock('@/components/layout/OtzariaSoftwareFooter', () => ({ default: () => null }))
const { loadGuideMock } = vi.hoisted(() => ({ loadGuideMock: vi.fn() }))
vi.mock('@/lib/pageProof/guideStore', () => ({ loadGuide: loadGuideMock }))

import PageProofGuidePage, { metadata } from './page'

const show = async () => render(await PageProofGuidePage())

beforeEach(() => {
  loadGuideMock.mockReset().mockResolvedValue(null)
})

describe('דף ההנחיות להגהת עמודים', { timeout: 20000 }, () => {
  it('הכתובת שהעורך מקשר אליה היא הדף הזה', () => {
    expect(GUIDE_PATH).toBe('/docs/page-proof')
    expect(metadata.title).toMatch(/הנחיות להגהת עמודים/)
  })

  it('הנוסח המקורי: שני השלבים, הקישורים והזמנים — עם האיורים, בשם "פגם בדפוס", ותוכן-הדף מהפרקים', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 1, name: 'הנחיות להגהת עמודים' })).toBeInTheDocument()
    for (const h of ['שלב 1: המבנה', 'שלב 2: הטקסט', 'קישורים', 'זמנים', 'שאלות']) {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(h) })).toBeInTheDocument()
      expect(within(screen.getByRole('navigation', { name: 'תוכן הדף' })).getByRole('link', { name: h })).toBeInTheDocument()
    }
    // האיורים: שני טורים, ריהוט, פיצול, מספר-סעיף — עם תיאור לקוראי-מסך
    await waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(4))
    for (const f of screen.getAllByRole('img')) expect(f).toHaveAccessibleName()
    expect(screen.getByRole('img', { name: /^עמוד בשני טורים/ })).toBeInTheDocument()

    const body = document.body.textContent
    expect(body).toMatch(/שני טורים = שתי מסגרות/)
    expect(body).toMatch(/גם להם מציירים מסגרת "ריהוט הדף"/)
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
    expect(body).toMatch(/נעול עד שיזוהה/)
    expect(body).not.toMatch(/לספר בלבד/)
    expect(body).not.toMatch(/\[\[/)
  })

  it('שמות הכפתורים של שני השלבים — אותו נוסח כמו בעורך (STAGE_TEXT), ו"החזר למקור" לתיקון של מתנדב קודם', async () => {
    await show()
    const body = document.body.textContent
    for (const t of [STAGE_TEXT.finish, STAGE_TEXT.finishRecut, STAGE_TEXT.finishAsk, STAGE_TEXT.skip, STAGE_TEXT.back]) expect(body).toContain(`"${t}"`)
    expect(body).toMatch(/"הגשת העמוד" — משלב הטקסט/)
    expect(body).toMatch(/"החזר למקור"/)
  })

  it('קישור לדף ההגהה', async () => {
    await show()
    const sec = screen.getByRole('heading', { level: 2, name: /שאלות/ }).closest('section')
    expect(within(sec).getByRole('link', { name: 'לדף הגהת העמודים' })).toHaveAttribute('href', '/library/page-proof')
  })

  it('נוסח שנשמר מדף הניהול — מוצג במקום המקורי, מנוקה ועם הקודים', async () => {
    loadGuideMock.mockResolvedValue({
      html: '<section id="x"><h2>פרק חדש</h2><p>לחצו "[[כפתור:finish]]".<script>window.bad = 1</script></p>[[איור:ריהוט]]</section>',
      byName: 'מנהלת',
    })
    await show()
    expect(screen.getByRole('heading', { level: 2, name: 'פרק חדש' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: /שלב 1: המבנה/ })).not.toBeInTheDocument()
    expect(document.body.textContent).toContain(`"${STAGE_TEXT.finish}"`)
    expect(document.querySelector('script')).toBeNull()
    await waitFor(() => expect(screen.getByRole('img', { name: /ראש העמוד ותחתיתו/ })).toBeInTheDocument())
  })
})
