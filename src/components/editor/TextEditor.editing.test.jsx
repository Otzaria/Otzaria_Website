import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TextEditor from './TextEditor'
import { useUndoAvailability } from '@/hooks/useUndoAvailability'
import { useCaretPosition } from '@/hooks/useCaretPosition'
import { queryEditorField } from '@/lib/editor/editorField'
import { resetFieldHistories } from '@/components/editor/v2/fieldHistoryStore'

// רגרסיה: בתצוגת הקוד "בחר הכל" + מחיקה (וכל עריכה אחרת) לא נמחקו, והסמן קפץ לסוף הטקסט.
// הסיבה: מאזין input ב-capture על document (useUndoAvailability) עשה setState בתוך האירוע.
// בדפדפן, בין מאזין למאזין של אירוע אמיתי רצים microtasks — ה-render של React רץ שם, לפני
// ש-onChange קרא את הערך החדש, והחזיר ל-textarea (controlled) את הערך הישן.
//
// ב-jsdom האירוע נשלח מ-JS ולכן אין microtask בין המאזינים — מדמים את זה: כל מאזין capture
// שנרשם על document מקבל אחריו flushSync(), שמריץ מיד render שתוזמן בתוכו (בדיוק מה שה-microtask
// עושה בדפדפן). מאזין שדוחה את ה-setState (requestAnimationFrame) — לא מושפע.

const realAdd = document.addEventListener
const realRemove = document.removeEventListener
const wrapped = new WeakMap()

beforeEach(() => {
  resetFieldHistories()
  document.addEventListener = function (type, fn, opts) {
    const capture = opts === true || (typeof opts === 'object' && opts?.capture)
    if (!capture || typeof fn !== 'function') return realAdd.call(this, type, fn, opts)
    let w = wrapped.get(fn)
    if (!w) {
      w = function (e) {
        const r = fn.call(this, e)
        flushSync(() => {})
        return r
      }
      wrapped.set(fn, w)
    }
    return realAdd.call(this, type, w, opts)
  }
  document.removeEventListener = function (type, fn, opts) {
    return realRemove.call(this, type, wrapped.get(fn) || fn, opts)
  }
})

afterEach(() => {
  document.addEventListener = realAdd
  document.removeEventListener = realRemove
})

const TEXT = 'שורה ראשונה <b>מודגש</b>\nשורה שנייה\nשורה שלישית'

/** החיווט של עמוד העריכה: TextEditor בתוך .editor-container + המאזינים ברמת המסמך */
function Page({ textView, onValue }) {
  const [content, setContent] = useState(TEXT)
  const containerRef = useRef(null)
  const { canUndo } = useUndoAvailability(containerRef, 'p1')
  useCaretPosition()
  return (
    <div>
      <div ref={containerRef} className="editor-container">
        <TextEditor
          content={content}
          handleAutoSave={(t) => {
            setContent(t)
            onValue?.(t)
          }}
          setActiveTextarea={() => {}}
          textAlign="right"
          textZoom={16}
          textView={textView}
        />
      </div>
      <span data-testid="undo">{canUndo ? 'U' : '-'}</span>
    </div>
  )
}

const field = () => queryEditorField(document.querySelector('.editor-container'))
const nextFrame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))))

describe('TextEditor — עריכה עם המאזינים של עמוד העריכה', () => {
  describe('תצוגת קוד (textarea)', () => {
    it('בחר הכל + Backspace — הכל נמחק', async () => {
      const user = userEvent.setup()
      render(<Page textView="code" />)
      const ta = /** @type {HTMLTextAreaElement} */ (field())
      await user.click(ta)
      await user.keyboard('{Control>}a{/Control}{Backspace}')
      expect(ta.value).toBe('')
      expect(ta.selectionStart).toBe(0)
    })

    it('בחר הכל + Delete — הכל נמחק', async () => {
      const user = userEvent.setup()
      render(<Page textView="code" />)
      const ta = /** @type {HTMLTextAreaElement} */ (field())
      await user.click(ta)
      await user.keyboard('{Control>}a{/Control}{Delete}')
      expect(ta.value).toBe('')
    })

    it('Backspace / Delete בודדים ובחירה שמוחלפת באות — הסמן נשאר במקום', async () => {
      const user = userEvent.setup()
      const values = []
      render(<Page textView="code" onValue={(v) => values.push(v)} />)
      const ta = /** @type {HTMLTextAreaElement} */ (field())
      await user.click(ta)

      ta.setSelectionRange(5, 5)
      await user.keyboard('{Backspace}')
      expect(ta.value).toBe(TEXT.slice(0, 4) + TEXT.slice(5))
      expect(ta.selectionStart).toBe(4)

      ta.setSelectionRange(0, 0)
      await user.keyboard('{Delete}')
      expect(ta.value).toBe(TEXT.slice(1, 4) + TEXT.slice(5))
      expect(ta.selectionStart).toBe(0)

      // בחירה שחוצה שורות → אות אחת במקומה
      const before = ta.value
      const nl = before.indexOf('\n')
      ta.setSelectionRange(nl - 2, nl + 3)
      await user.keyboard('x')
      expect(ta.value).toBe(before.slice(0, nl - 2) + 'x' + before.slice(nl + 3))
      expect(ta.selectionStart).toBe(nl - 1)
      expect(values.at(-1)).toBe(ta.value)
    })

    it('"אפשר לבטל" מתעדכן בפריים הבא, לא בתוך האירוע', async () => {
      const user = userEvent.setup()
      render(<Page textView="code" />)
      const ta = field()
      await user.click(ta)
      await user.keyboard('{Control>}a{/Control}{Backspace}')
      await nextFrame()
      expect(screen.getByTestId('undo').textContent).toBe('U')
    })
  })

  describe('תצוגה מעוצבת', () => {
    const beforeInput = (el, inputType, data = null) =>
      act(() => {
        el.dispatchEvent(new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }))
      })

    it('בחר הכל + מחיקה — הכל נמחק, והמעבר לקוד מציג את הערך העדכני', async () => {
      const values = []
      const { rerender } = render(<Page textView="rich" onValue={(v) => values.push(v)} />)
      const host = field()
      host.focus()
      host.setSelectionRange(0, host.value.length)
      await beforeInput(host, 'deleteContentBackward')
      expect(values.at(-1)).toBe('')
      expect(host.value).toBe('')

      rerender(<Page textView="code" onValue={(v) => values.push(v)} />)
      expect(field().tagName).toBe('TEXTAREA')
      expect(field().value).toBe('')
    })

    it('מחיקה בקוד ואז מעבר למעוצבת — הערך העדכני', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<Page textView="code" />)
      const ta = field()
      await user.click(ta)
      ta.setSelectionRange(0, 5)
      await user.keyboard('{Backspace}')
      const edited = TEXT.slice(5)
      expect(ta.value).toBe(edited)

      rerender(<Page textView="rich" />)
      expect(field().value).toBe(edited)
      field().setSelectionRange(0, 1)
      await beforeInput(field(), 'deleteContentForward')
      expect(field().value).toBe(edited.slice(1))

      rerender(<Page textView="code" />)
      expect(field().value).toBe(edited.slice(1))
    })
  })
})
