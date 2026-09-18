import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('button', { name: /קח לטיפול/ })).toBeTruthy()
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
