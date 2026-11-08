// הגנה על שינויים שלא נשמרו: אזהרת הדפדפן (beforeunload), "אחורה" שנוחת על רשומה כפולה ושואל,
// חזרה למקום כשמבטלים, והסרת הרשומה כשנשמר; guardLeave לניווט בתוך האתר — ואחרי אישור ההגנה משתחררת.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { leavingLink, unsavedConfirm, useUnsavedChangesGuard } from './useUnsavedChangesGuard'

const api = {}
function Probe({ dirty, confirmLeave, trapBack = true, guardLinks = true }) {
  const { guardLeave } = useUnsavedChangesGuard(dirty, confirmLeave, { trapBack, guardLinks })
  useEffect(() => { api.guardLeave = guardLeave })
  return null
}

const beforeUnload = () => {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

afterEach(() => window.history.replaceState(null, '', '/'))

describe('useUnsavedChangesGuard', () => {
  test('beforeunload — רק כשיש שינויים', () => {
    const { rerender } = render(<Probe dirty={false} confirmLeave={vi.fn()} />)
    expect(beforeUnload()).toBe(false)
    rerender(<Probe dirty confirmLeave={vi.fn()} />)
    expect(beforeUnload()).toBe(true)
    rerender(<Probe dirty={false} confirmLeave={vi.fn()} />)
    expect(beforeUnload()).toBe(false)
  })

  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  test('"אחורה" עם שינויים: נשארים באותה כתובת ונשאלים; "הישאר" — הרשומה הכפולה חוזרת', async () => {
    window.history.replaceState(null, '', '/list')
    window.history.pushState(null, '', '/list/categories')
    const confirmLeave = vi.fn(async () => false)
    const before = window.history.length
    render(<Probe dirty confirmLeave={confirmLeave} />)
    expect(window.history.length).toBe(before + 1)
    await act(async () => { window.history.back(); await wait(50) })
    expect(confirmLeave).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/list/categories')
    expect(window.history.state?.__unsavedGuard).toBe(true)
  })

  test('"אחורה" ואישור — "אחורה" נוסף, אמיתי', async () => {
    window.history.replaceState(null, '', '/list')
    window.history.pushState(null, '', '/list/instructions')
    render(<Probe dirty confirmLeave={async () => true} />)
    await act(async () => { window.history.back(); await wait(150) })
    expect(window.location.pathname).toBe('/list')
  })

  test('נשמר בלי לצאת — הרשומה הכפולה מוסרת', async () => {
    window.history.replaceState(null, '', '/list/categories')
    const { rerender } = render(<Probe dirty confirmLeave={vi.fn()} />)
    expect(window.history.state?.__unsavedGuard).toBe(true)
    act(() => { rerender(<Probe dirty={false} confirmLeave={vi.fn()} />) })
    await act(async () => { await wait(200) })
    expect(window.history.state?.__unsavedGuard).toBeUndefined()
    expect(window.location.pathname).toBe('/list/categories')
  })

  test('trapBack=false — רק beforeunload, בלי רשומה כפולה', () => {
    window.history.replaceState(null, '', '/list')
    const before = window.history.length
    render(<Probe dirty confirmLeave={vi.fn()} trapBack={false} />)
    expect(window.history.length).toBe(before)
    expect(beforeUnload()).toBe(true)
  })

  test('guardLeave: בלי שינויים — מיד; עם שינויים — שואל, ואחרי אישור משתחרר', async () => {
    const confirmLeave = vi.fn(async () => true)
    const { rerender } = render(<Probe dirty={false} confirmLeave={confirmLeave} />)
    expect(await api.guardLeave()).toBe(true)
    expect(confirmLeave).not.toHaveBeenCalled()
    rerender(<Probe dirty confirmLeave={confirmLeave} />)
    expect(await api.guardLeave()).toBe(true)
    expect(confirmLeave).toHaveBeenCalledTimes(1)
    expect(beforeUnload()).toBe(false)
    expect(await api.guardLeave()).toBe(true)
    expect(confirmLeave).toHaveBeenCalledTimes(1)
  })

  describe('קישורים', () => {
    // מה שמגיע למטה — כלומר מה ש-next/link היה מקבל
    let reached
    const onBubble = (event) => {
      event.preventDefault()
      reached.push(event.target.closest('a')?.getAttribute('href'))
    }
    const page = (dirty, confirmLeave, props) => (
      <>
        <a href="/other">עמוד אחר</a>
        <a href="/list?view=store">תצוגה אחרת</a>
        <a href="/list">אותו עמוד</a>
        <a href="/other" target="_blank">לשונית חדשה</a>
        <a href="/other.zip" download>הורדה</a>
        <a href="/api/x">נקודת קצה</a>
        <a href="https://example.com/">אתר אחר</a>
        <Probe dirty={dirty} confirmLeave={confirmLeave} trapBack={false} {...props} />
      </>
    )
    const click = async (text, init) => {
      await act(async () => {
        const link = [...document.querySelectorAll('a')].find((a) => a.textContent === text)
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
        await wait(0)
      })
    }

    beforeEach(() => {
      reached = []
      window.history.replaceState(null, '', '/list')
      document.addEventListener('click', onBubble)
    })
    afterEach(() => document.removeEventListener('click', onBubble))

    test('"הישאר": הלחיצה נעצרת, ושום ניווט לא קורה', async () => {
      const confirmLeave = vi.fn(async () => false)
      render(page(true, confirmLeave))
      await click('עמוד אחר')
      expect(confirmLeave).toHaveBeenCalledTimes(1)
      expect(reached).toEqual([])
    })

    test('"צא": הקישור נלחץ שוב כרגיל, בלי שאלה נוספת', async () => {
      const confirmLeave = vi.fn(async () => true)
      render(page(true, confirmLeave))
      await click('תצוגה אחרת')
      await act(async () => { await wait(0) })
      expect(confirmLeave).toHaveBeenCalledTimes(1)
      expect(reached).toEqual(['/list?view=store'])
    })

    test('בלי שינויים — הקישור עובד רגיל', async () => {
      const confirmLeave = vi.fn()
      render(page(false, confirmLeave))
      await click('עמוד אחר')
      expect(confirmLeave).not.toHaveBeenCalled()
      expect(reached).toEqual(['/other'])
    })

    test('guardLinks=false — לא נעצר', async () => {
      const confirmLeave = vi.fn()
      render(page(true, confirmLeave, { guardLinks: false }))
      await click('עמוד אחר')
      expect(confirmLeave).not.toHaveBeenCalled()
      expect(reached).toEqual(['/other'])
    })

    test.each([
      ['אותו עמוד', {}], ['לשונית חדשה', {}], ['הורדה', {}], ['נקודת קצה', {}], ['אתר אחר', {}],
      ['עמוד אחר', { ctrlKey: true }], ['עמוד אחר', { metaKey: true }],
    ])('לא עוזב את הדף בלי אזהרה משלו: %s %j', async (text, init) => {
      const confirmLeave = vi.fn()
      render(page(true, confirmLeave))
      await click(text, init)
      expect(confirmLeave).not.toHaveBeenCalled()
      expect(reached).toHaveLength(1)
    })

    test('שתי לחיצות בזמן שהחלון פתוח — שאלה אחת', async () => {
      let answer
      const confirmLeave = vi.fn(() => new Promise((resolve) => { answer = resolve }))
      render(page(true, confirmLeave))
      await click('עמוד אחר')
      await click('עמוד אחר')
      expect(confirmLeave).toHaveBeenCalledTimes(1)
      await act(async () => { answer(false); await wait(0) })
      expect(reached).toEqual([])
    })

    describe('עם רשומה כפולה (trapBack) — "עצור וצא" בפעולה מרובה', () => {
      // סדר האירועים: "אחורה" שמגיע אחרי שהקישור נלחץ מבטל בדפדפן את הניווט של הקישור
      let log
      const onPop = () => log.push('popstate')
      const onReach = (event) => log.push('click ' + event.target.closest('a')?.getAttribute('href'))
      beforeEach(() => {
        log = []
        window.addEventListener('popstate', onPop)
        document.addEventListener('click', onReach)
      })
      afterEach(() => {
        window.removeEventListener('popstate', onPop)
        document.removeEventListener('click', onReach)
      })

      test('קישור בסרגל → "עצור וצא" (הפעולה נעצרת, dirty מתאפס) → הקישור נלחץ אחרי שהרשומה הוסרה', async () => {
        function Screen() {
          const [running, setRunning] = useState(true)
          return page(running, async () => { setRunning(false); return true }, { trapBack: true })
        }
        render(<Screen />)
        expect(window.history.state?.__unsavedGuard).toBe(true)
        await click('עמוד אחר')
        await act(async () => { await wait(150) })
        expect(log).toEqual(['popstate', 'click /other'])
        expect(reached).toEqual(['/other'])
        expect(log.at(-1)).toBe('click /other')
        expect(window.history.state?.__unsavedGuard).toBeUndefined()
      })

      test('"צא" כשהפעולה עדיין רצה — הרשומה הכפולה מוסרת לפני הקישור', async () => {
        render(page(true, async () => true, { trapBack: true }))
        await click('עמוד אחר')
        await act(async () => { await wait(150) })
        expect(reached).toEqual(['/other'])
        expect(log).toEqual(['popstate', 'click /other'])
      })

      test('"הישאר" — נשארים, והרשומה הכפולה במקומה', async () => {
        render(page(true, async () => false, { trapBack: true }))
        await click('עמוד אחר')
        await act(async () => { await wait(150) })
        expect(reached).toEqual([])
        expect(log).toEqual([])
        expect(window.history.state?.__unsavedGuard).toBe(true)
      })
    })

    test('leavingLink: לחיצה מחוץ לקישור', () => {
      const event = new MouseEvent('click', { bubbles: true })
      Object.defineProperty(event, 'target', { value: document.body })
      expect(leavingLink(event)).toBeNull()
    })
  })

  test('unsavedConfirm: אותו חלון בכל מסך, ורק הגוף משתנה', () => {
    expect(unsavedConfirm('השינויים בקטגוריות לא נשמרו.')).toEqual({
      title: 'לצאת בלי לשמור?', body: 'השינויים בקטגוריות לא נשמרו.', confirmLabel: 'צא בלי לשמור', cancelLabel: 'הישאר', tone: 'danger',
    })
  })
})
