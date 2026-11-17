'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { appendPage, fallbackQuery, neighbors, nextSkip, readNavList, writeNavList } from '@/lib/corrections/queue-nav'

const PAGE = 100 // תקרת השרת

async function fetchQueue(query, skip) {
  const res = await fetch(`/api/corrections/reports?${query}&limit=${PAGE}&skip=${skip}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// גישה ל-sessionStorage/localStorage עצמה זורקת כשהאחסון חסום
function store(name) {
  try { return window[name] } catch { return null }
}

const btn = `inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${FOCUS_RING}`

/**
 * מעבר לדיווח הקודם/הבא, לפי הרשימה שממנה נכנסו לדיווח (אותו סינון ואותו סדר).
 * כשנכנסו ישירות (קישור, לשונית חדשה) — לפי הסינון האחרון שנשמר בתור.
 */
export default function ReportNav({ id }) {
  // מוצג רק אחרי שהדיווח נטען בדפדפן (לא ברינדור שרת), ולכן קריאת האחסון באתחול בטוחה
  const [nav, setNav] = useState(() => {
    const session = store('sessionStorage')
    const saved = session && readNavList(session)
    return saved && saved.ids.includes(id) ? saved : null
  })
  const hasNav = Boolean(nav)

  useEffect(() => {
    if (hasNav) return
    let alive = true
    const session = store('sessionStorage')
    // אין רשימה שמורה שכוללת את הדיווח — בונים מהסינון האחרון של התור
    const query = fallbackQuery(session, store('localStorage'))
    fetchQueue(query, 0).then((page) => {
      if (!alive) return
      const built = appendPage({ query, ids: [], total: 0, at: Date.now() }, page)
      if (!built.ids.includes(id)) return
      if (session) writeNavList(session, built)
      setNav(built)
    }).catch(() => { /* בלי ניווט */ })
    return () => { alive = false }
  }, [id, hasNav])

  const pos = neighbors(nav, id)

  // הגענו לאחרון שנטען ובשרת יש עוד — טוענים את העמוד הבא כדי שיהיה "הבא"
  useEffect(() => {
    if (!nav || !pos.needMore) return
    let alive = true
    fetchQueue(nav.query, nextSkip(nav)).then((page) => {
      if (!alive) return
      const next = appendPage(nav, page)
      const session = store('sessionStorage')
      if (session) writeNavList(session, next)
      setNav(next)
    }).catch(() => { /* נשאר בלי "הבא" */ })
    return () => { alive = false }
  }, [nav, pos.needMore])

  if (pos.index === -1) return null

  const off = `${btn} text-on-surface/35 cursor-not-allowed`
  const on = `${btn} glass text-on-surface hover:bg-surface-variant`
  return (
    <nav aria-label="מעבר בין דיווחים" className="inline-flex items-center gap-2">
      {pos.prevId ? (
        <Link href={`/library/corrections/${pos.prevId}`} className={on} title="הדיווח הקודם בתור">
          <span className="material-symbols-outlined text-base" aria-hidden="true">chevron_right</span> הקודם
        </Link>
      ) : (
        <span className={off} role="link" aria-disabled="true">
          <span className="material-symbols-outlined text-base" aria-hidden="true">chevron_right</span> הקודם
        </span>
      )}
      <span className="text-sm text-on-surface/70 tabular-nums" aria-live="polite">
        {pos.index + 1} מתוך {pos.total}
      </span>
      {pos.nextId ? (
        <Link href={`/library/corrections/${pos.nextId}`} className={on} title="הדיווח הבא בתור">
          הבא <span className="material-symbols-outlined text-base" aria-hidden="true">chevron_left</span>
        </Link>
      ) : (
        <span className={off} role="link" aria-disabled="true">
          הבא <span className="material-symbols-outlined text-base" aria-hidden="true">chevron_left</span>
        </span>
      )}
    </nav>
  )
}
