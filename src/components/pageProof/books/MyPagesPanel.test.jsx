import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MyPagesPanel from './MyPagesPanel'
import { formatUntil } from '@/lib/pageProof/dates'
import { CLAIM_RULE } from '@/lib/pageProof/gridState'

// "העמודים שלי" בדף המתנדב: הרצפים שבטיפולכם עם "שמור לך עד…", לחיצה ← onOpen,
// מצב ריק עם מעבר לבחירת עמודים, והסבר לעמוד שביקשו ואינו בטיפולכם.

const NOW = new Date('2026-09-30T08:00:00Z')
const UNTIL = new Date(NOW.getTime() + 30 * 3600e3)
const SEQ = {
  book: { id: 'b1', gid: 'g1', title: 'ספר ניסוי' },
  seq: 2,
  pages: [
    { id: 'p11', page: 11, state: 'mine', leasedUntil: UNTIL.toISOString() },
    { id: 'p12', page: 12, state: 'submitted', leasedUntil: null },
    { id: 'p13', page: 13, state: 'approved', leasedUntil: null },
    { id: 'p14', page: 14, state: 'unavailable', leasedUntil: null },
  ],
}

describe('MyPagesPanel', () => {
  it('הרצפים שבטיפולכם: לכל עמוד עד מתי הוא שמור לכם, ולחיצה פותחת אותו', () => {
    const onOpen = vi.fn()
    render(<MyPagesPanel held={[SEQ]} onOpen={onOpen} now={NOW} />)
    expect(screen.getByRole('heading', { name: 'העמודים שלי' })).toBeInTheDocument()
    expect(screen.getByText(CLAIM_RULE)).toBeInTheDocument()
    expect(screen.getByText('ספר ניסוי')).toBeInTheDocument()
    expect(screen.getByText('· רצף 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /עמוד 11/ })).toHaveTextContent(`שמור לך עד ${formatUntil(UNTIL, NOW)}`)
    expect(screen.getByRole('button', { name: /עמוד 12/ })).toHaveTextContent('הוגש — ממתין לאישור')
    expect(screen.getByRole('button', { name: /עמוד 13/ })).toHaveTextContent('אושר')
    // עמוד של אחר ברצף — לא ברשימה שלי
    expect(screen.queryByRole('button', { name: /עמוד 14/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /עמוד 11/ }))
    expect(onOpen).toHaveBeenCalledWith(SEQ, 'p11')
    expect(screen.getByRole('link', { name: 'לרשת-העמודים של הספר' })).toHaveAttribute('href', '/library/page-proof/books/g1')
    expect(screen.getByRole('link', { name: 'בחירת עמודים' })).toHaveAttribute('href', '/library/page-proof/books')
  })

  it('בלי עמודים בטיפול ← הסבר, ומעבר לבחירת עמודים', () => {
    render(<MyPagesPanel held={[]} onOpen={vi.fn()} now={NOW} />)
    expect(screen.getByText('אין לכם עמודים בטיפול כרגע.')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'בחירת עמודים' })).toHaveAttribute('href', '/library/page-proof/books')
  })

  it('העמוד שביקשו ואינו בטיפולכם — ההסבר לפי מצבו, וקישור לרשת של הספר', () => {
    const { rerender } = render(<MyPagesPanel held={[]} missing={{ id: 'x', gid: 'g9', page: 7, state: 'taken' }} now={NOW} />)
    const note = screen.getByRole('status')
    expect(within(note).getByText('עמוד 7 אינו בטיפולכם כרגע')).toBeInTheDocument()
    expect(within(note).getByText('מתנדב אחר עובד עליו כרגע.')).toBeInTheDocument()
    expect(within(note).getByRole('link', { name: 'לרשת-העמודים של הספר' })).toHaveAttribute('href', '/library/page-proof/books/g9')

    rerender(<MyPagesPanel held={[]} missing={{ id: 'x', gid: 'g9', page: 7, state: 'closed' }} now={NOW} />)
    expect(screen.getByText('הוא אינו פתוח להגהה כרגע.')).toBeInTheDocument()

    rerender(<MyPagesPanel held={[]} missing={{ id: 'x', gid: 'g9', page: 7, state: 'open' }} now={NOW} />)
    expect(screen.getByText(/עברו 48 שעות מאז שנפתח והוא חזר למאגר.*לתפוס אותו שוב/)).toBeInTheDocument()

    rerender(<MyPagesPanel held={[]} missing={{ id: null }} now={NOW} />)
    expect(screen.getByText('העמוד שביקשתם לא נמצא')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).queryByRole('link')).not.toBeInTheDocument()
  })
})
