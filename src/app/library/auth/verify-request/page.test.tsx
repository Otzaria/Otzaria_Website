// בדיקות ל-polling ב-VerifyRequestPage: מוודאות שהאינטרוול של 5 שניות שממתין
// לאימות המשתמש מוקם פעם אחת בלבד ולא נהרס ונבנה מחדש בכל update() - זו
// הייתה התקלה: session היה ברשימת התלויות של ה-effect שמריץ את ה-interval,
// ו-update() עצמו מייצר בכל קריאה אובייקט session חדש (הפניה שונה), כך
// שכל סבב polling הרס ובנה מחדש את הטיימר בלי סיבה אמיתית (isVerified לא
// השתנה בפועל).
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import VerifyRequestPage from './page'

const pushMock = vi.fn()
const mockUpdateSpy = vi.fn()
let mockIsVerified = false

vi.mock('next-auth/react', () => ({
  // מדמה את ההתנהגות האמיתית של next-auth: update() מרענן state פנימי
  // ומחזיר (ומעדכן ל-) אובייקט session חדש (הפניה שונה בכל קריאה, גם אם
  // isVerified לא השתנה) - בדיוק כמו next-auth האמיתי.
  useSession: () => {
    const [session, setSession] = useState({ user: { isVerified: mockIsVerified } })
    const update = async () => {
      mockUpdateSpy()
      const next = { user: { isVerified: mockIsVerified } }
      setSession(next)
      return next
    }
    return { data: session, update }
  },
  signOut: vi.fn(),
}))

// next/navigation.useRouter האמיתי מחזיר אובייקט router יציב (אותה הפניה)
// בין רינדורים - בניגוד לפונקציה שמייצרת אובייקט חדש בכל קריאה.
const mockRouterObject = { push: pushMock }
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouterObject,
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setIntervalSpy: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clearIntervalSpy: any

beforeEach(() => {
  pushMock.mockClear()
  mockUpdateSpy.mockClear()
  mockIsVerified = false
  vi.useFakeTimers()
  setIntervalSpy = vi.spyOn(global, 'setInterval')
  clearIntervalSpy = vi.spyOn(global, 'clearInterval')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('VerifyRequestPage polling', () => {
  test('מקים אינטרוול אחד בלבד ולא הורס/בונה מחדש אותו כשה-session מתחלף בלי ש-isVerified השתנה', async () => {
    render(<VerifyRequestPage />)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    for (let i = 1; i <= 4; i++) {
      // כל סבב תלוי בקודם (זמן מדומה מצטבר) - לכן הלולאה סדרתית בכוונה
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
    }

    expect(mockUpdateSpy).toHaveBeenCalledTimes(4)
    // הליבה של התיקון: אין סיבה שה-effect שמריץ את ה-interval ירוץ מחדש רק
    // בגלל שה-session קיבל הפניה חדשה (isVerified עדיין false) - האינטרוול
    // המקורי היחיד ממשיך לפעול.
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).not.toHaveBeenCalled()
  })

  test('מפנה לדשבורד ברגע שה-polling מזהה שהמשתמש אומת', async () => {
    render(<VerifyRequestPage />)

    mockIsVerified = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(pushMock).toHaveBeenCalledWith('/library/dashboard')
  })

  test('לא מפעיל polling כלל כאשר המשתמש כבר מאומת מלכתחילה', async () => {
    mockIsVerified = true
    render(<VerifyRequestPage />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })

    expect(mockUpdateSpy).not.toHaveBeenCalled()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })
})
