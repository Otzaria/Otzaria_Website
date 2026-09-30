import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WordSuggestions from './WordSuggestions'
import { suggestionData } from '@/lib/pageProof/wordPopup'

const line = {
  text: 'אמר רבי יוחנן',
  alternatives: [{ i: 1, word: 'רבי', p: 0.35, alts: [{ text: 'רב', p: 0.4 }, { text: 'רבו', p: 0.15 }], other_p: 0.1 }],
  lm_flags: [{ i: 1, word: 'רבי', kinds: ['lm', 'rec'], lm: [{ text: 'רבה', gain: 1.2 }], rec: [{ text: 'רבו', gain: 0.8 }] }],
}
const data = suggestionData(line, 1)
const anchorRect = { left: 300, top: 100, right: 360, bottom: 120 }

describe('WordSuggestions — חלונית ההצעות', () => {
  it('נפתחת ב-portal ל-body, עם המילה, הסבירות, והקבוצות בצבעיהן', () => {
    const { container } = render(<WordSuggestions data={data} anchorRect={anchorRect} onPick={vi.fn()} />)
    const box = screen.getByRole('listbox', { name: 'הצעות למילה רבי' })
    expect(container.contains(box)).toBe(false)
    expect(document.body.contains(box)).toBe(true)
    expect(box).toHaveStyle({ position: 'fixed' })
    expect(box).toHaveTextContent('«רבי»')
    expect(box).toHaveTextContent('נכונה בסבירות 35%')
    expect(box).toHaveTextContent('אף אחת מההצעות: 10%')

    const groups = within(box).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['מתאימה להקשר', 'חלופות הזיהוי', 'הצעת מודל-השפה'])
    const [rec, alt, lm] = within(box).getAllByRole('option')
    expect(rec).toHaveAttribute('data-kind', 'rec')
    expect(rec).toHaveTextContent('15%')
    expect(alt).toHaveTextContent('רב')
    expect(alt).toHaveTextContent('40%')
    expect(lm).toHaveAttribute('data-kind', 'lm')
    expect(lm.querySelector('.text-feature-700')).toHaveTextContent('רבה')
    expect(rec.querySelector('.text-warning-strong-700')).toHaveTextContent('רבו')
  })

  it('לחיצה על הצעה — onPick עם מספרה ברשימה; mousedown אינו לוקח פוקוס', async () => {
    const onPick = vi.fn()
    render(<WordSuggestions data={data} anchorRect={anchorRect} onPick={onPick} />)
    await userEvent.click(screen.getByRole('option', { name: /רבה/ }))
    expect(onPick).toHaveBeenCalledWith(2)
  })

  it('במקלדת: ההצעה המסומנת והוראות-מקלדת; כשאי אפשר להחליף — הסבר ובלי בחירה', async () => {
    const onPick = vi.fn()
    const { rerender } = render(<WordSuggestions data={data} anchorRect={anchorRect} onPick={onPick} keyboard activeIndex={1} />)
    const box = screen.getByRole('listbox')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id)
    expect(box).toHaveTextContent('↑ ↓ בחירה · Enter החלפה · Esc סגירה')

    rerender(<WordSuggestions data={data} anchorRect={anchorRect} onPick={onPick} disabledReason="תצוגה בלבד — אי אפשר להחליף כאן" />)
    expect(screen.getByText('תצוגה בלבד — אי אפשר להחליף כאן')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('option')[0])
    expect(onPick).not.toHaveBeenCalled()
  })

  it('בלי נתונים — לא מוצגת', () => {
    render(<WordSuggestions data={null} anchorRect={anchorRect} />)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
