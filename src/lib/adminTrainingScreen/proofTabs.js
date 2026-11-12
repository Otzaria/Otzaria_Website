// "הגהה" (/library/admin/page-proof) — הלשוניות בשמות לפי המילון, והמונים מתשובת /summary. לוגיקה טהורה
// (נבדק ב-trainingScreens.test.mjs). מזהי הלשוניות בכתובת (?tab=) נשארו כמו קודם, כדי שקישורים שמורים ימשיכו לעבוד.

/** שמות הלשוניות: "סקירה ואישור" → "לאישור", "העלאת חומר" → "העלאה", "הורדה לתחנה" → "הורדות",
 * "הוראות ההגהה" → "הנחיות", "הדף הישן" → "ניקוי נתונים ישנים" (כלי מחיקה לצמיתות, לא ארכיון לעיון).
 * hideOnPhone — בטלפון הלשונית לא בשורה (כדי שהשאר ייכנסו), אלא בתפריט ⋮ של הכותרת. */
export const PROOF_TABS = [
  { id: 'review', icon: 'fact_check', label: 'לאישור' },
  { id: 'upload', icon: 'upload', label: 'העלאה' },
  { id: 'export', icon: 'download', label: 'הורדות' },
  { id: 'volunteers', icon: 'group', label: 'מתנדבים' },
  { id: 'guide', icon: 'menu_book', label: 'הנחיות', hideOnPhone: true },
  { id: 'legacy', icon: 'delete_forever', label: 'ניקוי נתונים ישנים', hideOnPhone: true },
]
export const PROOF_SECTIONS = ['ocr', 'router', 'frames']

const n = (v) => Number(v) || 0

/** כמה ממתינים לאישור בכל החלקים יחד (המונה של "לאישור") */
export function pendingTotal(summary) {
  const s = summary?.sections
  if (!s) return 0
  return PROOF_SECTIONS.reduce((sum, k) => sum + n(s[k]?.submitted), 0)
}
/** כמה אושרו ועוד לא הורדו לתחנה */
export function approvedTotal(summary) {
  const s = summary?.sections
  if (!s) return 0
  return PROOF_SECTIONS.reduce((sum, k) => sum + n(s[k]?.approved), 0)
}

/** כמה נתונים נשארו מהדף הישן (תשובת GET /legacy); null — לא ידוע */
export function legacyTotal(data) {
  const c = data?.counts
  if (!c) return null
  return n(c.books) + n(c.pages) + n(c.submissions) + n(c.drafts) + n(data.files)
}

/**
 * הלשוניות עם המונים: "לאישור" — כמה ממתינים; "מתנדבים" — כמה בקשות גישה. מונה 0 לא מוצג.
 * hideLegacy — כשידוע שאין נתונים ישנים, "ניקוי נתונים ישנים" לא מוצגת (אלא אם היא הלשונית הפתוחה — קישור שמור).
 * @returns {{ id: string, icon: string, label: string, hideOnPhone?: boolean, count?: number, countLabel?: string }[]}
 */
export function proofTabItems(summary, { hideLegacy = false, active = '' } = {}) {
  const pending = pendingTotal(summary)
  const requests = n(summary?.requests)
  return PROOF_TABS.filter((t) => !(t.id === 'legacy' && hideLegacy && active !== 'legacy')).map((t) => {
    if (t.id === 'review' && pending > 0) {
      return { ...t, count: pending, countLabel: pending === 1 ? 'אחד ממתין לאישור' : `${pending.toLocaleString('he-IL')} ממתינים לאישור` }
    }
    if (t.id === 'volunteers' && requests > 0) {
      return { ...t, count: requests, countLabel: requests === 1 ? 'בקשת גישה אחת' : `${requests.toLocaleString('he-IL')} בקשות גישה` }
    }
    return t
  })
}
