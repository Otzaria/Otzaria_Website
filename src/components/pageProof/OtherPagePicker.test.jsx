import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OtherPagePicker, { OtherPageButtons } from './OtherPagePicker'

// הצד השני של קישור בעמוד אחר: העמוד מוצג לקריאה בלבד לפי זרמים (בלי ריהוט), מילה = כפתור,
// מעבר בין עמודים (העמוד שמגיהים מדולג), שגיאות בעברית, Esc סוגר.

const VIEW = {
  page: 9,
  streams: [
    { key: 'main', he: 'ראשי', color: '#1a56db' },
    { key: 'notes', he: 'הערות', color: '#0e7f3c' },
  ],
  lines: [],
}
const LINES = {
  10: [
    { id: 101, line_no: 0, order: 1, stream: 'main', para_start: true, para_style: null, text: 'והלכה כרבי יוחנן' },
    { id: 102, line_no: 1, order: 2, stream: 'notes', para_start: true, para_style: 'dh', text: 'כרבי יוחנן. שהוא' },
    { id: 103, line_no: 2, order: 3, stream: 'header', para_start: false, para_style: null, text: 'עשר' },
  ],
  8: [{ id: 81, line_no: 0, order: 1, stream: 'main', para_start: true, para_style: null, text: 'עמוד שמונה' }],
}
let fetchLines
beforeEach(() => {
  fetchLines = vi.fn(async (gid, n) => {
    if (!LINES[n]) throw new Error(`עמוד ${n} לא נמצא בספר`)
    return { success: true, page: n, revision: 1, lines: LINES[n] }
  })
})

function open(props = {}) {
  const onPick = props.onPick || vi.fn(async () => null)
  const onClose = vi.fn()
  render(<OtherPagePicker gid="g1" view={VIEW} from={{ text: 'רבי', stream: 'notes' }} startPage={10} onPick={onPick} onClose={onClose} fetchLines={fetchLines} {...props} />)
  return { onPick, onClose }
}

describe('OtherPagePicker', () => {
  it('טוען את העמוד; לשוניות לפי זרמים בלי ריהוט; לצד-הערה נפתח הגוף; לחיצה על מילה ← onPick', async () => {
    const { onPick } = open()
    const dialog = await screen.findByRole('dialog', { name: /הצד השני של הקישור/ })
    await within(dialog).findByRole('button', { name: 'והלכה' })
    expect(fetchLines).toHaveBeenCalledWith('g1', 10)
    const tabs = within(screen.getByRole('tablist', { name: 'זרמי הטקסט בעמוד האחר' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual([expect.stringContaining('ראשי'), expect.stringContaining('הערות')])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).queryByText('עשר')).toBeNull()

    await userEvent.click(within(dialog).getByRole('button', { name: 'יוחנן' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    const [pick, fview] = onPick.mock.calls[0]
    expect(pick).toEqual({ page: 10, lineId: 101, lineNo: 0, stream: 'main', words: [2, 2], text: 'יוחנן', lineText: 'והלכה כרבי יוחנן' })
    expect(fview.page).toBe(10)
  })

  it('onPick מחזיר שגיאה ← מוצגת, והחלון נשאר; לשונית ההערות', async () => {
    open({ onPick: vi.fn(async () => 'קישור הוא בין שני זרמים שונים') })
    await screen.findByRole('button', { name: 'והלכה' })
    await userEvent.click(screen.getByRole('tab', { name: /הערות/ }))
    await userEvent.click(screen.getByRole('button', { name: 'כרבי' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('קישור הוא בין שני זרמים שונים')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('מעבר בין עמודים מדלג על העמוד שמגיהים; מספר העמוד הזה / עמוד שאינו — הסבר', async () => {
    open()
    await screen.findByRole('button', { name: 'והלכה' })
    await userEvent.click(screen.getByRole('button', { name: /הקודם/ }))
    // 10 ← 8: עמוד 9 הוא העמוד שמגיהים
    await screen.findByRole('button', { name: 'שמונה' })
    expect(fetchLines).toHaveBeenLastCalledWith('g1', 8)

    const input = screen.getByRole('spinbutton', { name: 'מספר העמוד שבו הצד השני' })
    await userEvent.clear(input)
    await userEvent.type(input, '9')
    await userEvent.click(screen.getByRole('button', { name: 'הצגה' }))
    expect(screen.getByRole('alert')).toHaveTextContent('זה העמוד שאתם מגיהים')
    expect(fetchLines).toHaveBeenCalledTimes(2)

    await userEvent.clear(input)
    await userEvent.type(input, '55')
    await userEvent.click(screen.getByRole('button', { name: 'הצגה' }))
    expect(await screen.findByText('עמוד 55 לא נמצא בספר')).toBeInTheDocument()
  })

  it('בלי עמוד התחלתי — מבקש מספר (והמיקוד בשדה); Esc סוגר רק את החלון', async () => {
    const { onClose } = open({ startPage: null })
    expect(screen.getByText(/הקלידו את מספר העמוד/)).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'מספר העמוד שבו הצד השני' }))
    expect(fetchLines).not.toHaveBeenCalled()
    const ev = fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(ev).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('OtherPageButtons: הקודם, הבא ומספר-עמוד; בעמוד 1 אין "קודם"', async () => {
    const onOtherPage = vi.fn()
    const { unmount } = render(<OtherPageButtons page={9} onOtherPage={onOtherPage} />)
    await userEvent.click(screen.getByRole('button', { name: 'עמוד 8' }))
    await userEvent.click(screen.getByRole('button', { name: 'עמוד 10' }))
    await userEvent.click(screen.getByRole('button', { name: 'מספר עמוד…' }))
    expect(onOtherPage.mock.calls).toEqual([[8], [10], [null]])
    unmount()
    render(<OtherPageButtons page={1} onOtherPage={onOtherPage} />)
    expect(screen.queryByRole('button', { name: 'עמוד 0' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'עמוד 2' })).toBeInTheDocument())
  })
})
