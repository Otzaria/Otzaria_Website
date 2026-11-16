'use client'

import { useCallback } from 'react'
import { applyFieldEdit } from '@/lib/editor/applyFieldEdit'
import { applyMarkerReplacement, markerActionsFor } from '@/lib/pageReports/markerActions'

/**
 * פעולות על הסימון של דיווח שהוכרע (הפס של ?report=<id>): מחילות את העריכה על השדה בעורך — באותו מסלול כמו
 * שאר העריכות (applyFieldEdit: צעד ביטול אחד, שמירה אוטומטית). לא כותבות לשרת בעצמן ולא משנות את הדיווח.
 * לפני ההחלה מאתרים את הסימון מחדש בטקסט הנוכחי.
 *
 * @param {{ focus: ReturnType<typeof import('./useReportFocus').useReportFocus>,
 *   applyColumnText: (column: 'right'|'left'|'content', text: string) => void }} input
 * @returns {(action: { id: string }) => boolean} האם הטקסט השתנה
 */
export function useReportMarkerActions({ focus, applyColumnText }) {
  const { state, locate, markDone, rehighlight } = focus
  return useCallback((action) => {
    const found = locate()
    if (!found) {
      rehighlight()
      return false
    }
    const { el, hit } = found
    const fresh = markerActionsFor(state?.report, hit, hit.markerText).find((a) => a.id === action?.id)
    if (!fresh) return false
    const changed = applyFieldEdit(
      el,
      (v) => applyMarkerReplacement(v, hit, hit.markerText, fresh.replacement) ?? { value: v, start: hit.start, end: hit.end },
      (text) => applyColumnText(hit.column, text),
    )
    if (changed) markDone(fresh.done)
    return changed
  }, [state, locate, markDone, rehighlight, applyColumnText])
}
