// לוגיקה טהורה של חישוב רוחב פאנלים בעת גרירת מפריד (resize) בדף עריכת
// עמוד. מקבלת מלבן קונטיינר (rect) ומיקום עכבר בלבד, ללא כל תלות ב-DOM/refs,
// כדי לאפשר בדיקה ישירה של החישוב המתמטי בנפרד מהאזנת mousemove/mouseup
// בפועל (הנשארת בקובץ המקורי משום שהיא תלוית DOM אמיתי).

// חישוב רוחב פאנל התמונה (אחוזים, קלמפ בין 20 ל-80) בעת גרירת המפריד בין
// פאנל התמונה לעורך הטקסט. תומך בשתי כיווני פריסה (אנכי/אופקי) ובהחלפת
// צדדים (swapPanels).
export function computeImagePanelWidth(rect, clientX, clientY, layoutOrientation, swapPanels) {
  let newSize
  if (layoutOrientation === 'horizontal') {
    newSize = swapPanels
      ? ((rect.bottom - clientY) / rect.height) * 100
      : ((clientY - rect.top) / rect.height) * 100
  } else {
    newSize = swapPanels
      ? ((clientX - rect.left) / rect.width) * 100
      : ((rect.right - clientX) / rect.width) * 100
  }
  return Math.min(Math.max(newSize, 20), 80)
}

// חישוב רוחב טור הטקסט (אחוזים, קלמפ בין 10 ל-90) בעת גרירת המפריד בין שני
// טורי הטקסט.
export function computeColumnWidth(rect, clientX) {
  const relativeX = rect.right - clientX
  const newWidth = (relativeX / rect.width) * 100
  return Math.min(Math.max(newWidth, 10), 90)
}

// חישוב פרמטרי חיתוך התמונה עבור OCR: גודל הקנבס (כגודל אזור הבחירה),
// זווית הסיבוב ברדיאנים, ומיקום הציור של התמונה המקורית כך שמרכז אזור
// הבחירה יתיישר עם מרכז הקנבס לאחר הסיבוב. ללא כל תלות ב-canvas/DOM בפועל.
export function computeOcrCropParams(selectionRect, rotationDegrees) {
  const canvasWidth = selectionRect.width
  const canvasHeight = selectionRect.height
  const rotationRadians = (rotationDegrees * Math.PI) / 180

  const selCenterX = selectionRect.x + selectionRect.width / 2
  const selCenterY = selectionRect.y + selectionRect.height / 2

  return {
    canvasWidth,
    canvasHeight,
    rotationRadians,
    drawX: -selCenterX,
    drawY: -selCenterY,
  }
}
