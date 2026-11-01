import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useEffect, useState } from 'react'
import RichTextArea from './RichTextArea'
import { isEditorField, queryEditorField, richFieldApi } from '@/lib/editor/editorField'
import { replaceFieldSelection, replaceFieldValue } from '@/lib/editor/applyFieldEdit'
import { resetFieldHistories } from '@/components/editor/v2/fieldHistoryStore'

beforeEach(() => resetFieldHistories())

function Controlled({ initial, onValue }) {
  const [v, setV] = useState(initial)
  return (
    <RichTextArea
      value={v}
      onChange={(e) => {
        setV(e.target.value)
        onValue?.(e.target.value)
      }}
    />
  )
}

const fire = (el, inputType, data = null) =>
  el.dispatchEvent(new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }))

describe('RichTextArea', () => {
  it('renders formatting instead of tags', () => {
    const { container } = render(<RichTextArea value={'<b>שם.</b> טקסט\n<h2>כותרת</h2>'} onChange={() => {}} />)
    const host = container.querySelector('[data-rich-textarea]')
    const lines = host.querySelectorAll('.rt-line')
    expect(lines).toHaveLength(2)
    expect(lines[0].textContent).toBe('שם. טקסט')
    expect(lines[0].querySelector('.rt-b')?.textContent).toBe('שם.')
    expect(lines[1].querySelector('.rt-h2')?.textContent).toBe('כותרת')
    expect(host.textContent).not.toContain('<')
  })

  it('unknown tags are chips without text content', () => {
    const { container } = render(<RichTextArea value={'<d>x</d>'} onChange={() => {}} />)
    const chips = container.querySelectorAll('.rt-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].getAttribute('data-label')).toBe('<d>')
    expect(chips[0].getAttribute('contenteditable')).toBe('false')
  })

  it('is found as an editor field and exposes a textarea-like interface', () => {
    const { container } = render(<RichTextArea value="abc<b>def</b>" data-column="right" onChange={() => {}} />)
    const host = queryEditorField(container, 'right')
    expect(isEditorField(host)).toBe(true)
    expect(host.value).toBe('abc<b>def</b>')
    host.setSelectionRange(6, 9)
    expect([host.selectionStart, host.selectionEnd]).toEqual([6, 9])
    expect(typeof richFieldApi(host)?.undo).toBe('function')
  })

  it('replaceRange: exact raw replacement (also removing tags around unchanged text) in one undo step', () => {
    const onValue = vi.fn()
    const { container } = render(<Controlled initial="a <b>bc</b> d" onValue={onValue} />)
    const host = container.querySelector('[data-rich-textarea]')
    host.focus()
    host.setSelectionRange(5, 7)
    richFieldApi(host).replaceRange(2, 11, 'bc')
    expect(onValue).toHaveBeenLastCalledWith('a bc d')
    expect(host.value).toBe('a bc d')
    expect(richFieldApi(host).undo()).toBe(true)
    expect(host.value).toBe('a <b>bc</b> d')
  })

  it('typing edits the raw string at the caret and keeps the tags; undo restores', () => {
    const onValue = vi.fn()
    const { container } = render(<Controlled initial="abc<b>def</b>" onValue={onValue} />)
    const host = container.querySelector('[data-rich-textarea]')
    host.focus()
    host.setSelectionRange(9, 9)
    fire(host, 'insertText', 'x')
    expect(onValue).toHaveBeenLastCalledWith('abc<b>defx</b>')
    fire(host, 'insertParagraph')
    expect(host.value).toBe('abc<b>defx</b>\n')
    fire(host, 'deleteContentBackward')
    expect(host.value).toBe('abc<b>defx</b>')
    expect(richFieldApi(host).undo()).toBe(true)
    expect(host.value).toBe('abc<b>defx</b>\n')
  })

  it('ערך חיצוני ששווה לערך שנשלח קודם (ניקוי ספרות אחרי הקלדת ספרה) — מוחל (QA P2-10)', () => {
    let setExternal
    function Host({ onSetter }) {
      const [v, setV] = useState('אב')
      useEffect(() => onSetter(setV), [onSetter])
      return <RichTextArea value={v} onChange={(e) => setV(e.target.value)} />
    }
    const { container } = render(<Host onSetter={(fn) => { setExternal = fn }} />)
    const host = container.querySelector('[data-rich-textarea]')
    host.focus()
    host.setSelectionRange(2, 2)
    act(() => { fire(host, 'insertText', '5') })
    expect(host.value).toBe('אב5')
    act(() => { fire(host, 'deleteContentBackward') })
    act(() => { fire(host, 'insertText', '7') })
    expect(host.value).toBe('אב7')
    // "ניקוי ספרות" מחזיר ערך שכבר נשלח פעם ("אב") — חייב להיות מוחל
    act(() => setExternal('אב'))
    expect(host.value).toBe('אב')
    // וגם ערך שהיה הד ביניים ("אב5")
    act(() => setExternal('אב5'))
    expect(host.value).toBe('אב5')
  })

  it('replaceFieldValue (החלף הכול/איות/חיפושים קבועים): ערך מדויק, בלי שכפול תגים, וביטול בצעד אחד (QA P0)', () => {
    const onValue = vi.fn()
    const start = '<h2>כותרת 1</h2>\nאב <b>גד 2</b> הו\n<h2>שנייה</h2>'
    const { container } = render(<Controlled initial={start} onValue={onValue} />)
    const host = container.querySelector('[data-rich-textarea]')
    const next = start.replace(/[0-9]/g, '')
    act(() => { expect(replaceFieldValue(host, next)).toBe(true) })
    expect(host.value).toBe(next)
    expect(onValue).toHaveBeenLastCalledWith(next)
    expect(richFieldApi(host).undo()).toBe(true)
    expect(host.value).toBe(start)
  })

  it('replaceFieldSelection: החלפת הבחירה בלבד, התגים נשמרים', () => {
    const { container } = render(<Controlled initial={'<b>אבג</b> דה'} />)
    const host = container.querySelector('[data-rich-textarea]')
    host.focus()
    host.setSelectionRange(11, 13)
    act(() => { replaceFieldSelection(host, 'זח') })
    expect(host.value).toBe('<b>אבג</b> זח')
  })

  it('הקלדה מעל בחירה שנקבעה בקוד (מאמצע <b> עד אחריו) — התגים נשארים מאוזנים (QA P1)', () => {
    const { container } = render(<Controlled initial={'<b>אבגד</b> הו'} />)
    const host = container.querySelector('[data-rich-textarea]')
    host.focus()
    host.setSelectionRange(5, 14) // מ"ג" שבתוך <b> עד סוף "הו"
    act(() => { fire(host, 'insertText', 'ז') })
    expect(host.value).toBe('<b>אבז</b>')
    act(() => { host.setSelectionRange(3, 10); fire(host, 'insertFromPaste', 'שלום עולם') })
    expect((host.value.match(/<b>/g) || []).length).toBe((host.value.match(/<\/b>/g) || []).length)
  })

  it('an external value replaces the content', () => {
    const { container, rerender } = render(<RichTextArea value="a" onChange={() => {}} />)
    rerender(<RichTextArea value={'<i>b</i>'} onChange={() => {}} />)
    const host = container.querySelector('[data-rich-textarea]')
    expect(host.value).toBe('<i>b</i>')
    expect(host.querySelector('.rt-i')?.textContent).toBe('b')
  })
})
