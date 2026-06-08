'use client'

import { memo, useMemo } from 'react'
import { diffWords } from '@/lib/dicta/text-diff'

/**
 * תצוגת diff עם הדגשת המילים שהשתנו בתוך הקטע (אדום=הוסר, ירוק=נוסף).
 * משותף לתור האישורים ולעמוד הקונפליקטים.
 *
 * ביצועים: diffWords בונה טבלת DP בגודל O(n*m), לכן מחושב פעם אחת לכל מקטע
 * דרך useMemo (תלוי ב-changes בלבד), והרכיב עטוף ב-memo כדי שרינדורים מחדש של
 * ההורה (בחירה/busy/סינון) לא יחשבו את ה-diff שוב.
 *
 * @param {{changes: Array<{before:string, after:string}>, total?: number}} props
 */
function DiffPreview({ changes, total }) {
  const rows = useMemo(
    () => (changes || []).map((c) => ({ c, segs: diffWords(c.before, c.after) })),
    [changes]
  )

  if (!rows.length) return <div className="text-sm text-slate-400">אין תצוגה מקדימה</div>
  return (
    <div className="space-y-2 font-mono text-sm" dir="rtl">
      {rows.map(({ c, segs }, i) => (
        <div key={i} className="rounded-lg overflow-hidden border border-slate-200">
          {c.before !== '' && (
            <div className="bg-red-50 text-red-800 px-3 py-1 whitespace-pre-wrap break-words border-r-4 border-red-300">
              {segs.filter((s) => s.type !== 'add').map((s, k) =>
                s.type === 'del'
                  ? <span key={k} className="bg-red-300/60 rounded-sm">{s.text}</span>
                  : <span key={k}>{s.text}</span>
              )}
            </div>
          )}
          {c.after !== '' && (
            <div className="bg-emerald-50 text-emerald-800 px-3 py-1 whitespace-pre-wrap break-words border-r-4 border-emerald-300">
              {segs.filter((s) => s.type !== 'del').map((s, k) =>
                s.type === 'add'
                  ? <span key={k} className="bg-emerald-300/60 rounded-sm">{s.text}</span>
                  : <span key={k}>{s.text}</span>
              )}
            </div>
          )}
        </div>
      ))}
      {total > rows.length && <div className="text-xs text-slate-400">…ועוד {total - rows.length} מקטעים</div>}
    </div>
  )
}

export default memo(DiffPreview)
