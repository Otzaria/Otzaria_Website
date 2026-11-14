'use client'

import { useCallback, useRef, useState } from 'react'
import { normalizeBook } from '@/lib/adminBooks/bookTerms'
import { fetchBooks, fetchCategories } from './booksApi'

const LOAD_ERROR = 'השרת לא החזיר את רשימת הספרים. נסה שוב בעוד רגע.'

/**
 * הנתונים של מסך הספרים: הספרים והקטגוריות — מוכנים מהשרת (initialBooks / initialCategories). אם
 * הטעינה בשרת נכשלה (initialError) — שגיאה בתוך הדף ו"נסה שוב" (ולא "אין ספרים", שהיה שקר).
 * retry — טעינה מחדש עם שלד; refresh — בשקט (הרשימה נשארת עד שהחדשה מגיעה), אחרי פעולה.
 * status: loading / ready / error; sessionExpired — הכשל הוא התחברות שפגה; status (במספר) — קוד התשובה
 * (403 — אין הרשאה: אין טעם ב"נסה שוב").
 * מרוץ: כל טעינה מקבלת מספר, ורק התשובה של האחרונה נכנסת — תשובה ישנה שמגיעה מאוחר (רענון אחרי מיזוג
 * מול "רענן" ידני) לא דורסת חדשה.
 */
export function useBooksData({ initialBooks, initialCategories, initialError = false }) {
  const [books, setBooks] = useState(() => (initialError ? [] : (initialBooks || []).map(normalizeBook)))
  const [categories, setCategories] = useState(() => initialCategories || [])
  const [status, setStatus] = useState(initialError ? 'error' : 'ready')
  const [error, setError] = useState({ message: initialError ? LOAD_ERROR : '', sessionExpired: false, status: 0 })
  const seq = useRef(0)

  const load = useCallback(async ({ silent = false } = {}) => {
    const mine = ++seq.current
    if (!silent) setStatus('loading')
    try {
      const [list, cats] = await Promise.all([fetchBooks(), fetchCategories().catch(() => null)])
      if (mine !== seq.current) return
      setBooks(list)
      if (cats) setCategories(cats)
      setStatus('ready')
    } catch (e) {
      // רענון שקט שנכשל, או טעינה שכבר הוחלפה בחדשה — הרשימה הקיימת נשארת
      if (silent || mine !== seq.current) return
      setError({ message: e?.message || LOAD_ERROR, sessionExpired: Boolean(e?.sessionExpired), status: Number(e?.status) || 0 })
      setStatus('error')
    }
  }, [])

  const retry = useCallback(() => load(), [load])
  const refresh = useCallback(() => load({ silent: true }), [load])

  return { books, setBooks, categories, setCategories, status, error, retry, refresh }
}
