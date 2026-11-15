'use client'

import { useCallback, useRef, useState } from 'react'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { refreshAdminBadgeCounts } from '@/components/admin/shell/useAdminBadgeCounts'
import { countsAfter, decisionBody, itemsAfterDecision } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { NOT_FOUND_TEXT, doneToast } from '@/lib/adminPageReportsScreen/pageReportsTerms'
import { decidePageReport } from './pageReportsApi'

const withKey = (map, key, value) => {
  const next = new Map(map)
  if (value == null) next.delete(key)
  else next.set(key, value)
  return next
}

/**
 * ההכרעות על דיווחים — אחת לכל המסך:
 *   כל פעולה יוצאת מיד (בלי השהיית "בטל"): "פתח מחדש" מחזיר כל הכרעה שעוד לא הוחלה, והחלה על הטקסט — רק
 *   בבחירה מפורשת (תיבת סימון כבויה כברירת מחדל, עם הסבר מה יקרה).
 *   הצלחה — הדיווח המעודכן מהשרת נכנס במקומו, או יוצא מהרשימה כשכבר לא מתאים לסינון (אושר בסינון "ממתין"; הפוקוס —
 *   לכרטיס שבא במקומו, beforeRemove). המונים בלשוניות ובסינון מתעדכנים מיד, מוני הסרגל מתבקשים מחדש, וכשכרטיס יצא —
 *   רענון שקט של העמוד, כדי שהעמוד יתמלא מהבא אחריו.
 *   applyResult 'not_found' — ההחלטה נשמרה אבל הטקסט לא השתנה: הודעה בכרטיס (אם נשאר) או הודעה קופצת שנשארת.
 *   כשל — הודעת השרת בכרטיס (409: "העמוד בעריכה" / "הטקסט השתנה בינתיים"), ואחרי 409 — רענון שקט, כדי שמצב העמוד
 *   והאפשרות להחיל יהיו עדכניים.
 *
 * @param {{ query: { kind: string, status: string }, data: { setData: Function, refresh: () => Promise<boolean> }, toast: any,
 *   beforeRemove: (ids: string[]) => void }} options
 */
export function usePageReportActions({ query, data, toast, beforeRemove }) {
  const { busy, track } = useBusyIds()
  // הגנה מלחיצה כפולה: busy הוא state, ושתי לחיצות באותו רינדור (או A ואז לחיצה) רואות אותו לפני העדכון — ה-ref מיידי
  const inFlight = useRef(new Set())
  const [errors, setErrors] = useState(() => new Map())
  const [notices, setNotices] = useState(() => new Map())
  const { setData, refresh } = data
  const { kind, status } = query

  const decide = useCallback(async (report, action, options = {}) => {
    const id = String(report._id)
    if (busy.has(id) || inFlight.current.has(id)) return false
    inFlight.current.add(id)
    setErrors((m) => withKey(m, id, null))
    setNotices((m) => withKey(m, id, null))
    let result
    try {
      result = await track([id], () => decidePageReport(id, decisionBody(action, options)))
    } catch (error) {
      setErrors((m) => withKey(m, id, { text: error?.message || 'הפעולה לא הצליחה. נסה שוב.', sessionExpired: Boolean(error?.sessionExpired) }))
      if (error?.status === 409) refresh()
      return false
    } finally {
      inFlight.current.delete(id)
    }

    const updated = { ...report, ...(result.report || {}) }
    const { removed } = itemsAfterDecision([report], updated, status)
    if (removed) beforeRemove([id])
    setData((d) => ({
      ...d,
      reports: itemsAfterDecision(d.reports, updated, status).items,
      counts: countsAfter(d.counts, kind, report.status, updated.status),
      total: removed ? Math.max(0, d.total - 1) : d.total,
    }))

    const notFound = result.applyResult === 'not_found'
    if (notFound && !removed) setNotices((m) => withKey(m, id, 'not_found'))
    toast.show(notFound && removed
      ? { tone: 'info', message: `${doneToast(action, updated)}. ${NOT_FOUND_TEXT}`, duration: null }
      : { message: doneToast(action, updated, result.applyResult) })

    refreshAdminBadgeCounts()
    if (removed) refresh()
    return true
  }, [busy, track, refresh, beforeRemove, setData, status, kind, toast])

  /** מעבר לשונית / סינון: הודעות השגיאה של כרטיסים שכבר לא מוצגים יורדות */
  const clearMessages = useCallback(() => {
    setErrors(new Map())
    setNotices(new Map())
  }, [])

  return { decide, busy, errors, notices, clearMessages }
}
