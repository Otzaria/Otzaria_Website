// הלשוניות הפנימיות של דיווחי הטעויות — לוגיקה טהורה (נבדקת ב-tabs.test.mjs).
// "הגדרות" (ניהול ובריאות) רק למי שרשאי לנהל (canManageCorrections — אותה בדיקה כמו ב-API של הבריאות).
import { canManageCorrections } from '../roles.js'

export const CORRECTIONS_BASE = '/library/corrections'
const ADMIN_HREF = `${CORRECTIONS_BASE}/admin`

/** @returns {{ id: string, href: string, label: string, icon: string }[]} */
export function correctionsTabs(user) {
  const tabs = [{ id: 'queue', href: CORRECTIONS_BASE, label: 'דיווחים', icon: 'checklist' }]
  if (canManageCorrections(user)) tabs.push({ id: 'admin', href: ADMIN_HREF, label: 'הגדרות', icon: 'analytics' })
  return tabs
}

/**
 * הלשונית הפעילה לפי הכתובת: "הגדרות" בעמוד שלה (ובדפי משנה שלה), ו"דיווחים" בתור
 * עצמו ובדף דיווח בודד (/library/corrections/<id>) — הדיווח הוא פריט מתוך התור.
 * @returns {'queue' | 'admin' | null}
 */
export function activeCorrectionsTab(pathname) {
  const path = (pathname || '').split(/[?#]/)[0].replace(/\/+$/, '')
  if (path === ADMIN_HREF || path.startsWith(ADMIN_HREF + '/')) return 'admin'
  if (path === CORRECTIONS_BASE || path.startsWith(CORRECTIONS_BASE + '/')) return 'queue'
  return null
}
