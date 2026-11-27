import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VerifyAgentPanel from './VerifyAgentPanel'

const fmtAge = (s) => `${s} שניות`
const jobs = { pending: 3, leased: 1, leaseExpired: 1, done: 7, failed: 2, cancelled: 4 }

describe('VerifyAgentPanel', () => {
  it('משיכה: אופן ההעברה, הסוכן, גרסתו, "נראה לאחרונה" וספירת המשימות', () => {
    render(<VerifyAgentPanel fmtAge={fmtAge} verifyAgent={{ transport: 'pull', jobs, agent: { agentId: 'verify-1', version: '1.0.3', lastSeenAt: '2026-11-25T10:00:00Z', ageSeconds: 40, stale: false } }} />)
    expect(screen.getByText(/משיכה — שירות הבדיקה מושך/)).toBeInTheDocument()
    expect(screen.getByText('verify-1')).toBeInTheDocument()
    expect(screen.getByText('1.0.3')).toBeInTheDocument()
    expect(screen.getByText('לפני 40 שניות')).not.toHaveClass('text-danger-700')
    expect(screen.getByText('ממתינות').nextSibling).toHaveTextContent('3')
    expect(screen.getByText('מהן שה-lease שלהן פג').nextSibling).toHaveTextContent('1')
  })

  it('סוכן שלא נראה מעולם מסומן; בדחיפה אין שורת סוכן', () => {
    const { rerender } = render(<VerifyAgentPanel fmtAge={fmtAge} verifyAgent={{ transport: 'pull', jobs, agent: { agentId: 'verify-1', version: null, lastSeenAt: null, ageSeconds: null, stale: true } }} />)
    expect(screen.getByText('מעולם לא')).toHaveClass('text-danger-700')
    rerender(<VerifyAgentPanel fmtAge={fmtAge} verifyAgent={{ transport: 'push', jobs, agent: null }} />)
    expect(screen.getByText(/דחיפה — האתר פונה/)).toBeInTheDocument()
    expect(screen.queryByText(/נראה לאחרונה/)).toBeNull()
  })

  it('הבדיקה כבויה: "כבוי" (עם הסיבה כשהיא מוסיפה מידע) ולא תיאור של דחיפה; הסוכן עדיין מוצג במשיכה', () => {
    const { rerender } = render(<VerifyAgentPanel fmtAge={fmtAge} verifyAgent={{ transport: 'push', enabled: false, disabledReason: 'service_disabled', jobs, agent: null }} />)
    expect(screen.getByText('כבוי')).toBeInTheDocument()
    expect(screen.queryByText(/דחיפה/)).toBeNull()
    rerender(<VerifyAgentPanel fmtAge={fmtAge} verifyAgent={{ transport: 'pull', enabled: false, disabledReason: 'service_paused', jobs, agent: { agentId: 'verify-1', version: null, lastSeenAt: '2026-11-25T10:00:00Z', ageSeconds: 5, stale: false } }} />)
    expect(screen.getByText(/השירות הושהה/)).toBeInTheDocument()
    expect(screen.queryByText(/משיכה — /)).toBeNull()
    expect(screen.getByText('verify-1')).toBeInTheDocument()
  })

  it('בלי נתונים (שרת ישן) — לא מוצג כלום', () => {
    const { container } = render(<VerifyAgentPanel fmtAge={fmtAge} verifyAgent={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
