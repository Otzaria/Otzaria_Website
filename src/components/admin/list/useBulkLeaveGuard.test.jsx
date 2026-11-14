// פעולה מרובה באמצע: קישור פנימי שואל "לעצור ולצאת?"; "עצור וצא" עוצר; "הישאר" — לא עוצר ולא יוצא.
// pending בלבד — רק אזהרת הדפדפן, בלי שאלה על קישור.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { SENTINEL } from '@/hooks/useUnsavedChangesGuard'
import { useBulkLeaveGuard } from './useBulkLeaveGuard'

function Probe(props) {
  useBulkLeaveGuard(props)
  return <a href="/other">עמוד אחר</a>
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const click = async () => {
  await act(async () => {
    document.querySelector('a').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await wait(0)
  })
}
const beforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

let reached
const onBubble = (event) => {
  if (event.defaultPrevented) return
  event.preventDefault()
  reached.push(event.target.getAttribute('href'))
}

describe('useBulkLeaveGuard', () => {
  beforeEach(() => {
    reached = []
    window.history.replaceState(null, '', '/list')
    document.addEventListener('click', onBubble)
  })
  afterEach(async () => {
    document.removeEventListener('click', onBubble)
    await wait(30)
    window.history.replaceState(null, '', '/')
  })

  test('"עצור וצא" — שואל עם הנוסח, עוצר, והקישור ממשיך', async () => {
    const confirm = vi.fn(async () => true)
    const stop = vi.fn()
    render(<Probe running stop={stop} confirm={confirm} body="ההסתרה עוד רצה." />)
    await click()
    await act(async () => { await wait(0) })
    expect(confirm).toHaveBeenCalledWith({ title: 'לעצור ולצאת?', body: 'ההסתרה עוד רצה.', confirmLabel: 'עצור וצא', cancelLabel: 'הישאר' })
    expect(stop).toHaveBeenCalledTimes(1)
    // הקישור נלחץ שוב רק אחרי שה"אחורה" של הסרת הרשומה הכפולה הגיע (popstate ב-jsdom — לא בזמן קבוע)
    await act(async () => { await vi.waitFor(() => expect(reached).toEqual(['/other'])) })
  })

  test('"הישאר" — לא עוצר ולא יוצא', async () => {
    const confirm = vi.fn(async () => false)
    const stop = vi.fn()
    render(<Probe running stop={stop} confirm={confirm} body="x" />)
    await click()
    expect(stop).not.toHaveBeenCalled()
    expect(reached).toEqual([])
  })

  test('pending בלבד — אזהרת הדפדפן, בלי שאלה על קישור', async () => {
    const confirm = vi.fn(async () => true)
    render(<Probe running={false} pending stop={vi.fn()} confirm={confirm} body="x" />)
    expect(beforeUnload()).toBe(true)
    await click()
    expect(confirm).not.toHaveBeenCalled()
    expect(reached).toEqual(['/other'])
  })

  test('בלי פעולה — כלום', () => {
    render(<Probe running={false} stop={vi.fn()} confirm={vi.fn()} body="x" />)
    expect(beforeUnload()).toBe(false)
  })
  describe('מגירה בכתובת (drawerOpen)', () => {
    const popped = () => new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
    const back = async () => {
      await act(async () => {
        const done = popped()
        window.history.back()
        await done
        await wait(0)
      })
    }

    test('פעולה מתחילה כשהמגירה פתוחה — סגירת המגירה לא שואלת "לעצור ולצאת?"', async () => {
      const confirm = vi.fn(async () => true)
      const stop = vi.fn()
      window.history.pushState({}, '', '/list?d=1')
      const { rerender } = render(<Probe running drawerOpen stop={stop} confirm={confirm} body="x" />)
      expect(window.history.state?.[SENTINEL]).toBeFalsy()
      await back()
      rerender(<Probe running drawerOpen={false} stop={stop} confirm={confirm} body="x" />)
      await act(async () => { await wait(20) })
      expect(confirm).not.toHaveBeenCalled()
      expect(stop).not.toHaveBeenCalled()
      expect(window.location.search).toBe('')
    })

    test('הפעולה מסתיימת כשהמגירה פתוחה — אחרי סגירתה לא נשארת רשומה כפולה', async () => {
      const confirm = vi.fn(async () => true)
      const stop = vi.fn()
      const { rerender } = render(<Probe running stop={stop} confirm={confirm} body="x" />)
      expect(window.history.state?.[SENTINEL]).toBe(true)
      window.history.pushState({}, '', '/list?d=1')
      rerender(<Probe running drawerOpen stop={stop} confirm={confirm} body="x" />)
      rerender(<Probe running={false} drawerOpen stop={stop} confirm={confirm} body="x" />)
      await back()
      expect(window.history.state?.[SENTINEL]).toBe(true)
      // הסגירה עצמה עושה "אחורה" (ב-effect) — מחכים ל-popstate שלו
      const done = popped()
      rerender(<Probe running={false} drawerOpen={false} stop={stop} confirm={confirm} body="x" />)
      await act(async () => { await done })
      expect(window.history.state?.[SENTINEL]).toBeFalsy()
      expect(window.location.pathname + window.location.search).toBe('/list')
      expect(confirm).not.toHaveBeenCalled()
    })

    test('המגירה נסגרת והפעולה עוד רצה — "אחורה" אחר כך שואל', async () => {
      const confirm = vi.fn(async () => false)
      const stop = vi.fn()
      const { rerender } = render(<Probe running stop={stop} confirm={confirm} body="x" />)
      window.history.pushState({}, '', '/list?d=1')
      rerender(<Probe running drawerOpen stop={stop} confirm={confirm} body="x" />)
      await back()
      rerender(<Probe running drawerOpen={false} stop={stop} confirm={confirm} body="x" />)
      await act(async () => { await wait(20) })
      expect(window.history.state?.[SENTINEL]).toBe(true)
      expect(confirm).not.toHaveBeenCalled()
      await back()
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(stop).not.toHaveBeenCalled()
    })
  })
})
