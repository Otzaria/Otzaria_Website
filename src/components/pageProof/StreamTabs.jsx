'use client'

import { useRef } from 'react'

// לשוניות-הזרמים מעל הטקסט: זרם אחד מוצג בכל פעם (ראשי / הערות / …), כמו
// ספרים נפרדים באוצריא. לכל לשונית: נקודה בצבע הזרם (אותו צבע של המסגרות על
// הסריקה), מספר השורות, ו-✓ כשכל הפסקאות בה אושרו. "ריהוט הדף" (כותרת-רצה,
// מספר עמוד, קו מפריד — לא נכנס לספר) תמיד אחרונה ובגוון מעומעם.
//
// tabs = streamTabs(view) (textModel.js): [{key, he, color, count, furniture}],
// ולכל לשונית אפשר להוסיף approval = {approved, total} (paragraphApproval של
// הלשונית) — בשבילו מוצג ה-✓. מקלדת: ← → בין הלשוניות (בעברית ← = הבאה),
// Home/End.

function approvalOf(tab) {
  const total = Number(tab?.approval?.total) || 0
  const approved = Math.min(total, Number(tab?.approval?.approved) || 0)
  return { total, approved, all: total > 0 && approved >= total }
}

function tabTitle(tab, a) {
  const lines = tab.count === 1 ? 'שורה אחת' : `${tab.count ?? 0} שורות`
  const what = tab.furniture ? 'ריהוט הדף: כותרת-רצה, מספר עמוד וקווים — לא נכנסים לספר' : tab.he
  const appr = a.total ? ` · ${a.all ? 'כל הפסקאות אושרו' : `אושרו ${a.approved} מתוך ${a.total} פסקאות`}` : ''
  return `${what} · ${lines}${appr}`
}

// label — שם רשימת-הלשוניות (לקורא-מסך); למשל בחלון של עמוד אחר
export default function StreamTabs({ tabs = [], tabKey, setTabKey, className = '', label = 'זרמי הטקסט בעמוד' }) {
  const refs = useRef(new Map())
  // ריהוט הדף תמיד אחרון (streamTabs כבר מסדר כך — כאן רק מבטיחים)
  const ordered = [...tabs.filter((t) => !t.furniture), ...tabs.filter((t) => t.furniture)]

  if (!ordered.length) {
    return <div className={`border-b border-surface-variant px-3 py-2 text-xs text-on-surface/50 ${className}`}>אין טקסט בעמוד הזה</div>
  }

  const go = (idx) => {
    const t = ordered[(idx + ordered.length) % ordered.length]
    if (!t) return
    setTabKey?.(t.key)
    refs.current.get(t.key)?.focus()
  }

  const onKeyDown = (e, idx) => {
    // RTL: הלשונית הבאה משמאל
    if (e.key === 'ArrowLeft') go(idx + 1)
    else if (e.key === 'ArrowRight') go(idx - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(ordered.length - 1)
    else return
    e.preventDefault()
  }

  const activeIdx = Math.max(
    0,
    ordered.findIndex((t) => t.key === tabKey)
  )

  return (
    <div role="tablist" aria-label={label} dir="rtl" className={`flex items-end gap-1 overflow-x-auto border-b border-surface-variant px-2 pt-1 custom-scrollbar ${className}`}>
      {ordered.map((t, idx) => {
        const active = t.key === tabKey
        const a = approvalOf(t)
        return (
          <button
            key={t.key}
            ref={(el) => {
              if (el) refs.current.set(t.key, el)
              else refs.current.delete(t.key)
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={idx === activeIdx ? 0 : -1}
            data-furniture={t.furniture ? 'true' : undefined}
            title={tabTitle(t, a)}
            onClick={() => setTabKey?.(t.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            style={active ? { borderBottomColor: t.color || undefined } : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-sm transition-colors ${
              active ? 'bg-white font-bold text-on-surface' : 'border-transparent hover:bg-surface-variant/50'
            } ${t.furniture ? `ms-auto ${active ? 'text-on-surface/70' : 'text-on-surface/45'}` : active ? '' : 'text-on-surface/75'}`}
          >
            <span
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${t.furniture ? 'opacity-60' : ''}`}
              style={{ background: t.color || '#888888' }}
              aria-hidden="true"
            />
            <span>{t.he}</span>
            <span className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-normal tabular-nums text-on-surface/60">{t.count ?? 0}</span>
            {a.all && (
              <span className="material-symbols-outlined text-sm text-success-600" role="img" aria-label="כל הפסקאות אושרו">check_circle</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
