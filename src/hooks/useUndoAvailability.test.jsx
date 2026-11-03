import { beforeEach, describe, it, expect } from 'vitest'
import { useRef, useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUndoAvailability } from './useUndoAvailability'
import TextEditor from '@/components/editor/TextEditor'
import { queryEditorField } from '@/lib/editor/editorField'
import { editorFieldHistory } from '@/components/editor/v2/textareaHistory'
import { resetFieldHistories } from '@/components/editor/v2/fieldHistoryStore'

// ההיסטוריה שייכת לשדה הלוגי (מחוץ לרכיב) — כל בדיקה מתחילה בעמוד חדש
beforeEach(() => resetFieldHistories())

const TEXT = 'שורה ראשונה\nשורה שנייה'

function Page({ textView = 'code', initial = TEXT, pageKey = 'p1' }) {
  const [content, setContent] = useState(initial)
  const containerRef = useRef(null)
  const { canUndo, canRedo } = useUndoAvailability(containerRef, `${pageKey}#${textView}`)
  return (
    <div>
      <div ref={containerRef} className="editor-container">
        <TextEditor
          content={content}
          handleAutoSave={setContent}
          setActiveTextarea={() => {}}
          textAlign="right"
          textZoom={16}
          textView={textView}
        />
      </div>
      <textarea data-testid="outside" />
      <button type="button" onClick={() => setContent('ערך חדש מבחוץ')}>external</button>
      <span data-testid="state">{`${canUndo ? 'U' : '-'}${canRedo ? 'R' : '-'}`}</span>
    </div>
  )
}

const nextFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))
const state = () => screen.getByTestId('state').textContent
const field = () => /** @type {HTMLTextAreaElement} */ (queryEditorField(document.querySelector('.editor-container')))

describe('useUndoAvailability — תצוגת קוד', () => {
  it('בטעינה — אין מה לבטל', async () => {
    render(<Page />)
    await nextFrame()
    expect(state()).toBe('--')
  })

  it('הקלדה של מילים → צעד לכל מילה; ביטול של הכל → הכפתור מושבת, ביצוע מחדש זמין', async () => {
    const user = userEvent.setup()
    render(<Page />)
    const ta = field()
    await user.click(ta)
    ta.setSelectionRange(ta.value.length, ta.value.length)
    await user.keyboard(' אבג דהו')
    await nextFrame()
    expect(ta.value).toBe(TEXT + ' אבג דהו')
    expect(state()).toBe('U-')

    // צעד = מילה (לא תו): ביטול אחד מסיר את "דהו" כולה
    await user.keyboard('{Control>}z{/Control}')
    expect(ta.value).toBe(TEXT + ' אבג ')
    await user.keyboard('{Control>}z{/Control}')
    expect(ta.value).toBe(TEXT + ' ')
    await user.keyboard('{Control>}z{/Control}')
    expect(ta.value).toBe(TEXT)
    await nextFrame()
    expect(state()).toBe('-R')

    await user.keyboard('{Control>}y{/Control}')
    await nextFrame()
    expect(ta.value).toBe(TEXT + ' ')
    expect(state()).toBe('UR')
  })

  it('ביטול דרך ה-API (כפתור הסרגל) — מעדכן את ה-state של React', async () => {
    const user = userEvent.setup()
    render(<Page />)
    const ta = field()
    await user.click(ta)
    await user.keyboard('א')
    act(() => { editorFieldHistory(ta)?.undo() })
    await nextFrame()
    expect(ta.value).toBe(TEXT)
    expect(state()).toBe('-R')
  })

  it('מתעלם מ-textarea מחוץ למכל', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.type(screen.getByTestId('outside'), 'abc')
    await nextFrame()
    expect(state()).toBe('--')
  })

  it('ערך חדש מבחוץ (טעינה/החלפה) מנקה את ההיסטוריה', async () => {
    const user = userEvent.setup()
    render(<Page />)
    await user.click(field())
    await user.keyboard('א')
    await nextFrame()
    expect(state()).toBe('U-')
    await user.click(screen.getByRole('button', { name: 'external' }))
    await nextFrame()
    expect(state()).toBe('--')
  })
})

describe('useUndoAvailability — תצוגה מעוצבת ומעבר תצוגה', () => {
  it('עריכה בקוד ומעבר לתצוגה המעוצבת — ההיסטוריה ממשיכה: הביטול זמין ומחזיר את הערך', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Page />)
    await user.click(field())
    await user.keyboard('א')
    await nextFrame()
    expect(state()).toBe('U-')
    rerender(<Page textView="rich" />)
    await nextFrame()
    expect(state()).toBe('U-')
    const el = field()
    act(() => { editorFieldHistory(el)?.undo() })
    await nextFrame()
    expect(el.value).toBe(TEXT)
    expect(state()).toBe('-R')
  })

  it('עריכה במעוצבת ומעבר לקוד — ביטול בקוד, ביצוע מחדש במעוצבת', async () => {
    const { rerender } = render(<Page textView="rich" />)
    const el = field()
    act(() => {
      el.focus()
      el.setSelectionRange(0, 0)
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'א' }))
    })
    expect(el.value).toBe('א' + TEXT)
    rerender(<Page textView="code" />)
    await nextFrame()
    expect(state()).toBe('U-')
    const ta = field()
    expect(ta.tagName).toBe('TEXTAREA')
    act(() => { editorFieldHistory(ta)?.undo() })
    await nextFrame()
    expect(ta.value).toBe(TEXT)
    expect(state()).toBe('-R')
    rerender(<Page textView="rich" />)
    await nextFrame()
    expect(state()).toBe('-R')
    act(() => { editorFieldHistory(field())?.redo() })
    expect(field().value).toBe('א' + TEXT)
  })

  it('מעבר עמוד (resetFieldHistories) — גם עם אותו טקסט, אין מה לבטל', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Page />)
    await user.click(field())
    await user.keyboard('א')
    await nextFrame()
    expect(state()).toBe('U-')
    resetFieldHistories()
    rerender(<Page pageKey="p2" />)
    await nextFrame()
    expect(state()).toBe('--')
  })

  it('תצוגה מעוצבת — לפי richHistory: עריכה → זמין, ביטול → מושבת', async () => {
    render(<Page textView="rich" />)
    const el = field()
    const api = editorFieldHistory(el)
    expect(api).not.toBeNull()
    act(() => {
      el.focus()
      el.setSelectionRange(0, 0)
      el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'א' }))
    })
    await nextFrame()
    expect(state()).toBe('U-')
    act(() => { api?.undo() })
    await nextFrame()
    expect(el.value).toBe(TEXT)
    expect(state()).toBe('-R')
  })
})
