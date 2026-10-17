// wordmarkHandoff — "מעבר שם האתר" בדף הבית, כלוגיקה טהורה (בלי DOM).
//
// הדפוס: כותרת גדולה שנגללת אל מתחת לסרגל (כמו ה-large title של iOS). המילה "אוצריא" שבכותרת
// הראשית של הגיבור לא זזה ולא משנה גודל — היא נגללת עם הדף כמו כל טקסט, ונעלמת מתחת לכותרת
// העליונה הדביקה (שהרקע שלה אטום). ברגע שהיא מוסתרת כולה שם, שם האתר שבכותרת העליונה
// (ליד הלוגו הקבוע) נכנס בתנועה קצרה — דהייה ועלייה של כמה פיקסלים, בזמן ולא לפי הגלילה
// (CSS transition, ראו animations.css). כשהמילה חוזרת ומציצה מתחת לכותרת, שם האתר יוצא.
//
// למה לא "מעופף" שעולה ומתכווץ לפי הגלילה (המימוש הקודם): הוא נסחף באלכסון מעל הספר, יצא
// מגבולות הכותרת, והצלבה בין שני עותקים שעוד לא היו באותו מקום יצרה "רוח רפאים" כפולה.
// כאן שם האתר מופיע רק כשהמילה כבר לא נראית — אף פעם לא שני עותקים, ותמיד במקום הסופי שלו.
//
// ה-hook (src/hooks/useWordmarkHandoff.js) מודד ב-IntersectionObserver (בלי מאזין גלילה) וכותב
// את המצב ל-<html data-wordmark-handoff="...">:

/** המצבים של data-wordmark-handoff על <html> */
export const HANDOFF_STATE = Object.freeze({
  /** המילה בגיבור נראית (גם חלקית) מתחת לכותרת — שם האתר בכותרת מוסתר */
  hero: 'hero',
  /** המילה מוסתרת כולה מתחת לכותרת (או מעליה) — שם האתר בכותרת מוצג */
  docked: 'docked',
  /** אין מעבר (אין כותרת ראשית בדף, או שאי אפשר למדוד) — שם אתר רגיל */
  off: 'off'
})

/**
 * המצב לפי המדידה: המילה "עגנה" כשהתחתית שלה כבר לא מתחת לתחתית הכותרת העליונה.
 * @param {{ sourceBottom: number, headerBottom: number }} rects  קואורדינטות viewport
 * @returns {'hero' | 'docked' | 'off'}
 */
export function handoffState({ sourceBottom, headerBottom }) {
  if (!Number.isFinite(sourceBottom) || !Number.isFinite(headerBottom)) return HANDOFF_STATE.off
  return sourceBottom <= headerBottom ? HANDOFF_STATE.docked : HANDOFF_STATE.hero
}

/**
 * המצב מתוך רשומת IntersectionObserver — בלי השוואה חוזרת לגובה הכותרת: rootMargin מעוגל
 * לפיקסל שלם, וגובה הכותרת בפועל לא (למשל 60.8px), ולכן השוואה לגובה הלא-מעוגל השאירה חלון
 * של שבר פיקסל שבו ה-observer כבר דיווח "מחוץ", אבל המצב חושב כ-hero — ולא נקרא שוב.
 * לא חותך את ה-root ונמצא מעליו (תחתית המילה מעל ראש ה-root) — docked; אחרת — hero.
 * @param {{ isIntersecting: boolean, sourceBottom: number, rootTop: number | null | undefined }} entry
 * @returns {'hero' | 'docked'}
 */
export function handoffStateFromEntry({ isIntersecting, sourceBottom, rootTop }) {
  if (isIntersecting) return HANDOFF_STATE.hero
  // בלי rootBounds (iframe ממקור אחר) — לפי המיקום ב-viewport: מעל אמצע המסך = עגנה
  const top = Number.isFinite(rootTop) ? rootTop : (typeof window === 'undefined' ? 0 : window.innerHeight / 2)
  return sourceBottom <= top ? HANDOFF_STATE.docked : HANDOFF_STATE.hero
}

/**
 * rootMargin ל-IntersectionObserver: ה-viewport בלי הרצועה שהכותרת העליונה מכסה. המילה
 * "חותכת" את הקצה העליון שלו בדיוק כשהיא נעלמת מתחת לכותרת.
 * @param {number} headerBottom
 */
export function handoffRootMargin(headerBottom) {
  const top = Number.isFinite(headerBottom) && headerBottom > 0 ? Math.round(headerBottom) : 0
  return `-${top}px 0px 0px 0px`
}
