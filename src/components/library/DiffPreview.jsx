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
 * אישור חלקי: כשמועבר selectable=true, כל מקטע ממתין מקבל תיבת-סימון לבחירה
 * (לפי c.idx), ומקטעים שכבר אושרו/נדחו מסומנים בתג ולא ניתנים לבחירה.
 *
 * פתרון קונפליקט מקטע-מקטע: כשמועבר onResolve, כל גרסה (גיטהאב/האתר) מקבלת כפתור
 * "קבל גרסה זו". מקבל את אובייקט המקטע (c) — ההורה מסיר אותו אופטימית מיד, כך שאפשר
 * ללחוץ על מקטעים נוספים בלי להמתין לשרת.
 *
 * @param {{
 *   changes: Array<{idx?:number, before:string, after:string, status?:string}>,
 *   total?: number,
 *   selectable?: boolean,
 *   selected?: Set<number>,
 *   onToggle?: (idx:number) => void,
 *   onResolve?: (change:object, strategy:'ours'|'theirs') => void,
 * }} props
 */
function DiffPreview({ changes, total, selectable = false, selected, onToggle, onResolve }) {
  const rows = useMemo(
    () => (changes || []).map((c) => ({ c, segs: diffWords(c.before, c.after) })),
    [changes]
  )

  if (!rows.length) return <div className="text-sm text-neutral-cool-400">אין תצוגה מקדימה</div>
  return (
    <div className="space-y-2 font-mono text-sm" dir="rtl">
      {rows.map(({ c, segs }, i) => {
        const idx = c.idx ?? i
        const status = c.status || 'pending'
        const isSelected = selectable && status === 'pending' && selected?.has(idx)
        const interactive = selectable && status === 'pending'

        return (
          <div
            key={idx}
            onClick={interactive ? () => onToggle?.(idx) : undefined}
            className={[
              'rounded-lg overflow-hidden border transition-all',
              interactive ? 'cursor-pointer hover:border-primary/60' : '',
              isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-neutral-cool-200',
              status === 'rejected' ? 'opacity-50' : '',
            ].join(' ')}
          >
            {selectable && (
              <div className="flex items-center gap-2 px-3 py-1 bg-neutral-cool-50 border-b border-neutral-cool-200 text-xs">
                {status === 'pending' ? (
                  <>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => onToggle?.(idx)}
                      onClick={(ev) => ev.stopPropagation()}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-neutral-cool-500">מקטע {idx + 1}</span>
                  </>
                ) : status === 'approved' ? (
                  <span className="flex items-center gap-1 font-bold text-success-alt-600">
                    <span className="material-symbols-outlined text-sm">check_circle</span> אושר
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-bold text-danger-500">
                    <span className="material-symbols-outlined text-sm">cancel</span> נדחה
                  </span>
                )}
              </div>
            )}
            {c.before !== '' && (
              <div className="bg-danger-50 text-danger-800 px-3 py-1 whitespace-pre-wrap break-words border-r-4 border-danger-300">
                {onResolve && (
                  <div className="flex items-center justify-between gap-2 mb-1 font-sans" dir="rtl">
                    <span className="text-xs font-bold text-danger-400">גיטהאב</span>
                    <button
                      type="button"
                      onClick={() => onResolve(c, 'theirs')}
                      className="text-xs font-bold bg-danger-100 text-danger-700 border border-danger-300 rounded-md px-2 py-0.5 hover:bg-danger-200"
                    >
                      קבל גרסה זו
                    </button>
                  </div>
                )}
                {segs.filter((s) => s.type !== 'add').map((s, k) =>
                  s.type === 'del'
                    ? <span key={k} className="bg-danger-300/60 rounded-sm">{s.text}</span>
                    : <span key={k}>{s.text}</span>
                )}
              </div>
            )}
            {c.after !== '' && (
              <div className="bg-success-alt-50 text-success-alt-800 px-3 py-1 whitespace-pre-wrap break-words border-r-4 border-success-alt-300">
                {onResolve && (
                  <div className="flex items-center justify-between gap-2 mb-1 font-sans" dir="rtl">
                    <span className="text-xs font-bold text-success-alt-500">האתר</span>
                    <button
                      type="button"
                      onClick={() => onResolve(c, 'ours')}
                      className="text-xs font-bold bg-success-alt-100 text-success-alt-700 border border-success-alt-300 rounded-md px-2 py-0.5 hover:bg-success-alt-200"
                    >
                      קבל גרסה זו
                    </button>
                  </div>
                )}
                {segs.filter((s) => s.type !== 'del').map((s, k) =>
                  s.type === 'add'
                    ? <span key={k} className="bg-success-alt-300/60 rounded-sm">{s.text}</span>
                    : <span key={k}>{s.text}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
      {total > rows.length && <div className="text-xs text-neutral-cool-400">…ועוד {total - rows.length} מקטעים</div>}
    </div>
  )
}

export default memo(DiffPreview)
