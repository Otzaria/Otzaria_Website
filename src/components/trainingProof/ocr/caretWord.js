// המילה שתחת הסמן בעריכת "תקן" — בטקסט ועל תמונת השורה. טהור.
// לשורות-הזיהוי אין תיבות-מילים (docs/76 §4.1), ולכן המילים בתמונה נגזרות מהדיו
// (splitByInk של הנתב: תיבות מימין לשמאל). מסמנים בתמונה רק כשבטוחים שזו אותה מילה:
// מספר המילים בטקסט = מספר קטעי-הדיו, ובשורה בכיוון אחד בלבד.

// המילים בטקסט: [{s, e}] — מיקום-התחלה וסוף (לא כולל) בתוך המחרוזת
export function wordSpans(text) {
  const out = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text || ''))) out.push({ s: m.index, e: m.index + m[0].length })
  return out
}

// מספר המילה שהסמן בה. סמן מיד אחרי מילה (לפני הרווח) — עדיין אותה מילה; בתוך רווח — המילה שאחריו.
// -1 = אין מילים
export function wordIndexAt(spans, caret) {
  if (!spans.length) return -1
  const k = spans.findIndex((w) => caret <= w.e)
  return k < 0 ? spans.length - 1 : k
}

const HEB = /[֐-׿יִ-ﭏ]/
const LAT = /[A-Za-zÀ-ɏ]/

// עברית ולטינית באותה שורה: סדר המילים בתמונה שונה מסדרן בטקסט — לא מסמנים בתמונה
export const mixedDirection = (text) => HEB.test(text) && LAT.test(text)

// התיבה בתמונה למילה k, או null כשאין התאמה ודאית (ואז מסמנים רק בטקסט).
// boxes — מ-splitByInk, מימין לשמאל; בשורה משמאל לימין (ltr) המילה הראשונה היא השמאלית.
export function inkBoxFor({ text, k, boxes, ltr }) {
  if (!boxes?.length || k < 0 || mixedDirection(text)) return null
  if (wordSpans(text).length !== boxes.length) return null
  return boxes[ltr ? boxes.length - 1 - k : k] || null
}
