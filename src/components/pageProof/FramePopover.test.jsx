import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FramePopover, { StreamPicker } from './FramePopover'
import { FURNITURE_CHOICE, NOTES_RUNHEAD_CHOICE } from '@/lib/pageProof/scanGeometry'

const chips = {
  content: [
    { key: 'main', he: 'ראשי', color: '#1a56db' },
    { key: 'notes', he: 'הערות', color: '#0e7f3c' },
  ],
  headings: [
    { key: 'main_heading', he: 'כותרת', color: '#1a56db', base: 'main' },
    { key: 'notes_heading', he: 'כותרת הערות', color: '#0e7f3c', base: 'notes' },
  ],
  furniture: [
    { key: 'header', he: 'כותרת עמוד', color: '#9ca3af' },
    { key: 'footer', he: 'תחתית', color: '#9ca3af' },
    { key: 'sep', he: 'מפריד', color: '#9ca3af' },
  ],
  more: [{ key: 'notes2', he: "הערות ב'", color: '#7c3aed' }],
  moreHeadings: [{ key: 'notes2_heading', he: "כותרת הערות ב'", color: '#7c3aed', base: 'notes2' }],
}

const frame = (extra = {}) => ({ fid: 'aa11bb', stream: 'main', bbox: [10, 10, 100, 100], order: 2, ...extra })

function setup(props = {}) {
  const on = {
    onStream: vi.fn(),
    onSeq: vi.fn(),
    onOrder: vi.fn(),
    onKind: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  }
  const utils = render(<FramePopover frame={frame()} seq={1} seqCount={2} orderIndex={0} orderCount={3} chips={chips} {...on} {...props} />)
  return { on, ...utils }
}

const streams = () => screen.getByRole('group', { name: 'הזרם של המסגרת' })

describe('FramePopover', () => {
  it('מציג את מקום המסגרת בסדר הקריאה ואת הזרם הפעיל', () => {
    setup()
    // קבוצה ולא חלון-דו-שיח: העורך לא מדלג על Ctrl+Z / Ctrl+Y כשהמיקוד כאן
    expect(screen.getByRole('group', { name: 'עריכת מסגרת' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('מסגרת 2 בסדר הקריאה')).toBeInTheDocument()
    expect(within(streams()).getByRole('button', { name: 'ראשי', pressed: true })).toBeInTheDocument()
    expect(within(streams()).getByRole('button', { name: 'הערות', pressed: false })).toBeInTheDocument()
    expect(screen.getByTestId('frame-seq')).toHaveTextContent('1')
  })

  // בעל הפרויקט (2026-10-05): כותרת היא סגנון-פסקה בטקסט, לא מסגרת — זרמי-הכותרת אינם בבחירה
  it('בבחירת הזרם: זרמי-התוכן ו"ריהוט הדף" — בלי "כותרת" / "כותרת הערות"', async () => {
    const { on } = setup()
    const g = streams()
    expect(within(g).queryByRole('button', { name: 'כותרת' })).toBeNull()
    expect(within(g).queryByRole('button', { name: 'כותרת הערות' })).toBeNull()
    await userEvent.click(within(g).getByRole('button', { name: 'ריהוט הדף' }))
    expect(on.onStream).toHaveBeenLastCalledWith(FURNITURE_CHOICE)
    // אין עוד מתג "כותרת" נפרד — הכותרות הן חלק מבחירת הזרם
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('בחירת זרם אחר — onStream; הזרם הפעיל אינו שולח שוב; "עוד…" — נדירים וסוג-הריהוט (בלי כותרות)', async () => {
    const { on } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'הערות' }))
    expect(on.onStream).toHaveBeenCalledWith('notes')
    await userEvent.click(screen.getByRole('button', { name: 'ראשי' }))
    expect(on.onStream).toHaveBeenCalledTimes(1)
    const more = screen.getByRole('combobox', { name: 'זרם אחר' })
    expect(within(more).getAllByRole('option').map((o) => o.value)).toEqual(['', 'notes2', 'header', 'footer', 'sep'])
    await userEvent.selectOptions(more, 'notes2')
    expect(on.onStream).toHaveBeenLastCalledWith('notes2')
    await userEvent.selectOptions(more, 'footer')
    expect(on.onStream).toHaveBeenLastCalledWith('footer')
  })

  it('מסגרת-כותרת מגרסה קודמת: מוצגת בשבב שלה (פעיל), ואפשר להעביר אותה לזרם-תוכן', async () => {
    const { on } = setup({ frame: frame({ stream: 'notes_heading' }) })
    const legacy = within(streams()).getByRole('button', { name: 'כותרת הערות', pressed: true })
    expect(legacy).toHaveAttribute('title', expect.stringContaining('סגנון-הפסקה'))
    expect(within(streams()).queryByRole('button', { name: 'כותרת' })).toBeNull()
    await userEvent.click(legacy)
    expect(on.onStream).not.toHaveBeenCalled()
    await userEvent.click(within(streams()).getByRole('button', { name: 'הערות', pressed: false }))
    expect(on.onStream).toHaveBeenCalledWith('notes')
  })

  it('מסגרת-ריהוט: "ריהוט הדף" פעיל והסוג המדויק ב"עוד…"; לחיצה שנייה על "ריהוט הדף" לא משנה', async () => {
    const { on } = setup({ frame: frame({ stream: 'footer' }) })
    const f = within(streams()).getByRole('button', { name: 'ריהוט הדף', pressed: true })
    expect(screen.getByRole('combobox', { name: 'זרם אחר' })).toHaveValue('footer')
    await userEvent.click(f)
    expect(on.onStream).not.toHaveBeenCalled()
  })

  it('מספר בזרם: − חסום ב-1, + שולח 2', async () => {
    const { on } = setup()
    expect(screen.getByRole('button', { name: 'מספר קטן יותר בזרם' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'מספר גדול יותר בזרם' }))
    expect(on.onSeq).toHaveBeenCalledWith(2)
  })

  it('סדר הקריאה: "הקודם" חסום במסגרת הראשונה, "הבא" מזיז', async () => {
    const { on } = setup()
    expect(screen.getByRole('button', { name: 'הקודם' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'הבא' }))
    expect(on.onOrder).toHaveBeenCalledWith(1)
  })

  it('סוג, מחיקה וסגירה', async () => {
    const { on } = setup()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'סוג המסגרת' }), 'table')
    expect(on.onKind).toHaveBeenCalledWith('table')
    await userEvent.click(screen.getByRole('button', { name: /מחיקה/ }))
    expect(on.onDelete).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'סגירה' }))
    expect(on.onClose).toHaveBeenCalledTimes(1)
  })

  it('מסגרת-אובייקט: בלי זרמים ובלי מספר', () => {
    render(<FramePopover frame={frame({ kind: 'figure' })} seq={null} chips={chips} />)
    expect(screen.queryByRole('group', { name: 'הזרם של המסגרת' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('frame-seq')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'סוג המסגרת' })).toHaveValue('figure')
  })

  it('הצעה — הסבר שהשינוי ישמור את כל ההצעות', () => {
    setup({ suggested: true })
    expect(screen.getByText(/ישמור את כל המסגרות המוצעות/)).toBeInTheDocument()
  })
})

describe('StreamPicker', () => {
  it('"ריהוט הדף" כבחירה (value = FURNITURE_CHOICE): פעיל; בלי זרמים נדירים — בלי "עוד…"', async () => {
    const onPick = vi.fn()
    render(<StreamPicker chips={{ ...chips, more: [], moreHeadings: [], furniture: [] }} value={FURNITURE_CHOICE} onPick={onPick} label="בחירה" />)
    const g = screen.getByRole('group', { name: 'בחירה' })
    expect(within(g).getByRole('button', { name: 'ריהוט הדף', pressed: true })).toBeInTheDocument()
    expect(within(g).queryByRole('combobox')).not.toBeInTheDocument()
    await userEvent.click(within(g).getByRole('button', { name: 'ראשי' }))
    expect(onPick).toHaveBeenCalledWith('main')
  })
})

describe('FramePopover — השורה שבסמן בולטת מהמסגרת', () => {
  it('onClaimLine ← שורה עם "השורה שייכת למסגרת הזו" (וההסבר ב-title); בלעדיו — אין', async () => {
    const onClaimLine = vi.fn()
    const { unmount } = setup({ onClaimLine, claimTitle: 'ההסבר' })
    const row = screen.getByTestId('popover-claim')
    expect(row).toHaveTextContent('השורה שבסמן בולטת מהמסגרת הזו')
    const btn = within(row).getByRole('button', { name: 'השורה שייכת למסגרת הזו' })
    expect(btn).toHaveAttribute('title', 'ההסבר')
    await userEvent.click(btn)
    expect(onClaimLine).toHaveBeenCalledTimes(1)
    unmount()
    setup()
    expect(screen.queryByTestId('popover-claim')).toBeNull()
  })
})

// פורום (2026-10-01): המתנדבים סימנו את כותרת-הרצה שמעל ההערות כ"כותרת הערות" — שנכנסת לספר
describe('StreamPicker — "כותרת-רצה של ההערות"', () => {
  it('מוצגת רק כשיש בעמוד הערות, ובחירתה שולחת את הבחירה המפורשת', async () => {
    const onPick = vi.fn()
    const { rerender } = render(<StreamPicker chips={chips} value="main" onPick={onPick} />)
    const btn = within(streams()).getByRole('button', { name: 'כותרת-רצה של ההערות' })
    expect(btn).toHaveAttribute('title', expect.stringContaining('לא נכנסת לספר'))
    // וההסבר אומר שכותרת של פרק בתוך ההערות היא סגנון-פסקה, לא מסגרת
    expect(btn).toHaveAttribute('title', expect.stringContaining('סגנון-הפסקה «כותרת»'))
    await userEvent.click(btn)
    expect(onPick).toHaveBeenLastCalledWith(NOTES_RUNHEAD_CHOICE)

    // מסגרת שכבר "כותרת-רצה של ההערות" (סוג-המסגרת, frameChoice — 2026-10-04) — אין שינוי לשלוח
    onPick.mockClear()
    rerender(<StreamPicker chips={chips} value={NOTES_RUNHEAD_CHOICE} onPick={onPick} />)
    await userEvent.click(within(streams()).getByRole('button', { name: 'כותרת-רצה של ההערות' }))
    expect(onPick).not.toHaveBeenCalled()

    // עמוד בלי הערות — הכפתור אינו מוצג
    rerender(<StreamPicker chips={{ ...chips, content: [chips.content[0]], headings: [chips.headings[0]] }} value="main" onPick={onPick} />)
    expect(within(streams()).queryByRole('button', { name: 'כותרת-רצה של ההערות' })).not.toBeInTheDocument()
  })
})
