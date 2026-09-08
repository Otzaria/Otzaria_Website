'use client'

// רכיבי עזר משותפים ללשונית "סידור החנות" (StoreLayoutTab) ולמודאל הקטגוריה
// (CategoryModal) שמוטמע בה: הצגת סטטוס/תמונה ממוזערת של תוסף, שדה הוספת תוסף
// עם השלמה אוטומטית, שורת תוסף ברשימה ממוינת עם חיצי סדר, וההוק לגרירה-ושחרור.

import { useState } from 'react'
import { formatPluginStatus } from '@/lib/pluginSubmission'

// גרירה-ושחרור לרשימה אנכית — HTML5 native, ללא תלות חיצונית.
// חיצי הסדר נשארים לצידה (נגישות מקלדת). מחזיר props לעטיפת כל פריט לפי אינדקס.
export function useDragReorder(onReorder) {
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const reset = () => {
    setDragIndex(null)
    setOverIndex(null)
  }
  return (index) => ({
    draggable: true,
    onDragStart: (e) => {
      setDragIndex(index)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overIndex !== index) setOverIndex(index)
    },
    onDrop: (e) => {
      e.preventDefault()
      if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index)
      reset()
    },
    onDragEnd: reset,
    className: `rounded-xl cursor-grab active:cursor-grabbing transition-shadow ${
      dragIndex === index ? 'opacity-40' : ''
    } ${overIndex === index && dragIndex !== null && dragIndex !== index ? 'ring-2 ring-primary/50' : ''}`
  })
}

export function StatusBadge({ status }) {
  const badges = {
    stable: 'bg-success-100 text-success-800',
    beta: 'bg-warning-alt-100 text-warning-alt-800',
    experimental: 'bg-warning-strong-100 text-warning-strong-800'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badges[status] || badges.stable}`}>
      {formatPluginStatus(status) || status}
    </span>
  )
}

export function MiniImage({ src, alt }) {
  return src ? (
    <img src={src} alt={alt} className="h-10 w-10 flex-shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-variant">
      <span className="material-symbols-outlined text-xl text-on-surface/30">extension</span>
    </div>
  )
}

// שדה הוספת תוסף עם השלמה אוטומטית — סינון לפי שם מתוך רשימת המאושרים
export function PluginPicker({ options, excludeIds, onSelect, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const trimmed = query.trim()
  const available = options.filter((plugin) => !excludeIds.includes(plugin.id))
  const filtered = (trimmed ? available.filter((plugin) => plugin.name.includes(trimmed)) : available).slice(0, 8)

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || 'הוסף תוסף — חיפוש לפי שם...'}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-on-surface/50">לא נמצאו תוספים מתאימים</div>
          ) : (
            filtered.map((plugin) => (
              <button
                key={plugin.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(plugin)
                  setQuery('')
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-right transition-colors hover:bg-neutral-50"
              >
                <MiniImage src={plugin.image} alt={plugin.name} />
                <span className="flex-1 truncate font-medium text-on-surface">{plugin.name}</span>
                <span className="text-xs text-on-surface/50">גרסה {plugin.version}</span>
                <StatusBadge status={plugin.status} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// שורת תוסף ברשימה ממוינת (נבחרים / שיבוצי קטגוריה) עם חיצי סדר והסרה
export function OrderedPluginRow({ plugin, index, total, onMove, onRemove }) {
  // "רפאים" — משובץ שלא ייראה בפועל בחנות (לא מאושר / מוסתר / מושהה)
  const ghost = !plugin.isApproved || plugin.isHidden || plugin.isSuspended
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${ghost ? 'border-danger-200 bg-danger-50' : 'border-neutral-200 bg-surface'}`}>
      <span className="material-symbols-outlined text-on-surface/25" title="גרור לשינוי סדר">drag_indicator</span>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="rounded p-0.5 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
          title="הזז למעלה"
        >
          <span className="material-symbols-outlined text-base">arrow_upward</span>
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          className="rounded p-0.5 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-30"
          title="הזז למטה"
        >
          <span className="material-symbols-outlined text-base">arrow_downward</span>
        </button>
      </div>
      <MiniImage src={plugin.image} alt={plugin.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-bold text-on-surface">{plugin.name}</span>
          <StatusBadge status={plugin.status} />
          {ghost && (
            <span className="text-xs font-bold text-danger-600">
              {plugin.isSuspended && plugin.isApproved && !plugin.isHidden ? 'מושהה — לא יוצג בפועל' : 'לא יוצג בפועל'}
            </span>
          )}
        </div>
        <div className="text-xs text-on-surface/50">
          {plugin.downloadCount || 0} הורדות
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="rounded-lg p-2 text-danger-600 transition-colors hover:bg-danger-100"
        title="הסר מהרשימה"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  )
}
