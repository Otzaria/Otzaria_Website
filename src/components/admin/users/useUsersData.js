'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useLoadedData } from '@/components/admin/list/useListData'
import { listUsers } from './usersApi'

const LOAD_ERROR = { message: 'השרת לא החזיר את רשימת המשתמשים. נסה שוב בעוד רגע.', status: 0 }

/**
 * הנתונים של "משתמשים" — על המנגנון המשותף (admin/list/useLoadedData): הרשימה מוכנה מהשרת (initialUsers,
 * page.jsx — בלי שלד בכניסה), ואם הטעינה בשרת נכשלה (initialError) — שגיאה ו"נסה שוב". retry — טעינה מחדש
 * עם שלד; refresh — בשקט. תשובה ישנה לא דורסת שינוי מקומי (ונטענת שוב).
 *
 * patch — שינוי מקומי במשתמש אחד אחרי שמירה; remove — אחרי מחיקה. get — המשתמש השמור העדכני ברגע הקריאה
 * (לא מהרינדור האחרון): בקשה שנבנית בתור אחרי בקשה אחרת רואה את מה שהקודמת שמרה.
 *
 * @param {{ initialUsers?: any[], initialError?: boolean, onRefreshError?: (error: any, retry: () => Promise<boolean>) => void }} options
 */
export function useUsersData({ initialUsers, initialError = false, onRefreshError }) {
  const { data, setData, ...rest } = useLoadedData(listUsers, {
    initial: initialError ? [] : initialUsers || [],
    preloaded: !initialError,
    initialError: initialError ? LOAD_ERROR : null,
    merge: (_, loaded) => (Array.isArray(loaded) ? loaded : []),
    onRefreshError,
  })
  const mirror = useRef(data)
  useEffect(() => { mirror.current = data }, [data])

  const patch = useCallback((change) => {
    const apply = (list) => list.map((u) => (u._id === change._id ? { ...u, ...change } : u))
    mirror.current = apply(mirror.current)
    setData(apply)
  }, [setData])
  const remove = useCallback((id) => {
    const apply = (list) => list.filter((u) => u._id !== id)
    mirror.current = apply(mirror.current)
    setData(apply)
  }, [setData])
  const get = useCallback((id) => mirror.current.find((u) => u._id === id) || null, [])

  return { users: data, ...rest, patch, remove, get }
}
