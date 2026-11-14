import { describe, expect, test, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { ToastProvider, useToast } from './Toast'

function Trigger({ options, label = 'הצג' }) {
  const toast = useToast()
  return <button type="button" onClick={() => toast.show(typeof options === 'function' ? options() : options)}>{label}</button>
}

const renderWith = (options) => render(<ToastProvider><Trigger options={options} /><input aria-label="שדה" /></ToastProvider>)
const showButton = () => screen.getByRole('button', { name: 'הצג' })

afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  test('אזורי ההכרזה קיימים לפני ההודעה הראשונה, וההודעה נכנסת ל-role="status"', async () => {
    renderWith({ message: 'ההעלאה הועברה לאשפה' })
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    await userEvent.setup().click(showButton())
    expect(status).toHaveTextContent('ההעלאה הועברה לאשפה')
  })

  test('"בטל" מריץ את הפעולה וסוגר את ההודעה; onDismiss נקרא פעם אחת', async () => {
    const undo = vi.fn()
    const onDismiss = vi.fn()
    renderWith({ message: 'נמחק', action: { label: 'בטל', onClick: undo, undo: true }, onDismiss })
    const user = userEvent.setup()
    await user.click(showButton())
    const button = screen.getByRole('button', { name: /בטל/ })
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z')
    await user.click(button)
    expect(undo).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('נמחק')).not.toBeInTheDocument()
  })

  test('שגיאה — role="alert" ונשארת; הצלחה נסגרת לבד; עם פעולה — לא נסגרת בטיימר', () => {
    vi.useFakeTimers()
    const { rerender } = renderWith({ message: 'לא הצלחנו', tone: 'error' })
    act(() => showButton().click())
    expect(screen.getByRole('alert')).toHaveTextContent('לא הצלחנו')
    act(() => vi.advanceTimersByTime(60000))
    expect(screen.getByRole('alert')).toHaveTextContent('לא הצלחנו')

    rerender(<ToastProvider><Trigger options={{ message: 'נשמר' }} /></ToastProvider>)
    act(() => showButton().click())
    act(() => vi.advanceTimersByTime(5100))
    expect(screen.queryByText('נשמר')).not.toBeInTheDocument()

    rerender(<ToastProvider><Trigger options={{ message: 'הועבר', action: { label: 'בטל', onClick() {}, undo: true } }} /></ToastProvider>)
    act(() => showButton().click())
    act(() => vi.advanceTimersByTime(10 * 60000))
    expect(screen.getByText('הועבר')).toBeInTheDocument()
  })

  test('הצלחה לא נסגרת כל עוד יש עליה ריחוף או פוקוס', () => {
    vi.useFakeTimers()
    renderWith({ message: 'נשמר' })
    act(() => showButton().click())
    const toast = screen.getByText('נשמר').closest('[data-toast]')
    fireEvent.mouseEnter(toast)
    act(() => vi.advanceTimersByTime(20000))
    expect(screen.getByText('נשמר')).toBeInTheDocument()
    fireEvent.mouseLeave(toast)
    act(() => screen.getByRole('button', { name: 'סגור הודעה' }).focus())
    act(() => vi.advanceTimersByTime(20000))
    expect(screen.getByText('נשמר')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'סגור הודעה' }).blur())
    act(() => vi.advanceTimersByTime(5100))
    expect(screen.queryByText('נשמר')).not.toBeInTheDocument()
  })

  test('Ctrl+Z מפעיל את "בטל" של ההודעה האחרונה — אבל לא בתוך שדה טקסט', async () => {
    const first = vi.fn()
    const second = vi.fn()
    let n = 0
    renderWith(() => {
      n += 1
      return { message: `פעולה ${n}`, action: { label: 'בטל', onClick: n === 1 ? first : second, undo: true } }
    })
    const user = userEvent.setup()
    await user.click(showButton())
    await user.click(showButton())

    screen.getByRole('textbox', { name: 'שדה' }).focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(second).not.toHaveBeenCalled()

    showButton().focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(second).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('פעולה 2')).not.toBeInTheDocument()
    await user.keyboard('{Control>}z{/Control}')
    expect(first).toHaveBeenCalledTimes(1)
  })

  test('צבירה: הצגה עם id של הודעה פתוחה מעדכנת אותה במקום', async () => {
    function Aggregate() {
      const toast = useToast()
      const id = useRef(null)
      const n = useRef(0)
      return (
        <button type="button" onClick={() => {
          n.current += 1
          id.current = toast.show({ id: id.current ?? undefined, message: `${n.current} ספרים הועברו לאשפה`, action: { label: 'בטל', onClick() {}, undo: true } })
        }}>מחק</button>
      )
    }
    render(<ToastProvider><Aggregate /></ToastProvider>)
    const user = userEvent.setup()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'מחק' }))
    expect(screen.getAllByRole('button', { name: /בטל/ })).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('3 ספרים הועברו לאשפה')
  })

  test('לכל היותר 3; הודעה עם "בטל" ושגיאה לא נדחקות בגלל הודעות רגילות', async () => {
    let n = 0
    renderWith(() => {
      n += 1
      if (n === 1) return { message: 'עם בטל', action: { label: 'בטל', onClick() {}, undo: true } }
      if (n === 2) return { message: 'שגיאה', tone: 'error' }
      return { message: `רגילה ${n}` }
    })
    const user = userEvent.setup()
    for (let i = 0; i < 6; i++) await user.click(showButton())
    expect(screen.getByText('עם בטל')).toBeInTheDocument()
    expect(screen.getByText('שגיאה')).toBeInTheDocument()
    expect(screen.getAllByText(/רגילה/)).toHaveLength(1)
    await user.click(screen.getAllByRole('button', { name: 'סגור הודעה' })[0])
    expect(screen.queryByText('עם בטל')).not.toBeInTheDocument()
  })

  test('הודעה זהה לא נערמת; שגיאות שונות — עד 3, הוותיקה יורדת', async () => {
    let n = 0
    let same = true
    renderWith(() => {
      n += 1
      return { message: same ? 'לא הצלחנו לאשר את השורה.' : `שגיאה ${n}`, tone: 'error' }
    })
    const user = userEvent.setup()
    for (let i = 0; i < 5; i++) await user.click(showButton())
    expect(screen.getAllByText('לא הצלחנו לאשר את השורה.')).toHaveLength(1)
    same = false
    for (let i = 0; i < 4; i++) await user.click(showButton())
    expect(screen.getAllByRole('button', { name: 'סגור הודעה' })).toHaveLength(3)
    expect(screen.queryByText('לא הצלחנו לאשר את השורה.')).not.toBeInTheDocument()
    expect(screen.getByText('שגיאה 9')).toBeInTheDocument()
  })

  test('Esc סוגר את ההודעה האחרונה גם כשהפוקוס לא בה — אבל לא בשדה הקלדה ולא כשחלון פתוח', async () => {
    renderWith({ message: 'לא הצלחנו', tone: 'error' })
    const user = userEvent.setup()
    await user.click(showButton())
    await user.click(screen.getByRole('textbox', { name: 'שדה' }))
    await user.keyboard('{Escape}')
    expect(screen.getByText('לא הצלחנו')).toBeInTheDocument()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByText('לא הצלחנו')).toBeInTheDocument()
    dialog.remove()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByText('לא הצלחנו')).not.toBeInTheDocument()
  })

  test('provider מקונן — אותה ערימה (אזור הכרזה אחד)', async () => {
    render(<ToastProvider><ToastProvider><Trigger options={{ message: 'פעם אחת' }} /></ToastProvider></ToastProvider>)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await userEvent.setup().click(showButton())
    expect(screen.getAllByText('פעם אחת')).toHaveLength(1)
  })

  test('action.href — קישור (למשל "התחבר" אחרי שההתחברות פגה)', async () => {
    renderWith({ message: 'פג תוקף ההתחברות', tone: 'error', action: { label: 'התחבר', href: '/auth/login' } })
    await userEvent.setup().click(showButton())
    expect(screen.getByRole('link', { name: 'התחבר' })).toHaveAttribute('href', '/auth/login')
  })

  test('useToast מחוץ ל-ToastProvider — שגיאה ברורה', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger options={{}} />)).toThrow(/ToastProvider/)
  })
})
