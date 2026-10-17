// הספר המוזהב בגיבור (GoldenBook) — ההחלטה אם לנגן את פתיחת הספר, כלוגיקה טהורה.
//
// הרצועה (24 פריימים, ~300KB) היא הנכס הכבד בדף, ולכן לא מורידים אותה כשהיא לא תנוגן:
// - prefers-reduced-motion — אין תנועה;
// - חיסכון בנתונים (navigator.connection.saveData) — הספר הפתוח (~36KB) במקום 300KB.
// בשני המקרים הספר מוצג פתוח מיד, בלי אנימציה.

export type BookOpening = 'animate' | 'static'

export function planBookOpening({ reducedMotion = false, saveData = false }: {
  reducedMotion?: boolean
  saveData?: boolean
} = {}): BookOpening {
  return reducedMotion || saveData ? 'static' : 'animate'
}

/** saveData מ-Network Information API (Chromium בלבד; בשאר הדפדפנים — false) */
export function readSaveData(nav: unknown = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const connection = (nav as { connection?: { saveData?: unknown } } | undefined)?.connection
  return connection?.saveData === true
}
