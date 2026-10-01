'use client'

import { useMemo, useState } from 'react'
import { planReplace } from '@/lib/acronyms/changes'

const PREVIEW_LIMIT = 500

/**
 * החלפה גורפת בטקסט הכינויים בכל הספרים (למשל כל "עיקבא" ל"עקיבא"), עם תצוגה מקדימה.
 * @param {{books:Array<{title:string, aliases:string[]}>, room:number, onAdd:(items:Array<{book:string, from:string, to:string}>)=>void, onClose:()=>void}} props
 */
export default function BulkReplacePanel({ books, room, onAdd, onClose }) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [excluded, setExcluded] = useState(() => new Set())
  const [showAll, setShowAll] = useState(false)

  const plan = useMemo(() => planReplace(books, find, replace), [books, find, replace])
  const keyOf = (item) => `${item.book}\u0000${item.from}`
  const selected = plan.filter((item) => !item.problem && !excluded.has(keyOf(item)))
  const shown = showAll ? plan : plan.slice(0, PREVIEW_LIMIT)
  const overflow = selected.length > room
  const setFindText = (value) => {
    setFind(value)
    setExcluded(new Set())
    setShowAll(false)
  }

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
        <input type="text" value={find} onChange={(e) => setFindText(e.target.value)} placeholder="טקסט לחיפוש, למשל: עיקבא" className="flex-1 border rounded-lg px-3 py-2" />
        <input type="text" value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="החלפה, למשל: עקיבא" className="flex-1 border rounded-lg px-3 py-2" />
      </div>
      {find.trim() && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface/70 mb-2">
            <span>
              נמצאו {plan.length} כינויים; ייכנסו לסל {selected.length}.
              {!showAll && plan.length > PREVIEW_LIMIT && ` מוצגים ${PREVIEW_LIMIT} הראשונים, וכל המסומנים ייכנסו לסל.`}
            </span>
            {!showAll && plan.length > PREVIEW_LIMIT && (
              <button type="button" onClick={() => setShowAll(true)} className="text-primary underline">הצגת כל {plan.length}</button>
            )}
            <button type="button" onClick={() => setExcluded(new Set())} className="text-primary underline">סימון הכול</button>
            <button type="button" onClick={() => setExcluded(new Set(plan.map(keyOf)))} className="text-primary underline">ביטול הסימון</button>
          </div>
          <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
            {shown.map((item) => (
              <label key={keyOf(item)} className={`flex items-start gap-2 px-3 py-2 text-sm ${item.problem ? 'opacity-60' : ''}`}>
                <input type="checkbox" disabled={Boolean(item.problem)} checked={!item.problem && !excluded.has(keyOf(item))} onChange={() => toggle(item)} className="mt-1" />
                <span className="flex-1">
                  <span className="font-medium">{item.book}</span>: {item.from} ← {item.to}
                  {item.problem && <span className="block text-danger-700">{item.problem}</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            {overflow && (
              <span className="text-sm text-danger-700">
                {room > 0 ? `בסל נשאר מקום ל-${room} שינויים בלבד; בטלו חלק מהסימונים, או שלחו קודם את הסל.` : 'הסל מלא; שלחו אותו קודם.'}
              </span>
            )}
            <button
              type="button"
              disabled={selected.length === 0 || overflow}
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
