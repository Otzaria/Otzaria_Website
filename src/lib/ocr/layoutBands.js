// לוגיקה טהורה של תיוג רצועות-זרמים ותשובת -עמוד-מלא ב-LayoutTaskCards:
// פיצול/הסרת רצועה, שיוך זהות, ובניית/גזירת התשובה המורכבת של ZonesFullCard.
// כל הפונקציות כאן טהורות (ללא state/DOM) כדי לאפשר בדיקה ישירה.

import { confirmedAnswerFromPrefill } from "./layoutValidation"

// רצועה דקה מדי לפיצול — שתי המחציות היו נופלות מתחת למינימום הוולידציה
const MIN_SPLITTABLE_HEIGHT = 0.02

/**
 * מפצל את הרצועה במיקום i לשתי רצועות שוות, האחת בעלת book_stream זהה
 * לרצועה המקורית והשנייה עם book_stream=null. מחזיר null אם הרצועה דקה
 * מדי לפיצול (ואז אין לעדכן את המצב).
 * @param {Array<{y0:number,y1:number,book_stream:*}>} bands
 * @param {number} i
 * @returns {Array|null}
 */
export function splitBandAt(bands, i) {
  const b = bands[i]
  if (b.y1 - b.y0 < MIN_SPLITTABLE_HEIGHT) return null
  const mid = (b.y0 + b.y1) / 2
  return [
    ...bands.slice(0, i),
    { ...b, y1: mid },
    { y0: mid, y1: b.y1, book_stream: null },
    ...bands.slice(i + 1),
  ]
}

/**
 * מסיר את הרצועה במיקום i. מחזיר null אם זו הרצועה היחידה שנותרה (ואז אין
 * לעדכן את המצב).
 * @param {Array} bands
 * @param {number} i
 * @returns {Array|null}
 */
export function removeBandAt(bands, i) {
  if (bands.length <= 1) return null
  return bands.filter((_, j) => j !== i)
}

/**
 * מפצל את הרצועה הגבוהה ביותר (שימושי כשיש "הוסף רצועה"). מחזיר null אם
 * אין רצועות, או אם הרצועה הגבוהה ביותר דקה מדי לפיצול.
 * @param {Array} bands
 * @returns {Array|null}
 */
export function splitTallestBand(bands) {
  if (!bands || !bands.length) return null
  let tallest = 0
  for (let j = 1; j < bands.length; j++) {
    if (bands[j].y1 - bands[j].y0 > bands[tallest].y1 - bands[tallest].y0) tallest = j
  }
  return splitBandAt(bands, tallest)
}

/**
 * משייך זהות-זרם (book_stream) לרצועה במיקום i.
 * @param {Array} bands
 * @param {number} i
 * @param {number|null} id
 * @returns {Array}
 */
export function setBandIdentity(bands, i, id) {
  return bands.map((b, j) => (j === i ? { ...b, book_stream: id } : b))
}

/**
 * גוזר את מצב תתי-ההכרעות הפנימי (parts) של ZonesFullCard מתוך value/prefill
 * חיצוניים: "הכול נכון", איפוס, או טעינת תשובות קיימות. מחזיר null כשאין
 * לעדכן את המצב הקיים (value אמיתי-חלקי ללא value.answer).
 * @param {{confirmed?:boolean, answer?:object}|null} value
 * @param {{pagenum?:object, header?:object, streams?:object}} prefill
 * @returns {{pagenum:*, header:*, streams:*}|null}
 */
export function derivePartsFromValue(value, prefill) {
  if (value?.confirmed) {
    return {
      pagenum: prefill.pagenum ? { confirmed: true, answer: null } : null,
      header: prefill.header ? { confirmed: true, answer: null } : null,
      streams: prefill.streams ? { confirmed: true, answer: null } : null,
    }
  }
  if (!value) {
    return { pagenum: null, header: null, streams: null }
  }
  if (value.answer) {
    return {
      pagenum: prefill.pagenum && value.answer.pagenum ? { confirmed: false, answer: value.answer.pagenum } : null,
      header: prefill.header && value.answer.header ? { confirmed: false, answer: value.answer.header } : null,
      streams: prefill.streams && value.answer.streams ? { confirmed: false, answer: value.answer.streams } : null,
    }
  }
  return null
}

/**
 * בונה את תשובת-העל של ZonesFullCard מתוך תתי-ההכרעות (parts) לאחר עדכון
 * אחד מהם: אם כל הרכיבים הרלוונטיים (לפי prefill) הוכרעו — תשובה מלאה
 * וממומשת; אחרת null (טרם ניתן לדווח לאב).
 * @param {{pagenum?:object, header?:object, streams?:object}} prefill
 * @param {{pagenum:*, header:*, streams:*}} parts תתי-ההכרעות לאחר העדכון
 * @returns {{confirmed:false, answer:object}|null}
 */
export function buildZonesFullAnswer(prefill, parts) {
  const needed = ["pagenum", "header", "streams"].filter((k) => prefill[k])
  if (!needed.every((k) => parts[k])) return null

  const answer = {}
  for (const k of needed) {
    answer[k] = parts[k].confirmed ? confirmedAnswerFromPrefill(k, prefill[k]) : parts[k].answer
  }
  return { confirmed: false, answer }
}
