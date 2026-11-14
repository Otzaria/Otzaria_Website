'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLoadedData } from '@/components/admin/list/useListData'
import { serverKey } from '@/lib/adminPagesScreen/pagesQuery'
import { listPages, loadFilterOptions } from './pagesApi'

const EMPTY = { pages: [], total: 0, checked: 0 }
const NO_OPTIONS = { books: [], users: [] }

/**
 * הנתונים של "עמודים": הרשימה — לפי מה שהשרת מסנן (מצב, ספר, משתמש); כשאחד מהם משתנה, נטענת מחדש (עם שלד).
 * כשבשרת יותר מ-5,000 — ההמשך נטען בבקשות נוספות (listPages), ובינתיים loadProgress: { loaded, total } ("טוען…
 * 10,000 מתוך 14,617"). "בלי שינוי יותר מ-", המיון והעמוד — לא נוגעים בבקשה. patch — שינוי מקומי אחרי פעולה.
 * רשימות הבוררים (ספרים, משתמשים) — בקשה נפרדת, פעם אחת; optionsReady — כשהגיעו (אם נכשלה — הבוררים ריקים).
 *
 * @param {import('@/lib/adminPagesScreen/pagesQuery').PagesQuery} query
 * @param {{ onRefreshError?: (error: any, retry: () => Promise<boolean>) => void }} [options]
 */
export function usePagesData(query, { onRefreshError } = {}) {
  const key = serverKey(query)
  const [loadProgress, setLoadProgress] = useState(null)
  // הבקשה תלויה רק במפתח של השרת — לא במיון / בעמוד / ב"בלי שינוי יותר מ-"
  const loader = useCallback(async () => {
    try {
      return await listPages(query, { onProgress: setLoadProgress })
    } finally {
      setLoadProgress(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const { data, setData, ...rest } = useLoadedData(loader, { initial: EMPTY, merge: (_, loaded) => loaded || EMPTY, onRefreshError })

  const patch = useCallback((changed) => {
    if (changed.length === 0) return
    const byId = new Map(changed.map((p) => [p.id, p]))
    setData((d) => ({ ...d, pages: d.pages.map((p) => byId.get(p.id) || p) }))
  }, [setData])

  const [options, setOptions] = useState({ ...NO_OPTIONS, ready: false })
  useEffect(() => {
    let alive = true
    loadFilterOptions().then((o) => { if (alive) setOptions({ ...o, ready: true }) }, () => { if (alive) setOptions({ ...NO_OPTIONS, ready: false }) })
    return () => { alive = false }
  }, [])

  return { ...rest, pages: data.pages, total: data.total, checked: data.checked, loadProgress, key, patch, options }
}
