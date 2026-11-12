'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiCall } from './adminApi'

// טעינת נתונים ממסך הניהול: GET לנתיב (יחסי ל-API), מחדש בכל שינוי בנתיב או ב-reload().
// מחזיר {data, error, loading, reload, setData}; setData — עדכון מקומי אחרי פעולה (בלי טעינה מחדש).
// הנתיב null — לא טוענים. refreshKey — שינוי שלו (מבחוץ) טוען מחדש.
// data שייך לנתיב שלו: כשהנתיב משתנה (מסנן אחר, עמוד אחר) data הוא null עד שהתשובה החדשה מגיעה — כך הרשימה
// הקודמת לא מוצגת כאילו היא תוצאת המסנן החדש (שלד טעינה במקומה). ב-reload() לאותו נתיב — הנתונים נשארים, ו-loading true.

export default function useAdminData(path, refreshKey = 0) {
  const [tick, setTick] = useState(0)
  const key = path ? `${path}\n${tick}\n${refreshKey}` : null
  // dataPath — לאיזה נתיב data שייך; doneKey — איזו בקשה הסתיימה אחרונה
  const [state, setState] = useState({ data: null, dataPath: null, error: null, doneKey: null })

  useEffect(() => {
    if (!path) return undefined
    let on = true
    apiCall(path).then((r) => {
      if (!on) return
      setState((s) => (r.ok ? { data: r.data, dataPath: path, error: null, doneKey: key } : { ...s, error: r.error, doneKey: key }))
    })
    return () => {
      on = false
    }
  }, [path, key])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), [])

  return {
    data: path && state.dataPath === path ? state.data : null,
    error: key && state.doneKey === key ? state.error : null,
    loading: !!key && state.doneKey !== key,
    reload,
    setData,
  }
}
