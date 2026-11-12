import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClaimQuotaBadge from './ClaimQuotaBadge'

const policy = (myActivePages, extra = {}) => ({ maxActivePages: 5, releaseAfterDays: 5, myActivePages, exempt: false, ...extra })

describe('ClaimQuotaBadge', () => {
  it('מציג מונה והסבר שחרור כשיש מקום', () => {
    render(<ClaimQuotaBadge policy={policy(3)} />)
    expect(screen.getByText('בטיפולך: 3 מתוך 5 עמודים')).toBeTruthy()
    expect(screen.getByText('עמוד שלא נערך 5 ימים משתחרר אוטומטית.')).toBeTruthy()
  })

  it('במכסה מלאה — הודעת מכסה והנחיה', () => {
    render(<ClaimQuotaBadge policy={policy(5)} />)
    expect(screen.getByText('הגעת למכסה: 5 מתוך 5 עמודים בטיפולך')).toBeTruthy()
    expect(screen.getByText(/סיים או שחרר עמוד קיים/)).toBeTruthy()
  })

  it('לא מוצג למנהל / ספר אישי / בלי נתונים', () => {
    const { container: a } = render(<ClaimQuotaBadge policy={policy(2, { exempt: true })} />)
    const { container: b } = render(<ClaimQuotaBadge policy={policy(null)} />)
    const { container: c } = render(<ClaimQuotaBadge policy={null} />)
    expect(a.innerHTML + b.innerHTML + c.innerHTML).toBe('')
  })
})
