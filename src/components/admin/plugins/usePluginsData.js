'use client'

import { useMemo } from 'react'
import { useLoadedData } from '@/components/admin/list/useListData'
import { listCategories, listPlugins } from './pluginsApi'

const INITIAL = { pending: [], approved: [], categories: null }

/** שלוש הבקשות יחד. כשל בקטגוריות לא חוסם (null) */
const loadAll = async () => {
  const [pending, approved, categories] = await Promise.all([
    listPlugins('pending'),
    listPlugins('approved'),
    listCategories().catch(() => null),
  ])
  return { pending, approved, categories }
}

/** תשובה → הנתונים. קטגוריות שנכשלו ברענון שקט — נשארות הקודמות */
const merge = (previous, loaded, { quiet }) => ({
  pending: Array.isArray(loaded?.pending) ? loaded.pending : [],
  approved: Array.isArray(loaded?.approved) ? loaded.approved : [],
  categories: Array.isArray(loaded?.categories) ? loaded.categories : quiet ? previous.categories : null,
})

/**
 * הנתונים של "לאישור" ו"בחנות": שתי הרשימות והקטגוריות — נטענות יחד, כדי שהמונים בלשוניות ובסרגל
 * יהיו נכונים בכל תצוגה. כשל בקטגוריות לא חוסם (רק השיבוץ והסינון לפי קטגוריה לא זמינים).
 *
 * הטעינה עצמה — useLoadedData (admin/list/useListData.js), אותו מנגנון כמו בהצעות העריכה: תשובה ישנה לא
 * דורסת שינוי מקומי (setPending / setApproved / setCategories), ורענון שקט שנכשל לא מחליף את המסך בשגיאה.
 *
 * @param {{ onRefreshError?: (error: any, retry: () => Promise<boolean>) => void }} [options]
 * @returns {{ status: 'loading' | 'ready' | 'error', error: any, pending: any[], approved: any[],
 *   categories: any[] | null, setPending: Function, setApproved: Function, setCategories: Function,
 *   refresh: () => Promise<boolean>, retry: () => void }} refresh — true אם הנתונים עודכנו
 */
export function usePluginsData({ onRefreshError } = {}) {
  const { data, setData, ...rest } = useLoadedData(loadAll, { initial: INITIAL, merge, onRefreshError })

  const setters = useMemo(() => {
    const field = (key) => (next) => setData((d) => ({ ...d, [key]: typeof next === 'function' ? next(d[key]) : next }))
    return { setPending: field('pending'), setApproved: field('approved'), setCategories: field('categories') }
  }, [setData])

  return { ...rest, pending: data.pending, approved: data.approved, categories: data.categories, ...setters }
}
