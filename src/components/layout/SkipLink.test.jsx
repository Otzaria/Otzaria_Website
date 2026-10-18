// בדיקות ל"דלג לתוכן": היעד (findSkipTarget) — לפי המזהה, ובלעדיו ה-<main> המוצג;
// ולחיצה מעבירה את הפוקוס ליעד בלי לשנות את כתובת העמוד.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SkipLink, { findSkipTarget } from './SkipLink'

// jsdom לא מחשב layout — getClientRects תמיד ריק. כאן: אלמנט מוצג, אלא אם הוא (או אב שלו)
// מסומן hidden — כמו display:none בדפדפן
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function () {
    return this.closest('[hidden]') ? [] : [{}]
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('findSkipTarget', () => {
  test('האלמנט עם id="main-content" — גם כשהוא לא ה-<main> עצמו (עורכי דיקטה)', () => {
    document.body.innerHTML = '<header></header><div id="main-content"><main>עורך</main></div>'
    expect(findSkipTarget()).toBe(document.getElementById('main-content'))
  })

  test('בלי מזהה — ה-<main> של העמוד', () => {
    document.body.innerHTML = '<div><header>ניווט</header><main id="page">תוכן</main></div>'
    expect(findSkipTarget().id).toBe('page')
  })

  test('המזהה על אלמנט מוסתר — ה-<main> המוצג', () => {
    document.body.innerHTML = '<main id="main-content" hidden>מוסתר</main><main id="pending">ממתין</main>'
    expect(findSkipTarget().id).toBe('pending')
  })

  test('בלי <main> מוצג — null', () => {
    document.body.innerHTML = '<div>עמוד</div><main hidden>מוסתר</main>'
    expect(findSkipTarget()).toBe(null)
  })
})

describe('SkipLink', () => {
  test('קישור עוגן ל-#main-content, ולחיצה מעבירה אליו את הפוקוס', () => {
    render(
      <>
        <SkipLink />
        <main id="main-content">תוכן</main>
      </>
    )
    const link = screen.getByRole('link', { name: 'דלג לתוכן' })
    expect(link).toHaveAttribute('href', '#main-content')

    fireEvent.click(link)
    const main = document.getElementById('main-content')
    expect(main).toHaveFocus()
    expect(main).toHaveAttribute('tabindex', '-1')

    // ה-tabindex הזמני מוסר כשהפוקוס יוצא
    main.blur()
    expect(main).not.toHaveAttribute('tabindex')
  })
})
