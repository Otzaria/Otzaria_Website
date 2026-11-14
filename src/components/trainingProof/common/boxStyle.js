// תיבה [x0,y0,x1,y1] בפיקסלים של תמונה w×h → מיקום באחוזים מעל התמונה (position:absolute)
export function boxStyle([x0, y0, x1, y1], w, h) {
  return {
    left: `${(100 * x0) / w}%`,
    top: `${(100 * y0) / h}%`,
    width: `${(100 * (x1 - x0)) / w}%`,
    height: `${(100 * (y1 - y0)) / h}%`,
  }
}
