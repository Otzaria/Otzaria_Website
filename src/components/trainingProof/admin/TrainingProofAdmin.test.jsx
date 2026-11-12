import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { StrictMode } from 'react'

// מסגרת מסך הניהול: הלשונית נקראת מהכתובת גם במצב-פיתוח (StrictMode מריץ effects פעמיים —
// כך אבדה הלשונית בבדיקה באתר המקומי), הלשונית שנבחרה נכתבת לכתובת, והמונים בראש.
// הלשוניות עצמן מדומות.

vi.mock('./review/ReviewTab', () => ({ default: ({ section }) => <div>סקירה:{section}</div> }))
vi.mock('./upload/UploadTab', () => ({ default: () => <div>העלאה</div> }))
vi.mock('./export/ExportTab', () => ({ default: () => <div>הורדה</div> }))
vi.mock('./volunteers/VolunteersTab', () => ({ default: () => <div>מתנדבים-פנים</div> }))
vi.mock('./guide/GuideTab', () => ({ default: () => <div>הוראות-פנים</div> }))
vi.mock('./legacy/LegacyTab', () => ({ default: () => <div>ישן</div> }))

import TrainingProofAdmin from './TrainingProofAdmin'

const SUMMARY = {
  success: true,
  sections: {
    ocr: { available: 1, held: 0, submitted: 12, approved: 3 },
    router: { available: 0, held: 0, submitted: 4, approved: 1 },
    frames: { available: 0, held: 0, submitted: 2, approved: 0 },
  },
  requests: 2,
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify(SUMMARY))))
})

describe('TrainingProofAdmin', () => {
  it('לשונית מהכתובת נשמרת גם ב-StrictMode', async () => {
    window.history.replaceState(null, '', '/library/admin/page-proof?tab=volunteers')
    render(
      <StrictMode>
        <TrainingProofAdmin />
      </StrictMode>
    )
    expect(await screen.findByText('מתנדבים-פנים')).toBeInTheDocument()
    expect(window.location.search).toBe('?tab=volunteers')
    expect(screen.queryByText(/^סקירה:/)).toBeNull()
  })

  it('חלק בסקירה מהכתובת; מעבר לשונית נכתב לכתובת; מונים ובקשות ממתינות', async () => {
    window.history.replaceState(null, '', '/library/admin/page-proof?tab=review&sec=router')
    render(<TrainingProofAdmin />)
    expect(await screen.findByText('סקירה:router')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
    // אושרו ועוד לא הורדו: 3+1+0
    expect(screen.getByText('אושרו ועוד לא הורדו').previousSibling).toHaveTextContent('4')
    // מונים בלשוניות: לאישור — 12+4+2, מתנדבים — בקשות הגישה
    expect(screen.getByRole('tab', { name: /^לאישור.*18 ממתינים לאישור/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^מתנדבים.*2 בקשות גישה/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'הגהה' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'הנחיות' }))
    expect(screen.getByText('הוראות-פנים')).toBeInTheDocument()
    expect(window.location.search).toBe('?tab=guide')
  })

  it('"ניקוי נתונים ישנים": מוצגת כשיש נתונים ישנים, עם הסבר; כשאין — מוסתרת', async () => {
    const legacy = { success: true, counts: { books: 0, pages: 0, submissions: 0, drafts: 0 }, files: 3 }
    globalThis.fetch.mockImplementation((url) => Promise.resolve(new Response(JSON.stringify(String(url).endsWith('/legacy') ? legacy : SUMMARY))))
    window.history.replaceState(null, '', '/library/admin/page-proof?tab=legacy')
    const { unmount } = render(<TrainingProofAdmin />)
    expect(await screen.findByText('ישן')).toBeInTheDocument()
    expect(screen.getByText(/מוחקים לצמיתות את הנתונים של הדף הישן/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'ניקוי נתונים ישנים' })).toBeInTheDocument()
    unmount()
    legacy.files = 0
    window.history.replaceState(null, '', '/library/admin/page-proof')
    render(<TrainingProofAdmin />)
    await screen.findByText(/^סקירה:/)
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'ניקוי נתונים ישנים' })).toBeNull())
    expect(screen.getAllByRole('tab')).toHaveLength(5)
  })
})
