import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScanWordOverlay, { clientToSource, wordFrameBox, bandEdgeBoxes } from './ScanWordOverlay'

const LINES = [
  { bbox: [100, 50, 500, 80], words: [{ bbox: [400, 50, 500, 80] }, { bbox: [250, 50, 380, 80] }, { bbox: [100, 50, 230, 80] }] },
  { bbox: [100, 100, 500, 130] }
]

const base = { width: 600, height: 800, lines: LINES, lineBox: LINES[0].bbox, wordBox: [250, 50, 380, 80], kind: 'solid', lineNumber: 3 }

describe('ScanWordOverlay', () => {
  it('SVG בפיקסלים הטבעיים, פס שורה, מסגרת רציפה מרווחת ותג מספר השורה', () => {
    const { container } = render(<ScanWordOverlay {...base} />)
    const svg = container.querySelector('svg[data-scan-overlay]')
    expect(svg).toHaveAttribute('viewBox', '0 0 600 800')
    expect(svg).toHaveAttribute('width', '600')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    const band = screen.getByTestId('scan-line-band')
    // ריפוד 10 יחידות מכל צד
    expect(band).toHaveAttribute('x', '90')
    expect(band).toHaveAttribute('width', '420')
    expect(band.style.fillOpacity).toBe('0.28')
    expect(band.style.fill).toContain('--editor-scan-band')
    // קווים דקים בקצות הפס, למעלה ולמטה, בתוך רוחב הפס
    const edges = screen.getAllByTestId('scan-line-band-edge')
    expect(edges).toHaveLength(2)
    expect(edges[0]).toHaveAttribute('y', '50')
    expect(Number(edges[1].getAttribute('y')) + Number(edges[1].getAttribute('height'))).toBe(80)
    const frame = screen.getByTestId('scan-word-frame')
    expect(frame).toHaveAttribute('data-kind', 'solid')
    expect(frame).not.toHaveAttribute('stroke-dasharray')
    expect(frame).toHaveAttribute('stroke-width', '1.5')
    // גובה שורה 30 → ריווח 12 לרוחב, 7.5 לגובה, פינות 7.5
    expect(frame).toHaveAttribute('x', '238')
    expect(frame).toHaveAttribute('width', '154')
    expect(frame).toHaveAttribute('y', '42.5')
    expect(frame).toHaveAttribute('height', '45')
    expect(frame).toHaveAttribute('rx', '7.5')
    expect(screen.getByTestId('scan-line-badge')).toHaveTextContent('3')
  })

  it('מלבן אחד: המילוי והקו באותה גאומטריה, בלי הילה; עובי הקו מפוצה בזום ובקנה המידה', () => {
    const { rerender } = render(<ScanWordOverlay {...base} zoom={2} />)
    const fill = screen.getByTestId('scan-word-fill')
    const frame = screen.getByTestId('scan-word-frame')
    for (const k of ['x', 'y', 'width', 'height', 'rx']) expect(fill.getAttribute(k)).toBe(frame.getAttribute(k))
    expect(screen.queryByTestId('scan-word-halo')).toBeNull()
    expect(frame).toHaveAttribute('stroke-width', '0.75')
    // הריווח ביחידות המקור — לא תלוי בזום
    expect(frame).toHaveAttribute('x', '238')
    // מקור כפול מהתמונה: יחידה אחת = חצי פיקסל תמונה → קו של 1.5px = 3 יחידות
    rerender(<ScanWordOverlay {...base} sourceSize={[1200, 1600]} />)
    expect(screen.getByTestId('scan-word-frame')).toHaveAttribute('stroke-width', '3')
    expect(document.querySelector('svg')).toHaveAttribute('viewBox', '0 0 1200 1600')
  })

  it('משוער — אותו קו רציף, רק מילוי חלש יותר; יחסית — קו תחתון רציף', () => {
    const { rerender } = render(<ScanWordOverlay {...base} kind="dashed" />)
    const frame = screen.getByTestId('scan-word-frame')
    expect(frame).toHaveAttribute('data-kind', 'estimated')
    expect(frame).not.toHaveAttribute('stroke-dasharray')
    expect(frame).toHaveAttribute('stroke-width', '1.5')
    expect(Number(screen.getByTestId('scan-word-fill').style.fillOpacity)).toBeCloseTo(0.52 * 0.75)
    rerender(<ScanWordOverlay {...base} kind="under" />)
    const under = screen.getByTestId('scan-word-frame')
    expect(under.tagName.toLowerCase()).toBe('line')
    expect(under).toHaveAttribute('data-kind', 'under')
    expect(under).not.toHaveAttribute('stroke-dasharray')
  })

  it('עוצמה: "חזק" — מילוי בולט וקו 1.5; "רגיל" — מילוי עדין וקו 1.25', () => {
    const { rerender } = render(<ScanWordOverlay {...base} />)
    const fill = screen.getByTestId('scan-word-fill')
    expect(fill.style.fillOpacity).toBe('0.52')
    // הקו נבלע במילוי — גם הוא multiply, בגוון מאותה משפחה
    expect(screen.getByTestId('scan-word-frame').style.mixBlendMode).toBe('multiply')
    expect(fill.style.fill).toContain('--editor-scan-mark')
    // פס השורה חלש מהמילה, ובגוון אחר (חום-חם, לא הענבר של המילה)
    expect(Number(screen.getByTestId('scan-line-band').style.fillOpacity)).toBeLessThan(Number(fill.style.fillOpacity))
    expect(screen.getByTestId('scan-line-band').style.fill).not.toContain('--editor-scan-mark')
    expect(fill.style.mixBlendMode).toBe('multiply')
    rerender(<ScanWordOverlay {...base} strength="normal" />)
    expect(screen.getByTestId('scan-word-fill').style.fillOpacity).toBe('0.34')
    expect(screen.getByTestId('scan-word-frame')).toHaveAttribute('stroke-width', '1.25')
    expect(screen.getByTestId('scan-line-band').style.fillOpacity).toBe('0.2')
    expect(screen.getAllByTestId('scan-line-band-edge')[0].style.fillOpacity).toBe('0.45')
  })

  it('לחיצה על מילה → onPick(שורה, מילה, נקודה) לפי מיקום הלחיצה', () => {
    const onPick = vi.fn()
    const { container } = render(<ScanWordOverlay {...base} onPick={onPick} />)
    const svg = container.querySelector('svg')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 400, right: 300, bottom: 400 })
    const hit = screen.getByTestId('scan-hit-lines')
    expect(hit.querySelectorAll('rect')).toHaveLength(2)
    // (150, 32) במסך = (300, 64) בתמונה → שורה 0, מילה 1
    fireEvent.click(hit.querySelector('rect'), { clientX: 150, clientY: 32 })
    expect(onPick).toHaveBeenCalledWith(0, 1, { x: 300, y: 64 })
    fireEvent.click(hit.querySelector('rect'), { clientX: 150, clientY: 57 })
    expect(onPick).toHaveBeenLastCalledWith(1, null, { x: 300, y: expect.closeTo(114, 6) })
  })

  it('לחיצה ברווח שבין השורות נתפסת בשורה הקרובה; יעדי הלחיצה מכסים את הרווח', () => {
    const onPick = vi.fn()
    const { container } = render(<ScanWordOverlay {...base} onPick={onPick} />)
    const svg = container.querySelector('svg')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800 })
    const rects = screen.getByTestId('scan-hit-lines').querySelectorAll('rect')
    // רווח של 20 בין השורות → כל שורה מתרחבת בחצי ממנו (ועוד מעט)
    expect(Number(rects[0].getAttribute('y'))).toBeLessThan(50)
    expect(Number(rects[0].getAttribute('y')) + Number(rects[0].getAttribute('height'))).toBeGreaterThanOrEqual(90)
    fireEvent.click(rects[0], { clientX: 450, clientY: 86 })
    expect(onPick).toHaveBeenLastCalledWith(0, 0, { x: 450, y: 86 })
    fireEvent.click(rects[1], { clientX: 450, clientY: 95 })
    expect(onPick).toHaveBeenLastCalledWith(1, null, { x: 450, y: 95 })
  })

  it('במצב בחירת אזור (interactive=false) — אין יעדי לחיצה; בלי ממדים — לא מצייר', () => {
    const { container, rerender } = render(<ScanWordOverlay {...base} onPick={() => {}} interactive={false} />)
    expect(screen.queryByTestId('scan-hit-lines')).toBeNull()
    expect(container.querySelector('svg').style.pointerEvents).toBe('none')
    rerender(<ScanWordOverlay {...base} width={0} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('בלי שורה נוכחית — רק יעדי הלחיצה, בלי פס/מסגרת/תג', () => {
    render(<ScanWordOverlay {...base} lineBox={null} wordBox={null} lineNumber={null} onPick={() => {}} />)
    expect(screen.queryByTestId('scan-line-band')).toBeNull()
    expect(screen.queryByTestId('scan-word-frame')).toBeNull()
    expect(screen.queryByTestId('scan-line-badge')).toBeNull()
    expect(screen.getByTestId('scan-hit-lines')).toBeInTheDocument()
  })

  it('clientToSource: לפי המלבן של השכבה', () => {
    const flat = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 400 }) }
    expect(clientToSource(flat, 160, 220, 600, 800)).toEqual({ x: 300, y: 400 })
    expect(clientToSource({ getBoundingClientRect: () => ({ width: 0, height: 0 }) }, 1, 1, 600, 800)).toBeNull()
  })

  it('wordFrameBox: ריווח ועיגול יחסיים לגובה השורה; בלי גובה שורה — לפי המילה', () => {
    expect(wordFrameBox([100, 50, 200, 70], 40)).toEqual({ box: [84, 40, 216, 80], rx: 10 })
    expect(wordFrameBox([100, 50, 200, 70], 0)).toEqual({ box: [92, 45, 208, 75], rx: 5 })
  })

  it('תזוזת סמן (מילה/שורה אחרת) לא בונה מחדש את אזורי הלחיצה של השורות', () => {
    const onPick = vi.fn()
    const { container, rerender } = render(<ScanWordOverlay {...base} onPick={onPick} />)
    const before = container.querySelector('[data-testid="scan-hit-lines"] rect[data-line="1"]')
    rerender(<ScanWordOverlay {...base} onPick={onPick} lineBox={LINES[1].bbox} wordBox={null} lineNumber={4} />)
    expect(container.querySelector('[data-testid="scan-hit-lines"] rect[data-line="1"]')).toBe(before)
    expect(container.querySelectorAll('[data-testid="scan-hit-lines"] rect')).toHaveLength(2)
  })
})

describe('bandEdgeBoxes', () => {
  it('קו עליון ותחתון בעובי t, מוזחים פנימה מהקצוות', () => {
    expect(bandEdgeBoxes([0, 10, 100, 40], 2, 6)).toEqual([[6, 10, 94, 12], [6, 38, 94, 40]])
  })
  it('פס צר/נמוך — הקווים לא חורגים ולא מתהפכים', () => {
    expect(bandEdgeBoxes([0, 0, 8, 2], 5, 6)).toEqual([[4, 0, 4, 1], [4, 1, 4, 2]])
  })
})
