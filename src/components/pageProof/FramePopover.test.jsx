import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FramePopover, { StreamPicker } from './FramePopover'
import { FURNITURE_CHOICE } from '@/lib/pageProof/scanGeometry'

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

  it('כותרת לכל זרם-תוכן ו"ריהוט הדף" — כאפשרויות בבחירת הזרם', async () => {
    const { on } = setup()
    const g = streams()
    expect(within(g).getByRole('button', { name: 'כותרת' })).toBeInTheDocument()
    await userEvent.click(within(g).getByRole('button', { name: 'כותרת הערות' }))
    expect(on.onStream).toHaveBeenLastCalledWith('notes_heading')
    await userEvent.click(within(g).getByRole('button', { name: 'ריהוט הדף' }))
    expect(on.onStream).toHaveBeenLastCalledWith(FURNITURE_CHOICE)
    // אין עוד מתג "כותרת" נפרד — הכותרות הן חלק מבחירת הזרם
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('בחירת זרם אחר — onStream; הזרם הפעיל אינו שולח שוב; "עוד…" — נדירים, הכותרות שלהם וסוג-הריהוט', async () => {
    const { on } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'הערות' }))
    expect(on.onStream).toHaveBeenCalledWith('notes')
    await userEvent.click(screen.getByRole('button', { name: 'ראשי' }))
    expect(on.onStream).toHaveBeenCalledTimes(1)
    const more = screen.getByRole('combobox', { name: 'זרם אחר' })
    expect(within(more).getAllByRole('option').map((o) => o.value)).toEqual(['', 'notes2', 'notes2_heading', 'header', 'footer', 'sep'])
    await userEvent.selectOptions(more, 'notes2_heading')
    expect(on.onStream).toHaveBeenLastCalledWith('notes2_heading')
    await userEvent.selectOptions(more, 'footer')
    expect(on.onStream).toHaveBeenLastCalledWith('footer')
  })

  it('מסגרת-כותרת: הכותרת פעילה, והזרם הבסיסי לא', () => {
    setup({ frame: frame({ stream: 'notes_heading' }) })
    expect(within(streams()).getByRole('button', { name: 'כותרת הערות', pressed: true })).toBeInTheDocument()
    expect(within(streams()).getByRole('button', { name: 'הערות', pressed: false })).toBeInTheDocument()
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
    await userEvent.click(within(g).getByRole('button', { name: 'כותרת' }))
    expect(onPick).toHaveBeenCalledWith('main_heading')
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
