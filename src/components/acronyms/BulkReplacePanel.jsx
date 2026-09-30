'use client'

import { useMemo, useState } from 'react'
import { planReplace } from '@/lib/acronyms/changes'

const PREVIEW_LIMIT = 500

/**
 * החלפה גורפת בטקסט הכינויים בכל הספרים (למשל כל "עיקבא" ל"עקיבא"), עם תצוגה מקדימה.
 * @param {{books:Array<{title:string, aliases:string[]}>, onAdd:(items:Array<{book:string, from:string, to:string}>)=>void, onClose:()=>void}} props
 */
export default function BulkReplacePanel({ books, onAdd, onClose }) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [excluded, setExcluded] = useState(() => new Set())

  const plan = useMemo(() => planReplace(books, find, replace), [books, find, replace])
  const keyOf = (item) => `${item.book}\u0000${item.from}`
  const selected = plan.filter((item) => !item.problem && !excluded.has(keyOf(item)))

  const toggle = (item) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(keyOf(item))) next.delete(keyOf(item))
      else next.add(keyOf(item))
      return next
    })

  return (
    <div className="rounded-xl border border-surface-variant bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-on-surface flex items-center gap-1">
          <span className="material-symbols-outlined">find_replace</span>
          החלפה בכל הכינויים
        </h2>
        <button type="button" onClick={onClose} aria-label="סגירה" className="p-1 rounded hover:bg-surface-variant">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="flex flex-col md:flex-row gap-2 mb-3">
        <input type="text" value={find} onChange={(e) => { setFind(e.target.value); setExcluded(new Set()) }} placeholder="טקסט לחיפוש, למשל: עיקבא" className="flex-1 border rounded-lg px-3 py-2" />
        <input type="text" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="החלפה, למשל: עקיבא" className="flex-1 border rounded-lg px-3 py-2" />
      </div>
      {find.trim() && (
        <>
          <div className="text-sm text-on-surface/70 mb-2">
            נמצאו {plan.length} כינויים; ייכנסו לסל {selected.length}.
            {plan.length > PREVIEW_LIMIT && ` מוצגים ${PREVIEW_LIMIT} הראשונים, וכל המסומנים ייכנסו לסל.`}
          </div>
          <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
            {plan.slice(0, PREVIEW_LIMIT).map((item) => (
              <label key={keyOf(item)} className={`flex items-start gap-2 px-3 py-2 text-sm ${item.problem ? 'opacity-60' : ''}`}>
                <input type="checkbox" disabled={Boolean(item.problem)} checked={!item.problem && !excluded.has(keyOf(item))} onChange={() => toggle(item)} className="mt-1" />
                <span className="flex-1">
                  <span className="font-medium">{item.book}</span>: {item.from} ← {item.to}
                  {item.problem && <span className="block text-danger-700">{item.problem}</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => { onAdd(selected); setFind(''); setReplace('') }}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">playlist_add</span>
              הוספת {selected.length} לסל
            </button>
          </div>
        </>
      )}
    </div>
  )
}
