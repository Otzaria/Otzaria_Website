// ה-state שמעבירים ל-window.history.replaceState כשמשנים את הכתובת (סינון, חיפוש, לשונית) בלי ניווט.
//
// Next (App Router) עוטף את history.replaceState / pushState: קריאה מבחוץ מעדכנת את הנתב (useSearchParams,
// usePathname) בלי לבקש את העמוד מהשרת. אבל קריאה ש-state שלה מכיל את הסימונים הפנימיים של Next (__NA / _N)
// נחשבת לקריאה *של Next עצמו* — והוא מדלג על הסנכרון (node_modules/next/dist/client/components/app-router.js,
// "Avoid a loop when Next.js internals trigger pushState/replaceState"). מכיוון ש-window.history.state של כל
// רשומה ש-Next יצר מכיל __NA, העברה שלו כמו שהוא (replaceState(window.history.state, ...)) משנה רק את שורת
// הכתובת: useSearchParams נשאר ישן, והמסך לא מסנן/מחפש בכלל — ופעולת נתב מאוחרת יותר אף מחזירה את הכתובת הישנה.
//
// לכן: שאר המפתחות נשמרים (למשל הסימון של useUnsavedChangesGuard על הרשומה הכפולה), והסימונים של Next מוסרים.
// Next מעתיק בעצמו את __NA ואת עץ הנתב חזרה ל-state (copyNextJsInternalHistoryState), כך שלא הולך לאיבוד דבר.
// לוגיקה טהורה, בלי DOM (נבדק ב-historyState.test.mjs).

/** הסימונים הפנימיים של Next ב-history.state שגורמים לו להתעלם מ-replaceState / pushState */
export const NEXT_INTERNAL_HISTORY_KEYS = ['__NA', '_N']

/**
 * העתק של ה-state בלי הסימונים של Next, להעברה ל-replaceState מקוד האפליקציה; null כשלא נשאר בו כלום.
 * @param {unknown} state  בדרך כלל window.history.state
 * @returns {Record<string, unknown> | null}
 */
export function stateForUrlReplace(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const rest = { ...state }
  for (const key of NEXT_INTERNAL_HISTORY_KEYS) delete rest[key]
  return Object.keys(rest).length ? rest : null
}
