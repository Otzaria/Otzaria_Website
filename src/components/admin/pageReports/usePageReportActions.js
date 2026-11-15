'use client'

import { useCallback, useRef, useState } from 'react'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { refreshAdminBadgeCounts } from '@/components/admin/shell/useAdminBadgeCounts'
import { countsAfter, decisionBody, itemsAfterDecision } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { doneToast } from '@/lib/adminPageReportsScreen/pageReportsTerms'
import { decidePageReport } from './pageReportsApi'

const withKey = (map, key, value) => {
  const next = new Map(map)
  if (value == null) next.delete(key)
  else next.set(key, value)
  return next
}

/** הכרעה בדיווח ועדכון הרשימה והמונים לאחר תשובת השרת. */
export function usePageReportActions({ query, data, toast, beforeRemove }) {
  const { busy, track } = useBusyIds()
  // הגנה מלחיצה כפולה: busy הוא state, ושתי לחיצות באותו רינדור (או A ואז לחיצה) רואות אותו לפני העדכון — ה-ref מיידי
  const inFlight = useRef(new Set())
  const [errors, setErrors] = useState(() => new Map())
  const { setData, refresh } = data
  const { kind, status } = query

  const decide = useCallback(async (report, action, options = {}) => {
    const id = String(report._id)
    if (busy.has(id) || inFlight.current.has(id)) return false
    inFlight.current.add(id)
    setErrors((m) => withKey(m, id, null))
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

    toast.show({ message: doneToast(action, updated) })

    refreshAdminBadgeCounts()
    if (removed) refresh()
    return true
  }, [busy, track, refresh, beforeRemove, setData, status, kind, toast])

  /** מעבר לשונית / סינון: הודעות השגיאה של כרטיסים שכבר לא מוצגים יורדות */
  const clearMessages = useCallback(() => {
    setErrors(new Map())
  }, [])

  return { decide, busy, errors, clearMessages }
}
