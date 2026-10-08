import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DraftCarriedNotice from './DraftCarriedNotice'

// העמוד חזר מזיהוי-מחדש: תיקון-טקסט שהמתנדב עשה בשורה לפני שנחתכה מחדש לא מוחל מעצמו (drafts.carryDraftOps — held);
// ההודעה מציגה את הזיהוי החדש מול הנוסח שלו, ו"השתמשו בנוסח שלי" מחיל אותו דרך העורך.

const HELD = { id: 7, page: 40, mine: 'או שמן', ocr: 'או לרטייה שמן' }

describe('DraftCarriedNotice — שורות שזוהו מחדש (held)', () => {
  it('מציג את שני הנוסחים, ו"השתמשו בנוסח שלי" קורא ל-onUseMine ומסמן שהוחל', async () => {
    const onUseMine = vi.fn(() => true)
    render(<DraftCarriedNotice carried={{ kept: 2, cut: 1, dropped: [], held: [HELD] }} onClose={() => {}} onUseMine={onUseMine} />)
    const box = screen.getByTestId('carried-held')
    expect(within(box).getByText(/שורה אחת זוהתה מחדש/)).toBeTruthy()
    expect(within(box).getByText(/«או לרטייה שמן»/)).toBeTruthy()
    expect(within(box).getByText(/«או שמן»/)).toBeTruthy()
    await userEvent.click(within(box).getByRole('button', { name: 'השתמשו בנוסח שלי' }))
    expect(onUseMine).toHaveBeenCalledWith(HELD)
    expect(within(box).queryByRole('button', { name: 'השתמשו בנוסח שלי' })).toBeNull()
    expect(within(box).getByText(/הנוסח שלכם הוחל/)).toBeTruthy()
  })

  it('העורך סירב (push החזיר false) — הכפתור נשאר', async () => {
    render(<DraftCarriedNotice carried={{ kept: 0, cut: 1, dropped: [], held: [HELD] }} onClose={() => {}} onUseMine={() => false} />)
    const btn = screen.getByRole('button', { name: 'השתמשו בנוסח שלי' })
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: 'השתמשו בנוסח שלי' })).toBeTruthy()
  })

  it('בלי held — כמו קודם (אין רשימה)', () => {
    render(<DraftCarriedNotice carried={{ kept: 1, cut: 0, dropped: [] }} onClose={() => {}} />)
    expect(screen.queryByTestId('carried-held')).toBeNull()
  })
})
