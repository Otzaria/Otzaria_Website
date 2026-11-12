'use client'

import { useCallback, useState } from 'react'
import { toggleIds } from '@/lib/adminList/selection'

export const SELECTION_CLEARED_TEXT = 'הבחירה בוטלה'

/**
 * בחירה ברשימת ניהול שתלויה בסינון: כשהמפתח (key — הסינון, ולפעמים גם העמוד) משתנה, הבחירה מתאפסת —
 * נגזר ברינדור, בלי effect — וההכרזה "הבחירה בוטלה" (clearedText, ל-BulkActionBar) כשהיה משהו בחירה.
 * מה שמוצג בפועל (חיתוך לפי מה שבסינון / ממתין ל"בטל") — אצל המסך, מעל ids.
 *
 * @param {string} key
 * @param {{ locked?: boolean, announceReset?: boolean }} [options]
 *   locked — בזמן פעולה מרובה: בחירה וניקוי לא עושים כלום; announceReset=false — איפוס בגלל מפתח בלי הכרזה
 * @returns {{ ids: Set<any>, clearedText: string, select: (ids: any[], checked: boolean) => void, clear: () => void,
 *   keep: (ids: Iterable<any>) => void }}
 *   keep — הבחירה הופכת לבדיוק המזהים האלה (אחרי פעולה מרובה: מה שנכשל נשאר מסומן), בלי הכרזה
 */
export function useKeyedSelection(key, { locked = false, announceReset = true } = {}) {
  const [selection, setSelection] = useState({ key, ids: new Set() })
  const [clearedText, setClearedText] = useState('')
  if (selection.key !== key) {
    setSelection({ key, ids: new Set() })
    if (announceReset && selection.ids.size > 0) setClearedText(SELECTION_CLEARED_TEXT)
  }

  const select = useCallback((ids, checked) => {
    if (locked) return
    setClearedText('')
    setSelection((s) => ({ ...s, ids: toggleIds(s.ids, ids, checked) }))
  }, [locked])

  const clear = useCallback(() => {
    if (locked) return
    setSelection((s) => ({ ...s, ids: new Set() }))
    setClearedText(SELECTION_CLEARED_TEXT)
  }, [locked])

  const keep = useCallback((ids) => setSelection((s) => ({ ...s, ids: new Set(ids) })), [])

  return { ids: selection.ids, clearedText, select, clear, keep }
}
