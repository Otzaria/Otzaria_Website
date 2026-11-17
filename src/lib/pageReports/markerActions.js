// עזרה בעורך אחרי הכרעה בדיווח "טעות בספר": מה אפשר לעשות בסימון שבטקסט ואיך הטקסט משתנה.
// טהור: בלי DB/DOM, imports יחסיים — נבדק ב-node:test (markerActions.test.mjs).
//
// ההכרעה עצמה לא כותבת לטקסט העמוד (ראו server.js). כאן רק מחשבים את העריכה, והעורך מחיל אותה
// במסלול העריכה הרגיל שלו (שמירה אוטומטית, ביטול ב-Ctrl+Z), בלחיצה של מי שעורך את העמוד.

import { finalTexts } from './rules.js'

/** אותה צורת סימון כמו זה שבטקסט: עם רווח בין הסוגריים או בלי */
export function markerLike(existing, original, proposed) {
  const spaced = typeof existing === 'string' && existing.includes(') [')
  return spaced ? `(${original}) [${proposed}]` : `(${original})[${proposed}]`
}

/**
 * הפעולות לסימון שנמצא, לפי ההכרעה.
 * approved — "החלף בתיקון" (בנוסח שהוחלט), ואם הנוסח שהוחלט שונה מזה שבסימון — גם "עדכן את הסימון לנוסח שהוחלט".
 * rejected — "החזר את המקור". ממתין / אחר — אין פעולות.
 * @param {{ status?: string, original?: string, proposed?: string, finalOriginal?: string|null, finalProposed?: string|null }} report
 * @param {{ original: string, proposed: string }} hit הסימון שנמצא בטקסט (locateMarker)
 * @param {string} markerText הטקסט של הסימון כפי שהוא בעמוד
 * @returns {Array<{ id: 'replace'|'updateMarker'|'restore', label: string, done: string, replacement: string }>}
 */
export function markerActionsFor(report, hit, markerText) {
  if (!report || !hit) return []
  if (report.status === 'approved') {
    const f = finalTexts(report)
    const actions = [{ id: 'replace', label: 'החלף בתיקון', done: 'הסימון הוחלף בתיקון.', replacement: f.proposed }]
    if (f.original !== hit.original || f.proposed !== hit.proposed) {
      actions.push({
        id: 'updateMarker',
        label: 'השאר בסוגריים בנוסח שהוחלט',
        done: 'הסימון עודכן לנוסח שהוחלט.',
        replacement: markerLike(markerText, f.original, f.proposed),
      })
    }
    return actions
  }
  if (report.status === 'rejected') {
    return [{ id: 'restore', label: 'החזר את המקור', done: 'הסימון הוחלף בטקסט המקורי.', replacement: hit.original }]
  }
  return []
}

/**
 * הטקסט אחרי הפעולה: הסימון (hit.start..hit.end) מוחלף ב-replacement; הבחירה — על הטקסט החדש.
 * אם הטקסט במיקום כבר לא הסימון — null (לא נוגעים).
 * @param {string} value
 * @param {{ start: number, end: number }} hit
 * @param {string} markerText
 * @param {string} replacement
 * @returns {null | { value: string, start: number, end: number }}
 */
export function applyMarkerReplacement(value, hit, markerText, replacement) {
  const v = typeof value === 'string' ? value : ''
  if (!hit || v.slice(hit.start, hit.end) !== markerText) return null
  const r = typeof replacement === 'string' ? replacement : ''
  return { value: v.slice(0, hit.start) + r + v.slice(hit.end), start: hit.start, end: hit.start + r.length }
}

/** אותו מופע אחרי עריכה מחוץ לו; עריכה שנוגעת בו או יכולה להשתייך אליו דורשת סימון מחדש. */
export function relocateMarkerHit(before, after, hit) {
  if (!hit || typeof before !== 'string' || typeof after !== 'string') return null
  if (before.slice(hit.start, hit.end) !== hit.markerText) return null
  let start = hit.start
  if (before !== after) {
    const limit = Math.min(before.length, after.length)
    let prefix = 0
    let suffix = 0
    while (prefix < limit && before[prefix] === after[prefix]) prefix++
    while (suffix < limit && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++
    // בטקסט חוזר גם תחילת העריכה וגם סופה יכולות לזוז; לא מנחשים איזה מופע שרד.
    const from = Math.min(prefix, before.length - suffix, after.length - suffix)
    const to = before.length - Math.min(suffix, before.length - prefix, after.length - prefix)
    if (hit.end <= from) start = hit.start
    else if (hit.start >= to) start += after.length - before.length
    else return null
  }
  const end = start + hit.markerText.length
  return after.slice(start, end) === hit.markerText ? { ...hit, start, end } : null
}

/** שורת ההכרעה בפס של העורך: מה הוחלט (ריק — עוד ממתין) */
export function decisionText(report) {
  if (report?.status === 'approved') {
    const f = finalTexts(report)
    const edited = report.finalOriginal != null || report.finalProposed != null
    return f.proposed ? `אושר${edited ? ' בנוסח של המנהל' : ''}. התיקון: ${f.proposed}` : `אושר${edited ? ' בנוסח של המנהל' : ''}: למחוק את הקטע.`
  }
  if (report?.status === 'rejected') return 'נדחה. הטקסט שבספר נשאר כמו שהוא.'
  return ''
}
