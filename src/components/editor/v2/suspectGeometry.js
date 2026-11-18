// איפה מילה חשודה נמצאת על המסך, בשתי תצוגות העריכה — לחלונית שנפתחת עליה (OcrWordPopup).
// תצוגת קוד: ה-textarea עצמו לא חושף מיקום של טווח, אבל שכבת המראה שמאחוריו (TextMirror) כבר
// עוטפת כל מילה חשודה ב-span[data-suspect] באותה שבירת שורות בדיוק; השכבה אינה מקבלת אירועי עכבר
// (pointer-events: none) ולכן נמדדת ולא "נלחצת". תצוגה מעוצבת: הטקסט הוא DOM אמיתי — rangeRects.

import { richFieldApi } from '@/lib/editor/editorField'
import { lineStarts, lineWords, splitLines } from '@/lib/editor/caretWord'

const plain = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })

/** מלבני המסך של המילה (ריק אם אינה מוצגת כרגע) */
export function suspectRects(field, suspect) {
  if (!field || !suspect) return []
  const rich = richFieldApi(field)
  if (rich?.rangeRects) return rich.rangeRects(suspect.start, suspect.end).map(plain)
  const mirror = field.parentElement?.querySelector?.('[data-text-mirror]')
  if (!mirror) return []
  const text = field.value
  const starts = lineStarts(text)
  let n = starts.length - 1
  while (n > 0 && starts[n] > suspect.start) n--
  const lineText = splitLines(text)[n] ?? ''
  const lineEl = mirror.querySelector(`[data-line="${n}"]`)
  if (!lineEl) return []
  const rects = []
  for (const w of lineWords(lineText)) {
    const a = starts[n] + w.start, b = starts[n] + w.end
    if (b <= suspect.start || a >= suspect.end) continue
    const span = lineEl.querySelector(`[data-word="${w.i}"]`)
    for (const r of span?.getClientRects?.() || []) if (r.width > 0 && r.height > 0) rects.push(plain(r))
  }
  return rects
}

/** מלבן אחד שעוטף את מלבני המילה (עוגן לחלונית), או null */
export function unionRect(rects) {
  if (!rects?.length) return null
  return rects.reduce((u, r) => ({ left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) }))
}

const inside = (r, x, y, pad = 1) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad

/** המילה החשודה שהעכבר עליה, מתוך המילים של אותו שדה */
export function suspectAtPoint(field, suspects, x, y) {
  if (!field || !suspects?.length) return null
  if (richFieldApi(field)) {
    for (const s of suspects) if (suspectRects(field, s).some((r) => inside(r, x, y))) return s
    return null
  }
  // תצוגת קוד: רק ה-spans המסומנים בשכבת המראה, ואז מהשורה והמילה — להיסט בטקסט
  const mirror = field.parentElement?.querySelector?.('[data-text-mirror]')
  const span = [...(mirror?.querySelectorAll('[data-suspect]') || [])]
    .find((el) => [...(el.getClientRects?.() || [])].some((r) => r.width > 0 && inside(r, x, y)))
  const n = Number(span?.closest('[data-line]')?.getAttribute('data-line'))
  const i = Number(span?.getAttribute('data-word'))
  if (!Number.isInteger(n) || !Number.isInteger(i)) return null
  const w = lineWords(splitLines(field.value)[n] ?? '').find((x) => x.i === i)
  if (!w) return null
  const a = lineStarts(field.value)[n] + w.start, b = lineStarts(field.value)[n] + w.end
  return suspects.find((s) => s.start < b && s.end > a) || null
}

/** האם המילה עדיין נראית בתוך השדה (לא נגללה החוצה) */
export function rectVisibleIn(field, rect) {
  if (!field || !rect) return false
  const f = field.getBoundingClientRect()
  return rect.bottom > f.top && rect.top < f.bottom && rect.right > f.left && rect.left < f.right
}
