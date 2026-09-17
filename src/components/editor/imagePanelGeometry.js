// לוגיקה טהורה של גיאומטריית בחירת אזור בתמונה ב-ImagePanel: חישובי
// clamp/גרירה/שינוי-גודל בלבד, ללא כל תלות ב-DOM/refs. מחולצת בנפרד כדי
// לאפשר בדיקה ישירה של החישובים המתמטיים.

export function clampPoint(point, maxWidth, maxHeight) {
  return {
    x: Math.max(0, Math.min(point.x, maxWidth)),
    y: Math.max(0, Math.min(point.y, maxHeight)),
  }
}

export function computeMovedRect(dragStart, rawX, rawY, imgWidth, imgHeight) {
  const deltaX = rawX - dragStart.x
  const deltaY = rawY - dragStart.y

  let newX = dragStart.rectX + deltaX
  let newY = dragStart.rectY + deltaY

  if (newX < 0) newX = 0
  if (newY < 0) newY = 0
  if (newX + dragStart.rectW > imgWidth) newX = imgWidth - dragStart.rectW
  if (newY + dragStart.rectH > imgHeight) newY = imgHeight - dragStart.rectH

  return { x: newX, y: newY, width: dragStart.rectW, height: dragStart.rectH }
}

export function computeResizedRect(handle, start, currentX, currentY, minSize = 10) {
  let newX = start.rectX
  let newY = start.rectY
  let newW = start.rectW
  let newH = start.rectH

  if (handle.includes("w")) {
    const rightEdge = start.rectX + start.rectW
    newX = currentX
    newW = rightEdge - newX
  }
  if (handle.includes("e")) {
    newW = currentX - start.rectX
  }
  if (handle.includes("n")) {
    const bottomEdge = start.rectY + start.rectH
    newY = currentY
    newH = bottomEdge - newY
  }
  if (handle.includes("s")) {
    newH = currentY - start.rectY
  }

  if (newW < minSize) {
    if (handle.includes("w")) newX = start.rectX + start.rectW - minSize
    newW = minSize
  }
  if (newH < minSize) {
    if (handle.includes("n")) newY = start.rectY + start.rectH - minSize
    newH = minSize
  }

  return { x: newX, y: newY, width: newW, height: newH }
}
