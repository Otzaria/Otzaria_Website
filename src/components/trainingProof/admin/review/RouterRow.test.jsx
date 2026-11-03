import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RouterRow, { markOf } from './RouterRow'

// שורה בסקירת הנתב: תיקון לפני האישור (ה-11) — כתב-השורה בכפתורים, ובשורה מעורבת לחיצה
// על מסגרת-מילה מחליפה את הכתב שלה; שם-הכתב מעל המסגרת (ה-7), לא בתוכה.

const words = [0, 1, 2].map((k) => ({ k, box: [400 - k * 120, 0, 500 - k * 120, 50], pred: 'square', text: '' }))
const item = (extra = {}) => ({
  id: 'r1',
  section: 'router',
  status: 'submitted',
  img: '/r.png',
  w: 540,
  h: 54,
  alias: 'ספר 388',
  page: 3,
  pred: 'mixed',
  predP: 0.7,
  words,
  result: { label: 'mixed', bad: false, words: words.map((w) => ({ k: w.k, box: w.box, label: 'square' })), words_src: 'station' },
  vol: { id: 'v', name: 'רחל' },
  agrees: true,
  ...extra,
})
const handlers = () => ({ onToggle: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onFix: vi.fn(), onUnapprove: vi.fn() })

describe('RouterRow', () => {
  it('שם הכתב של כל מילה מעל המסגרת שלה', () => {
    const { container } = render(<RouterRow item={item()} selected={false} {...handlers()} />)
    const boxes = container.querySelectorAll('[data-word]')
    expect(boxes).toHaveLength(3)
    const label = boxes[0].querySelector('span')
    expect(label).toHaveTextContent('מרובע')
    expect(label.className).toMatch(/bottom-full/)
  })

  it('לחיצה על מסגרת מחליפה כתב; "אשר עם התיקון" שולח את כל המילים', () => {
    const h = handlers()
    const { container } = render(<RouterRow item={item()} selected={false} {...h} />)
    fireEvent.click(container.querySelector('[data-word="1"]'))
    expect(container.querySelector('[data-word="1"] span')).toHaveTextContent('רש"י')
    fireEvent.click(screen.getByRole('button', { name: /אשר עם התיקון/ }))
    expect(h.onFix).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), {
      label: 'mixed',
      words: [
        { k: 0, box: words[0].box, label: 'square' },
        { k: 1, box: words[1].box, label: 'rashi' },
        { k: 2, box: words[2].box, label: 'square' },
      ],
    })
    expect(h.onApprove).not.toHaveBeenCalled()
  })

  it('כתב-השורה בכפתורים; חזרה לסימון של המתנדב = "אשר" רגיל', () => {
    const h = handlers()
    render(<RouterRow item={item({ result: { label: 'square', bad: false } , pred: 'square', agrees: true })} selected={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'רש"י' }))
    expect(screen.getByText('תיקון שלך — עוד לא נשמר')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'בטל את התיקון' }))
    fireEvent.click(screen.getByRole('button', { name: /^check אשר$/ }))
    expect(h.onApprove).toHaveBeenCalled()
    expect(h.onFix).not.toHaveBeenCalled()
  })

  it('שורה בלי מילים — אי אפשר להפוך למעורבת; פסול', () => {
    const h = handlers()
    render(<RouterRow item={item({ words: null, pred: 'rashi', result: { label: 'rashi', bad: false } })} selected={false} {...h} />)
    expect(screen.getByRole('button', { name: 'מעורבת' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'פסול' }))
    fireEvent.click(screen.getByRole('button', { name: /אשר עם התיקון/ }))
    expect(h.onFix).toHaveBeenCalledWith(expect.anything(), { bad: true })
  })

  it('"הצג בעמוד המלא" — רק כשיש עמוד; פותח את העמוד עם השורה מסומנת', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const { unmount } = render(<RouterRow item={item()} selected={false} {...handlers()} />)
    expect(screen.queryByRole('button', { name: /הצג בעמוד המלא/ })).toBeNull()
    unmount()
    const ctx = { img: '/api/admin/training-proof/items/r1/ctx', bbox: [10, 20, 110, 70] }
    render(<RouterRow item={item({ ctx })} selected={false} {...handlers()} />)
    fireEvent.click(screen.getByRole('button', { name: /הצג בעמוד המלא/ }))
    const dialog = screen.getByRole('dialog', { name: 'השורה בעמוד המלא' })
    expect(dialog).toHaveAccessibleDescription('ספר 388 · עמוד 3')
    const img = screen.getByRole('img', { name: 'העמוד המלא' })
    expect(img).toHaveAttribute('src', ctx.img)
    Object.defineProperty(img, 'naturalWidth', { value: 200 })
    Object.defineProperty(img, 'naturalHeight', { value: 100 })
    Element.prototype.scrollIntoView = vi.fn()
    fireEvent.load(img)
    expect(screen.getByTestId('tp-fullpage-mark').style.left).toBe('5%')
  })

  it('markOf', () => {
    expect(markOf({ label: 'latin' })).toEqual({ label: 'latin' })
    expect(markOf({ label: 'bad' })).toEqual({ bad: true })
  })
})
