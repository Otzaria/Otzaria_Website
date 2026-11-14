import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import LinesStage from './LinesStage'
import { initHistory, pushHistory, redoHistory, undoHistory } from './linesLogic'
import { fixtureModel } from './testFixtures'

// שלב "שורות" עם ההיסטוריה שמחזיק ההורה (כמו ReviewShell)
function Harness({ onRejected = () => {}, readOnly = false, nonVilna = false, lockR = false }) {
  const [h, setH] = useState(initHistory([]))
  const [model] = useState(() => {
    const m = fixtureModel()
    return lockR ? { ...m, blocks: m.blocks.map((b) => (b.id === 'r' ? { ...b, editable: false } : b)) } : m
  })
  return (
    <>
      <output data-testid="ops">{JSON.stringify(h.present)}</output>
      <LinesStage
        pageId="64b7f0000000000000000009"
        model={model}
        ops={h.present}
        onOps={(ops) => setH((x) => pushHistory(x, ops))}
        onUndo={() => setH(undoHistory)}
        onRedo={() => setH(redoHistory)}
        canUndo={h.past.length > 0}
        canRedo={h.future.length > 0}
        onRejected={onRejected}
        readOnly={readOnly}
        nonVilna={nonVilna}
      />
    </>
  )
}

const row = (n) => document.querySelector(`[data-line="g:${n}"]`)
const lineText = (n) =>
  within(row(n))
    .getByRole('group', { name: /המילים שלנו/ })
    .textContent.replace(/\s+/g, ' ')
    .trim()
const ops = () => JSON.parse(screen.getByTestId('ops').textContent)

describe('LinesStage', () => {
  it('מציג חיתוך מהסריקה, מילים, שורות חשודות, ותג לגוש שלא עוגן', () => {
    render(<Harness />)
    expect(within(row(0)).getByRole('img')).toHaveAttribute('src', expect.stringContaining('/api/tzurat-hadaf/pages/64b7f0000000000000000009/image?side=scan&x='))
    expect(lineText(0)).toBe('מאימתיקוריןאת')
    expect(row(0)).toHaveAttribute('data-suspicious', '1')
    expect(within(row(2)).getByText(/אין מקום מסומן בסריקה/)).toBeInTheDocument()
    expect(screen.getByText(/השינויים ייראו בעמוד אחרי הבנייה הבאה/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /רש"י/ }))
    expect(screen.getByText('הגוש הזה לא עוגן במחשב')).toBeInTheDocument()
  })

  it('המילה האחרונה למטה, ביטול וחזרה', () => {
    render(<Harness />)
    fireEvent.click(within(row(0)).getByRole('button', { name: /המילה האחרונה למטה/ }))
    expect(ops()).toEqual([{ op: 'start', block: 'g', line: 1, ref: 'ברכות ב.', wi: 2 }])
    expect(within(row(1)).getAllByRole('button')[0]).toHaveTextContent('את')
    expect(within(row(1)).getByText('הוזזה')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(ops()).toEqual([])
    expect(lineText(0)).toBe('מאימתיקוריןאת')
    fireEvent.click(screen.getByRole('button', { name: 'חזרה' }))
    expect(ops()).toHaveLength(1)
  })

  it('לחיצה על מילה → "השורה מתחילה כאן" / "מכאן — לשורה הבאה"', () => {
    render(<Harness />)
    fireEvent.click(within(row(1)).getByRole('button', { name: 'בערבין' }))
    const menu = screen.getByTestId('word-menu')
    fireEvent.click(within(menu).getByRole('button', { name: 'השורה מתחילה כאן' }))
    expect(ops()).toEqual([{ op: 'start', block: 'g', line: 1, ref: 'ברכות ב.', wi: 4 }])
    expect(lineText(0)).toBe('מאימתיקוריןאתשמע')
    fireEvent.click(within(row(0)).getByRole('button', { name: 'קורין' }))
    fireEvent.click(within(screen.getByTestId('word-menu')).getByRole('button', { name: 'מכאן — לשורה הבאה' }))
    expect(lineText(0)).toBe('מאימתי')
    expect(lineText(1)).toBe('קוריןאתשמעבערביןמשעה')
  })

  it('"השורה נכונה" מסמן ומבטל; "לשורה החשודה הבאה" זמין כשנשארו', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /לשורה החשודה הבאה \(2\)/ })).toBeEnabled()
    fireEvent.click(within(row(0)).getByRole('button', { name: 'השורה נכונה' }))
    expect(ops()).toEqual([{ op: 'confirm', block: 'g', line: 0 }])
    expect(within(row(0)).getByText('נבדקה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /לשורה החשודה הבאה \(1\)/ })).toBeInTheDocument()
    fireEvent.click(within(row(0)).getByRole('button', { name: 'השורה נכונה' }))
    expect(ops()).toEqual([])
  })

  it('מילה ראשונה — אין מה להזיז; שורה של מילה אחת — אין "המילה הראשונה למעלה"', () => {
    const onRejected = vi.fn()
    render(<Harness onRejected={onRejected} />)
    fireEvent.click(within(row(1)).getByRole('button', { name: 'שמע' }))
    expect(within(screen.getByTestId('word-menu')).getByText(/כבר מתחילה במילה הזו/)).toBeInTheDocument()
    fireEvent.click(within(row(1)).getByRole('button', { name: 'משעה' }))
    fireEvent.click(within(screen.getByTestId('word-menu')).getByRole('button', { name: 'מכאן — לשורה הבאה' }))
    fireEvent.click(within(row(1)).getByRole('button', { name: 'בערבין' }))
    fireEvent.click(within(screen.getByTestId('word-menu')).getByRole('button', { name: 'מכאן — לשורה הבאה' }))
    expect(lineText(1)).toBe('שמע')
    expect(within(row(1)).getByRole('button', { name: /המילה הראשונה למעלה/ })).toBeDisabled()
    expect(within(row(1)).getByRole('button', { name: /המילה האחרונה למטה/ })).toBeDisabled()
    expect(onRejected).not.toHaveBeenCalled()
  })

  it('צפייה בלבד — בלי כפתורי פעולה; עמוד שאינו וילנא — הודעה', () => {
    const { unmount } = render(<Harness readOnly />)
    expect(screen.queryByRole('button', { name: /המילה הראשונה למעלה/ })).toBeNull()
    unmount()
    render(<Harness nonVilna />)
    expect(screen.getByText(/אינו מדפוס וילנא/)).toBeInTheDocument()
  })

  it('גוש נעול (editable:false) — לעיון בלבד: בלי כפתורים, בלי תפריט מילה ובלי תג "לא עוגן"', () => {
    render(<Harness lockR />)
    fireEvent.click(screen.getByRole('tab', { name: /רש"י/ }))
    expect(screen.getByText(/מוצג לעיון בלבד/)).toBeInTheDocument()
    expect(screen.queryByText('הגוש הזה לא עוגן במחשב')).toBeNull()
    expect(screen.queryByRole('button', { name: /השורה נכונה/ })).toBeNull()
    expect(ops()).toEqual([])
  })
})
