'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * נתונים שנטענים מהשרת למסך ניהול — מנגנון אחד, משותף לרשימות (useListData: הצעות עריכה, התנגשויות) ולתוספים
 * (plugins/usePluginsData, שטוען שלוש רשימות יחד):
 *
 * תשובה ישנה לא דורסת חדשה: seq עולה בכל טעינה ובכל שינוי מקומי (setData קורא לו). טעינה שבזמן שהיא
 * באוויר נעשה שינוי מקומי — נזרקת ונשלחת מחדש, כי התשובה שלה נוצרה לפני השינוי.
 *
 * רענון שקט (refresh, אחרי פעולה) שנכשל לא מחליף נתונים קיימים במסך שגיאה: הנתונים נשארים, ו-onRefreshError
 * מודיע. רק התחברות שפגה או 403 עוברים למסך שגיאה — שם אין טעם להמשיך להציג.
 *
 * נתונים שהגיעו מוכנים מהשרת (Server Component — בלי שלד בכניסה): preloaded — אין טעינה ראשונה, והמצב
 * "ready" מההתחלה; ואם הטעינה בשרת נכשלה — initialError, והמסך מתחיל בשגיאה ("נסה שוב").
 *
 * @template T
 * @param {() => Promise<any>} loader  הבקשה (יציבה — מחוץ לרכיב, או useCallback)
 * @param {{ initial: T, merge?: (previous: T, loaded: any, info: { quiet: boolean }) => T,
 *   onRefreshError?: (error: any, retry: () => Promise<boolean>) => void, preloaded?: boolean, initialError?: any }} options
 *   merge — איך תשובה נכנסת לנתונים (ברירת מחדל: מחליפה אותם).
 * @returns {{ status: 'loading' | 'ready' | 'error', error: any, data: T, setData: (next: T | ((previous: T) => T)) => void,
 *   refresh: () => Promise<boolean>, retry: () => void }} refresh — true אם הנתונים עודכנו
 */
export function useLoadedData(loader, { initial, merge, onRefreshError, preloaded = false, initialError = null }) {
  const [state, setState] = useState(() => {
    if (initialError) return { status: 'error', error: initialError }
    return { status: preloaded ? 'ready' : 'loading', error: null }
  })
  const skipFirstLoad = useRef(preloaded || Boolean(initialError))
  const [data, setValue] = useState(initial)
  const seq = useRef(0)
  const lastLoad = useRef(0)
  const onErrorRef = useRef(onRefreshError)
  const mergeRef = useRef(merge)
  useEffect(() => {
    onErrorRef.current = onRefreshError
    mergeRef.current = merge
  })

  const load = useCallback(async function load({ quiet = false } = {}) {
    const id = ++seq.current
    lastLoad.current = id
    // נדרסה בשינוי מקומי (ולא בטעינה חדשה יותר) — טוענים שוב, מהמצב החדש
    const superseded = () => (lastLoad.current === id ? load({ quiet: true }) : false)
    if (!quiet) setState({ status: 'loading', error: null })
    try {
      const loaded = await loader()
      if (id !== seq.current) return superseded()
      setValue((previous) => (mergeRef.current ? mergeRef.current(previous, loaded, { quiet }) : loaded))
      setState({ status: 'ready', error: null })
      return true
    } catch (error) {
      if (id !== seq.current) return superseded()
      if (quiet && !error?.sessionExpired && error?.status !== 403) onErrorRef.current?.(error, () => load({ quiet: true }))
      else setState({ status: 'error', error })
      return false
    }
  }, [loader])

  useEffect(() => {
    // טעינה ראשונה בלבד (לא כשהנתונים הגיעו מהשרת); ה-setState קורה אחרי await
    if (skipFirstLoad.current) return
    load()
  }, [load])

  const setData = useCallback((next) => {
    seq.current += 1
    setValue(next)
  }, [])

  const refresh = useCallback(() => load({ quiet: true }), [load])
  const retry = useCallback(() => { load() }, [load])

  return { ...state, data, setData, refresh, retry }
}

const EMPTY = []
const toList = (_, loaded) => (Array.isArray(loaded) ? loaded : [])

/**
 * רשימה אחת שנטענת מהשרת (useLoadedData עם מערך).
 * @param {() => Promise<any>} loader  הבקשה (יציבה — מחוץ לרכיב)
 * @param {{ onRefreshError?: (error: any, retry: () => Promise<boolean>) => void }} [options]
 * @returns {{ status: 'loading' | 'ready' | 'error', error: any, items: any[], setItems: Function,
 *   refresh: () => Promise<boolean>, retry: () => void }}
 */
export function useListData(loader, { onRefreshError } = {}) {
  const { data, setData, ...rest } = useLoadedData(loader, { initial: EMPTY, merge: toList, onRefreshError })
  return { ...rest, items: data, setItems: setData }
}
