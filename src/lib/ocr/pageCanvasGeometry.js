// לוגיקה טהורה של גרירות ה-pointer ב-PageCanvas.jsx: המרת קואורדינטות
// לקוח למרחב-תמונה, וחישוב המצב הבא של רצועות-זרמים/תיבת-כותרת בעת גרירת
// גבול/הזזה/שינוי-גודל/ציור. כל הפונקציות כאן טהורות (קלט/פלט בלבד, בלי
// DOM/refs) כדי לאפשר בדיקה ישירה בלי להרכיב את הרכיב.

// כפול מהמינימום בוולידציה — שלא ליצור רצועות על הגבול
export const MIN_BAND_H = 0.01
export const MIN_BOX_PX = 8

/**
 * ממיר קואורדינטת עכבר/מגע (client) לקואורדינטת-תמונה, לפי מלבן ה-SVG
 * בעמוד (getBoundingClientRect) ומידות ה-viewBox (W × viewH).
 * @param {{clientX:number, clientY:number}} point
 * @param {{left:number, top:number, width:number, height:number}} rect
 * @param {number} W
 * @param {number} viewH
 * @returns {{x:number, y:number}}
 */
export function imageCoordsFromClientPoint(point, rect, W, viewH) {
  return {
    x: ((point.clientX - rect.left) / rect.width) * W,
    y: ((point.clientY - rect.top) / rect.height) * viewH,
  }
}

/**
 * גרירת גבול רצועה (y0 או y1): קטום לשכנים (לא חוצה רצועה סמוכה) ולגובה
 * מינימלי (MIN_BAND_H), במרחב 0..1 (יחסי לגובה התמונה המלא H).
 * @param {Array<{y0:number,y1:number,book_stream:*}>} bands
 * @param {number} index
 * @param {'y0'|'y1'} edge
 * @param {number} yPx - קואורדינטת y במרחב-תמונה (פיקסלים, לא מנורמל)
 * @param {number} H - גובה התמונה המלאה (פיקסלים)
 * @returns {Array} רצועות חדשות (המקור אינו משתנה)
 */
export function dragBandEdge(bands, index, edge, yPx, H) {
  const next = bands.map((b) => ({ ...b }))
  const b = next[index]
  const y = Math.max(0, Math.min(1, yPx / H))
  if (edge === 'y0') {
    const low = index > 0 ? next[index - 1].y1 : 0
    b.y0 = Math.max(low, Math.min(b.y1 - MIN_BAND_H, y))
  } else {
    const high = index < next.length - 1 ? next[index + 1].y0 : 1
    b.y1 = Math.min(high, Math.max(b.y0 + MIN_BAND_H, y))
  }
  return next
}

/**
 * הזזת תיבת-כותרת שלמה בדלתא (dx,dy במרחב-תמונה), קטומה לגבולות התמונה.
 * @param {{x:number,y:number,width:number,height:number}} box - התיבה בתחילת הגרירה
 * @param {number} dx
 * @param {number} dy
 * @param {number} W
 * @param {number} H
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function moveBox(box, dx, dy, W, H) {
  return {
    x: Math.max(0, Math.min(W - box.width, box.x + dx)),
    y: Math.max(0, Math.min(H - box.height, box.y + dy)),
    width: box.width,
    height: box.height,
  }
}

/**
 * שינוי-גודל תיבת-כותרת מהפינה הימנית-תחתונה: מרחיב/מקטין לפי דלתא, קטום
 * לגודל מינימלי (MIN_BOX_PX) ולגבולות התמונה מנקודת ההתחלה של התיבה.
 * @param {{x:number,y:number,width:number,height:number}} box - התיבה בתחילת הגרירה
 * @param {number} dx
 * @param {number} dy
 * @param {number} W
 * @param {number} H
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function resizeBox(box, dx, dy, W, H) {
  return {
    x: box.x,
    y: box.y,
    width: Math.max(MIN_BOX_PX, Math.min(W - box.x, box.width + dx)),
    height: Math.max(MIN_BOX_PX, Math.min(H - box.y, box.height + dy)),
  }
}

/**
 * ציור תיבת-כותרת חדשה מנקודת-התחלה לנקודה נוכחית (שני פינות במרחב-תמונה),
 * קטומות לגבולות התמונה, בגודל מינימלי MIN_BOX_PX.
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} point
 * @param {number} W
 * @param {number} H
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function drawBox(start, point, W, H) {
  const px = Math.max(0, Math.min(W, point.x))
  const py = Math.max(0, Math.min(H, point.y))
  const sx = Math.max(0, Math.min(W, start.x))
  const sy = Math.max(0, Math.min(H, start.y))
  const width = Math.max(MIN_BOX_PX, Math.abs(px - sx))
  const height = Math.max(MIN_BOX_PX, Math.abs(py - sy))
  return {
    x: Math.max(0, Math.min(Math.min(sx, px), W - width)),
    y: Math.max(0, Math.min(Math.min(sy, py), H - height)),
    width,
    height,
  }
}
