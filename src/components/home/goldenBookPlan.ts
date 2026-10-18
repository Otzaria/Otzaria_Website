// הספר המוזהב בגיבור (GoldenBook) — ההחלטה אם לנגן את פתיחת הספר, ועד מתי מחכים לרצועה,
// כלוגיקה טהורה.
//
// הרצועה (24 פריימים, ~300KB) היא הנכס הכבד בדף, ולכן מנגנים אותה רק כשזה הגיוני:
// - prefers-reduced-motion — אין תנועה. גם לא מורידים אותה: ה-preload שב-HTML מסונן ב-media
//   (SPRITE_PRELOAD_MEDIA);
// - חיסכון בנתונים (navigator.connection.saveData) — ספר פתוח סטטי. את ההורדה עצמה אי אפשר
//   למנוע כאן: ל-saveData אין שאילתת media נתמכת (prefers-reduced-data עדיין ניסיוני, ובדפדפן
//   שלא מכיר אותו כל השאילתה נכשלת — והרצועה לא הייתה נטענת אצל אף אחד), ולכן ה-preload מוריד
//   אותה גם אצלו. זו פשרה מודעת: מעט מבקרים, ובתמורה — הורדה שמתחילה עם ה-HTML אצל כל השאר;
// - רינדור בצד הלקוח (לא hydration) — ניווט צד-לקוח אל דף הבית: מי שחוזר לדף כבר ראה את
//   הפתיחה, והספר מוצג פתוח.
// בכל המקרים האלה הספר מוצג פתוח מיד, בלי אנימציה.

export type BookOpening = 'animate' | 'static'

/** ה-preload של הרצועה ב-HTML — רק למי שלא ביקש פחות תנועה (שם היא לא תנוגן) */
export const SPRITE_PRELOAD_MEDIA = '(prefers-reduced-motion: no-preference)'

/**
 * כמה זמן מחכים לרצועה מרגע ה-hydration (כשהרכיב יכול לפעול לראשונה), לפני שמוותרים ועוברים
 * לספר הפתוח.
 *
 * למה מה-hydration ולא מתחילת הניווט: לפני ה-hydration אין JS שיכול להחליף את הספר הסגור בכל
 * מקרה, כך שהזמן הזה לא "נחסך" בוויתור על האנימציה — הוא רק גרם לכך שכל מי שה-JS שלו הגיע
 * אחרי 1.5 שניות (Fast 4G, ושרת dev תמיד) לא ראה אותה בכלל.
 *
 * למה 1000ms: הרצועה יורדת מה-HTML (preload) במקביל ל-JS, ולכן ברשת סבירה היא כבר בדרך או
 * מוכנה כשה-hydration מגיע — נשאר בעיקר הפענוח (~100–300ms לרצועה של 8640px). שנייה נותנת
 * לזה מרווח, וחסומה מלמעלה: ברשת איטית באמת הספר הסגור לא נשאר מול המבקר יותר משנייה אחרי
 * שהדף כבר חי — באורך האנימציה עצמה (שנייה) — ואז עוברים לספר הפתוח.
 */
export const OPEN_WAIT_MS = 1000

export function planBookOpening({ reducedMotion = false, saveData = false, hydrated = true }: {
  reducedMotion?: boolean
  saveData?: boolean
  /** הרכיב עלה ב-hydration של ה-HTML מהשרת (טעינת דף), ולא ברינדור צד-לקוח (ניווט) */
  hydrated?: boolean
} = {}): BookOpening {
  return reducedMotion || saveData || !hydrated ? 'static' : 'animate'
}

/** המועד (בשעון performance.now) שאחריו כבר לא מתחילים לנגן: OPEN_WAIT_MS מרגע ה-hydration */
export function openingDeadline(hydratedAt: number, waitMs = OPEN_WAIT_MS): number {
  return hydratedAt + waitMs
}

/** saveData מ-Network Information API (Chromium בלבד; בשאר הדפדפנים — false) */
export function readSaveData(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const connection = (nav as { connection?: { saveData?: unknown } } | undefined)?.connection
  return connection?.saveData === true
}
