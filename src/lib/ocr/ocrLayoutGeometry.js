// גיאומטריית layout v1 של OCR מקומי — מודול טהור בלי imports (שמיש גם בדפדפן).
//
// כל הקואורדינטות ב-layout נמצאות ב"מרחב מיושר" (coordSpace "aligned": פיקסלי הרינדור אחרי
// ביטול ההשטחה ולפני ביטול היישור). toSource = [a,b,c,d,e,f] היא מטריצה אפינית שממפה נקודה
// מהמרחב המיושר לפיקסלי תמונת העמוד באתר (Page.imagePath, בכיוון האחסון — לפני EXIF):
//   x_s = a·x + b·y + c,   y_s = d·x + e·y + f
// מילה היא [x0, x1, wc]; הגובה שלה הוא גובה השורה (bbox[1]..bbox[3]).
// דיוק מובטח: ±1px במרחב המקור (pdfium מותח את הרינדור בפיקסל בגדלים מסוימים, לא ניתן לשחזור) —
// אין להניח דיוק תת-פיקסלי בחפיפה או בבדיקת פגיעה. בעמוד שהושטח (geometry "approx") ה-y מקורב יותר.

/** נקודה מהמרחב המיושר → פיקסלי תמונת המקור */
export function toSourcePoint(M, x, y) {
  return [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
}

/** פיקסלי תמונת המקור → המרחב המיושר (היפוך אפיני; לבדיקת פגיעה). מטריצה סינגולרית → null */
export function fromSourcePoint(M, x, y) {
  const [a, b, c, d, e, f] = M;
  const det = a * e - b * d;
  if (!Number.isFinite(det) || det === 0) return null;
  const dx = x - c;
  const dy = y - f;
  return [(e * dx - b * dy) / det, (a * dy - d * dx) / det];
}

/** תיבה [x0,y0,x1,y1] במרחב המיושר → ארבע פינות במרחב המקור: TL, TR, BR, BL */
export function boxToSourceQuad(M, box) {
  const [x0, y0, x1, y1] = box;
  return [toSourcePoint(M, x0, y0), toSourcePoint(M, x1, y0), toSourcePoint(M, x1, y1), toSourcePoint(M, x0, y1)];
}

/** המעטפה הישרה [minX,minY,maxX,maxY] של התיבה אחרי המיפוי למרחב המקור */
export function boxToSourceEnvelope(M, box) {
  const quad = boxToSourceQuad(M, box);
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** תיבת מילה במרחב המיושר: [word.x0, line.y0, word.x1, line.y1] */
export function wordBox(line, word) {
  return [word[0], line.bbox[1], word[1], line.bbox[3]];
}
