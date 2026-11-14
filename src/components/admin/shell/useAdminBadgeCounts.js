'use client'

import { useEffect, useState } from 'react'
import { hasAnyAdminBadge } from '@/lib/adminBadgeScope'

const REFRESH_MS = 60000
const REFRESH_EVENT = 'admin-badge-counts:refresh'

/**
 * בקשה לרענן את המונים עכשיו (ולא בעוד עד דקה) — אחרי פעולה שמשנה אותם (מחיקה, שחזור, שינוי
 * מצב במסך ההעלאות). אירוע בחלון, כך שהמסך לא צריך גישה למעטפת.
 */
export function refreshAdminBadgeCounts() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_EVENT))
}

/**
 * מוני התג של הניהול (הודעות שלא נקראו / העלאות ממתינות / תוספים לאישור).
 * הערך ההתחלתי מגיע מהשרת (layout), כך שהמונים כבר ב-HTML; כאן רק הרענון כל 60 שניות
 * מ-/api/badge-counts — בדיוק כמו בשורת הלשוניות הקודמת — ומיד כשמסך מבקש (refreshAdminBadgeCounts).
 * ההרשאה לכל מונה נבדקת בשרת
 * (src/lib/adminBadgeScope.js); תפקיד בלי אף מונה לא מתשאל כלל.
 */
export function useAdminBadgeCounts(role, initialCounts) {
  const [counts, setCounts] = useState(initialCounts)
  // role — תפקיד, מערך תפקידים או session.user; התלות היא בבוליאני, לא בזהות של מערך/אובייקט
  const enabled = hasAnyAdminBadge(role)

  useEffect(() => {
    if (!enabled) return undefined
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/badge-counts')
        const data = await res.json().catch(() => null)
        if (!data?.success) return
        setCounts({
          unreadMessages: data.unreadMessages || 0,
          pendingUploads: data.pendingUploads || 0,
          pendingPlugins: data.pendingPlugins || 0,
        })
      } catch (e) {
        console.error('Error loading admin counts', e)
      }
    }
    const interval = setInterval(fetchCounts, REFRESH_MS)
    window.addEventListener(REFRESH_EVENT, fetchCounts)
    return () => {
      clearInterval(interval)
      window.removeEventListener(REFRESH_EVENT, fetchCounts)
    }
  }, [enabled])

  return counts
}
