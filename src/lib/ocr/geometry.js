// גיאומטריה של סיבוב תמונה — מקור אמת יחיד המשותף ללקוח, להשלמה ולייצוא,
// כדי שמידות ה"בד" (canvas) המסובב יהיו זהות בכל מקום.
//
// הסיבוב עם הרחבה (expand) — התמונה המקורית WxH ממורכזת בתוך מלבן חוסם גדול יותר,
// בדיוק כמו ctx.rotate בקנבס וכמו sharp.rotate. הפינות מתמלאות ברקע.

/**
 * מחזיר את מידות התמונה לאחר סיבוב בזווית deg (מעלות), עם הרחבה למלבן חוסם.
 * @param {number} w רוחב מקורי
 * @param {number} h גובה מקורי
 * @param {number} deg זווית במעלות
 * @returns {{w: number, h: number}}
 */
export function rotatedSize(w, h, deg) {
  const d = Number(deg) || 0;
  if (!d) return { w: Math.round(w), h: Math.round(h) };
  const rad = (Math.abs(d) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    w: Math.round(w * cos + h * sin),
    h: Math.round(w * sin + h * cos),
  };
}

// נקודה במרחב ה"בד" המסובב בזווית deg -> מרחב התמונה המקורית.
function rotatedToOriginal(x, y, W, H, deg) {
  const { w: rw, h: rh } = rotatedSize(W, H, deg);
  const rad = (-deg * Math.PI) / 180; // הפוך
  const dx = x - rw / 2;
  const dy = y - rh / 2;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad) + W / 2,
    y: dx * Math.sin(rad) + dy * Math.cos(rad) + H / 2,
  };
}

// נקודה במרחב התמונה המקורית -> מרחב ה"בד" המסובב בזווית deg.
function originalToRotated(x, y, W, H, deg) {
  const { w: rw, h: rh } = rotatedSize(W, H, deg);
  const rad = (deg * Math.PI) / 180;
  const dx = x - W / 2;
  const dy = y - H / 2;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad) + rw / 2,
    y: dx * Math.sin(rad) + dy * Math.cos(rad) + rh / 2,
  };
}

/**
 * ממפה נקודה ממרחב מסובב deg1 למרחב מסובב deg2 (עבור תמונה WxH), דרך מרחב המקור.
 * משמש לשמירת מיקום התיבות על אותו תוכן כשמשנים את זווית העמוד.
 * @returns {{x:number, y:number}}
 */
export function remapPointBetweenRotations(x, y, W, H, deg1, deg2) {
  const o = rotatedToOriginal(x, y, W, H, Number(deg1) || 0);
  return originalToRotated(o.x, o.y, W, H, Number(deg2) || 0);
}
