import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FramesEditor } from './framesEditorSlot'

// סקירת הגלאי: Enter בעורך = "אשר את העמוד"; אחרי שינוי במסגרות — "תקן ואשר" עם המסגרות שבעורך.
// עמוד שכבר אושר — Enter לא עושה דבר.

const F1 = { fid: 'f1', kind: 'text', role: 'body', box: [100, 100, 500, 700], stream: 's1', ord: 1, cont: false, src: 'auto' }
const page = (status) => ({ id: 'p1', w: 1000, h: 1400, img: '/x.jpg', page: 3, status, frames: [F1], result: { status: 'marked', frames: [F1] } })
const STREAMS = [{ id: 's1', name: 'פנים', role: 'body' }]
const enter = () => act(() => void fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' }))

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 700, right: 500, bottom: 700, x: 0, y: 0 })
})

describe('framesEditorSlot — Enter', () => {
  it('בלי שינוי — אישור; אחרי שינוי — תקן ואשר', () => {
    const onApprove = vi.fn()
    const onSave = vi.fn()
    render(<FramesEditor page={page('submitted')} streams={STREAMS} onApprove={onApprove} onSave={onSave} />)
    enter()
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
    // שינוי: בחירת המסגרת ומחיקתה
    const s = screen.getByTestId('page-surface')
    fireEvent.pointerDown(s, { clientX: 150, clientY: 200, button: 0, pointerId: 1 })
    fireEvent.pointerUp(s, { clientX: 150, clientY: 200, button: 0, pointerId: 1 })
    act(() => void fireEvent.keyDown(window, { key: 'Delete', code: 'Delete' }))
    enter()
    expect(onSave).toHaveBeenCalledWith({ status: 'marked', frames: [] })
    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('עמוד שאושר — לקריאה בלבד, Enter לא מאשר', () => {
    const onApprove = vi.fn()
    render(<FramesEditor page={page('approved')} streams={STREAMS} onApprove={onApprove} onSave={vi.fn()} />)
    enter()
    expect(onApprove).not.toHaveBeenCalled()
  })
})
