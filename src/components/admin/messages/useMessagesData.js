'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLoadedData } from '@/components/admin/list/useListData'
import { parseMessagesQuery, serializeMessagesQuery } from '@/lib/adminMessagesScreen/messagesQuery'
import { loadMessages } from './messagesApi'

const toList = (_, loaded) => (Array.isArray(loaded) ? loaded : [])

/**
 * תור ההודעות: מגיע מוכן מהשרת (page.jsx — בלי שלד בכניסה), ורענון שקט אחרי פעולה מ-GET /api/messages?allMessages=true
 * (אותה שאילתה). טעינה בשרת שנכשלה — initialError, והמסך מתחיל ב"לא הצלחנו לטעון" עם "נסה שוב".
 * @param {{ initialMessages?: any[], initialError?: boolean, onRefreshError?: Function }} options
 */
export function useMessagesData({ initialMessages, initialError = false, onRefreshError }) {
  const { data, setData, ...rest } = useLoadedData(loadMessages, {
    initial: initialMessages || [],
    merge: toList,
    preloaded: !initialError,
    initialError: initialError ? { message: 'לא הצלחנו לטעון את ההודעות.' } : null,
    onRefreshError,
  })
  return { ...rest, messages: data, setData }
}

/**
 * הלשונית, החיפוש, "רק חדשות", העמוד והשיחה הפתוחה — מהכתובת ואליה (כמו בשאר מסכי הניהול): replaceState /
 * pushState, ו-Next מסנכרן את useSearchParams בלי לבקש את העמוד מהשרת. push — עמוד ברשימה ופתיחת שיחה (כדי
 * ש"אחורה" יחזיר / יסגור); סינון — replace.
 */
export function useMessagesQuery() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const query = useMemo(() => parseMessagesQuery(searchParams), [searchParams])
  const setQuery = useCallback((next, { push = false } = {}) => {
    const url = `${pathname}${serializeMessagesQuery(next)}`
    if (push) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
  }, [pathname])
  return [query, setQuery]
}
