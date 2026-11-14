import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi } from '../testing/fakeApi'

// דף הבית: בלי גישה — רק ההודעה ו"בקשת גישה" (חלון עם הסבר וטופס); בקשה ממתינה — בלי כפתור;
// עם גישה — שלושת החלקים (בלי משפט-פתיחה) ו"ההגהות שלי" לפי סוג.

import HubScreen from './HubScreen'

afterEach(() => vi.unstubAllGlobals())

const SECTIONS = {
  ocr: { pool: 41280, round: { total: 30, open: 12, done: false } },
  router: { pool: 18900, round: { total: 0, open: 0, done: true } },
  frames: { available: 9, partial: 2, mine: 0 },
}
const zero = { saved: 0, pending: 0, approved: 0, unchanged: 0, rejected: 0, match: null }
const STATS = { ocr: { ...zero, saved: 1240, pending: 150, approved: 1062, rejected: 28 }, router: zero, frames: { ...zero, saved: 72 } }

describe('HubScreen', () => {
  it('בלי גישה: "אין לך הרשאת גישה", ו"בקשת גישה" שולח את הטופס', async () => {
    let state = 'none'
    const { calls } = fakeApi({
      'GET /api/training-proof': () => ({ status: 200, data: { access: state, canRequest: state === 'none' } }),
      'POST /api/training-proof/access-request': () => {
        state = 'pending'
        return { status: 200, data: { access: 'pending' } }
      },
    })
    const user = userEvent.setup()
    render(<HubScreen />)
    expect(await screen.findByRole('heading', { name: 'אין לך הרשאת גישה לדף זה' })).toBeInTheDocument()
    expect(screen.queryByText('זיהוי טקסט')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /בקשת גישה/ }))
    const dlg = await screen.findByRole('dialog')
    expect(within(dlg).getByText(/מאמנים את מודלי הזיהוי של אוצריא/)).toBeInTheDocument()
    await user.type(within(dlg).getByRole('textbox'), 'מגיה ספרי קודש')
    await user.click(within(dlg).getByRole('button', { name: /שליחת הבקשה/ }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST').body).toEqual({ message: 'מגיה ספרי קודש' }))
    expect(await screen.findByText(/הבקשה שלך התקבלה ומחכה לאישור/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /בקשת גישה/ })).not.toBeInTheDocument()
  })

  it('עם גישה: שלושת החלקים, "המשך את הסבב" כשיש סבב פתוח, וההגהות לפי סוג', async () => {
    fakeApi({ 'GET /api/training-proof': () => ({ status: 200, data: { access: 'approved', isAdmin: false, sections: SECTIONS, stats: STATS } }) })
    render(<HubScreen />)
    expect(await screen.findByRole('heading', { name: 'הגהה לאימון המודלים' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /המשך את הסבב/ })).toHaveAttribute('href', '/library/page-proof/ocr')
    expect(screen.getByRole('link', { name: /התחל סבב של 30 שורות/ })).toHaveAttribute('href', '/library/page-proof/router')
    expect(screen.getByRole('link', { name: /בחר ספר/ })).toHaveAttribute('href', '/library/page-proof/frames')
    expect(screen.getByText('18/30')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /ניהול/ })).not.toBeInTheDocument()
    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent(/זיהוי טקסט.*שורות/)
    expect(rows[3]).toHaveTextContent(/גלאי אזורים.*עמודים/)
    expect(screen.queryByText(/שלום/)).not.toBeInTheDocument()
  })

  it('מנהל — קישור לניהול', async () => {
    fakeApi({ 'GET /api/training-proof': () => ({ status: 200, data: { access: 'admin', isAdmin: true, sections: SECTIONS, stats: STATS } }) })
    render(<HubScreen />)
    expect(await screen.findByRole('link', { name: /ניהול/ })).toHaveAttribute('href', '/library/admin/page-proof')
  })
})
