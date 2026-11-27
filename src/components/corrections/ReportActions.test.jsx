import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportActions from './ReportActions'

const HOUR = 3_600_000
const detail = (manual) => ({
  report: { state: 'open', generation: 1, currentRevision: 0, proposals: [], manual },
  source: null,
  permissions: {},
})
const renderWith = (manual) => render(<ReportActions detail={detail(manual)} meId="me" busy={false} run={async () => true} />)

describe('מצב השיוך בדיווח שאינו בטיפולי', () => {
  it('בלי שיוך', () => {
    renderWith({ status: 'queued' })
    expect(screen.getByText('הדיווח אינו משויך למטפל.')).toBeTruthy()
  })

  it('שיוך בתוקף של מטפל אחר', () => {
    renderWith({ status: 'claimed', assignee: 'other', assigneeName: 'ראובן', leaseExpiresAt: new Date(Date.now() + HOUR).toISOString() })
    expect(screen.getByText(/בטיפול של/)).toBeTruthy()
    expect(screen.getByText('ראובן')).toBeTruthy()
  })

  it('שיוך שפג מוצג במפורש, לא כ"אינו משויך"', () => {
    renderWith({ status: 'claimed', assignee: 'other', assigneeName: 'ראובן', leaseExpiresAt: new Date(Date.now() - HOUR).toISOString() })
    expect(screen.getByText(/הטיפול של/).textContent).toMatch(/פג ב-/)
    expect(screen.queryByText('הדיווח אינו משויך למטפל.')).toBeNull()
    // אין "קח לטיפול" נפרד (5898a91): הפעולות מוצגות, וכל פעולה לוקחת את הדיווח קודם.
    expect(screen.getByText('כל פעולה תשייך אותו אליך.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /קח לטיפול/ })).toBeNull()
    expect(screen.getByRole('button', { name: /עריכה ואז אישור/ }).disabled).toBe(false)
    // "שחרור" רק כשהדיווח בטיפולך
    expect(screen.queryByRole('button', { name: /שחרור/ })).toBeNull()
  })

  it('שיוך בתוקף של מטפל אחר — בלי פעולות', () => {
    renderWith({ status: 'claimed', assignee: 'other', assigneeName: 'ראובן', leaseExpiresAt: new Date(Date.now() + HOUR).toISOString() })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('הסבר לאישור כבוי', () => {
  const mine = { status: 'claimed', assignee: 'me', assigneeName: 'אני', leaseExpiresAt: new Date(Date.now() + HOUR).toISOString() }

  it('דיווח חופשי: האישור כבוי ומוסבר שיש לערוך', () => {
    renderWith(mine)
    expect(screen.getByRole('button', { name: /^check אישור$/ }).disabled).toBe(true)
    expect(screen.getByText(/דיווח חופשי — אין הצעת תיקון/)).toBeTruthy()
  })

  it('יש הצעה אך המקור לא אותר: מוסבר לבחור מקור', () => {
    const d = detail(mine)
    d.report.proposals = [{ revision: 0, newLine: 'חדש', originalLine: 'ישן' }]
    render(<ReportActions detail={d} meId="me" busy={false} run={async () => true} />)
    expect(screen.getByText(/המקור לא אותר בוודאות/)).toBeTruthy()
  })
})

describe('דיווח שאושר ונפתח לו PR', () => {
  const renderPr = (publish) => {
    const d = detail({ status: 'none' })
    d.report.approval = { byName: 'ראובן' }
    d.report.publish = { status: 'pr_opened', prUrl: 'https://github.com/Otzaria/otzaria-library/pull/7', prNumber: 7, ...publish }
    render(<ReportActions detail={d} meId="me" busy={false} run={async () => true} />)
    fireEvent.click(screen.getByRole('button', { name: /דחייה/ }))
  }

  it('PR פתוח: הדחייה סוגרת את ה-PR', () => {
    renderPr({})
    expect(screen.getByText(/ונפתח עבורו/)).toBeTruthy()
    expect(screen.getByText(/הדחייה תסגור את PR #7 ב-GitHub/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'דחייה וסגירת ה-PR' })).toBeTruthy()
  })

  it('PR שנסגר בלי מיזוג: ממתינים לקליטה ב-main, והדחייה רק מוסיפה הערה', () => {
    renderPr({ prClosedAt: new Date().toISOString(), absorptionDeadline: '2026-12-01T10:00:00Z', prCloseComment: { body: 'נקלט בקומיט מקומי' } })
    expect(screen.getByText('נקלט בקומיט מקומי')).toBeTruthy()
    expect(screen.getByText(/נבדק שוב בכל אצווה עד/)).toBeTruthy()
    expect(screen.getByText(/נסגר בלי מיזוג; הדיווח ייסגר אוטומטית כשהתיקון יימצא ב-main/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'PR #7' })).toBeTruthy()
    expect(screen.getByText(/כהערה ב-PR #7 \(שכבר נסגר\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'דחייה סופית' })).toBeTruthy()
  })
})

describe('הערת הסגירה של מנהל הספרייה בטיפול הידני', () => {
  it('מוצגת כשה-PR נסגר והדיווח חזר לתור', () => {
    const d = detail({ status: 'queued', handoffReason: 'pr_closed_not_absorbed' })
    d.report.publish = { status: 'failed', prNumber: 7, prCloseComment: { body: 'לא שולב — הנוסח המקורי נכון' } }
    render(<ReportActions detail={d} meId="me" busy={false} run={async () => true} />)
    expect(screen.getByText(/הערת מנהל הספרייה בסגירת ה-PR/)).toBeTruthy()
    expect(screen.getByText('לא שולב — הנוסח המקורי נכון')).toBeTruthy()
    expect(screen.queryByText(/נבדק שוב בכל אצווה/)).toBeNull()
  })

  it('בלי הערה — בלי הקופסה', () => {
    renderWith({ status: 'queued' })
    expect(screen.queryByText(/הערת מנהל הספרייה/)).toBeNull()
  })
})
