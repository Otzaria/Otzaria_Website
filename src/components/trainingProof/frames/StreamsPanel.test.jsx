import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import StreamsPanel from './StreamsPanel'

// רשימת-הזרמים של הספר: סוג לכל זרם וכמה מסגרות בו; זרם מהתחנה — "הסוג נקבע בתחנה" בלי כפתור;
// זרם שנוסף באתר — "שנה סוג" ← כפתור לכל סוג ← onSetKind

const STREAMS = [
  { id: 's1', name: 'פנים', role: 'body' },
  { id: 'x1', name: 'הגהות', role: 'notes', added: true },
]
const PAGES = [
  { frames: [{ fid: 'a', stream: 's1' }, { fid: 'b', stream: 'x1' }] },
  { frames: [{ fid: 'c', stream: 'x1' }] },
]
const row = (id) => screen.getAllByTestId('stream-row').find((r) => r.dataset.stream === id)

describe('StreamsPanel', () => {
  it('סוג וספירה לכל זרם; מאיפה הוא; כל זרם אפשר לשנות', () => {
    render(<StreamsPanel streams={STREAMS} pages={PAGES} onSetKind={vi.fn()} />)
    expect(row('s1').textContent).toMatch(/מסגרת אחת בעמוד אחד · מהתחנה/)
    expect(row('x1').textContent).toMatch(/2 מסגרות ב-2 עמ' · נוסף באתר/)
    expect(row('s1').querySelector('[data-testid="stream-kind-edit"]')).toBeTruthy()
    expect(row('x1').querySelector('[data-testid="stream-kind-edit"]')).toBeTruthy()
  })

  it('זרם מהתחנה שהסוג שלו שונה — מראה מה היה בתחנה', () => {
    render(<StreamsPanel streams={[{ id: 's1', name: 'פנים', role: 'notes', stationRole: 'body' }]} pages={PAGES} onSetKind={vi.fn()} />)
    expect(row('s1').textContent).toMatch(/מהתחנה, שם: פנים — שונה כאן/)
  })

  it('שנה סוג ← פירוש: onSetKind(הזרם, commentary), והבחירה נסגרת כשנשמר', async () => {
    const onSetKind = vi.fn().mockResolvedValue(true)
    render(<StreamsPanel streams={STREAMS} pages={PAGES} onSetKind={onSetKind} />)
    fireEvent.click(row('x1').querySelector('[data-testid="stream-kind-edit"]'))
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /פירוש/ })))
    expect(onSetKind).toHaveBeenCalledWith(STREAMS[1], 'commentary')
    expect(row('x1').querySelector('[data-testid="stream-kind-edit"]')).toBeTruthy()
  })

  it('קריאה בלבד — בלי "שנה סוג"', () => {
    render(<StreamsPanel streams={STREAMS} pages={PAGES} readOnly onSetKind={vi.fn()} />)
    expect(screen.queryByTestId('stream-kind-edit')).toBeNull()
  })
})
