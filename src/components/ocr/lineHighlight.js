// מיקום ההדגשה של שורה על תמונת העמוד המלא — באחוזים ממידות התמונה, כך שהוא נכון בכל גודל תצוגה.
// box בפיקסלים של התמונה המקורית: { x, y, width, height }. הצד הימני (right) — כמו קודם: התמונה בתוך עמוד RTL.
// בלי מידות (0) — null (ההדגשה מחכה שהתמונה תיטען ותימדד).
export function lineHighlightStyle(box, w, h) {
  if (!box || !(w > 0) || !(h > 0)) return null
  return {
    right: `${(1 - (box.x + box.width) / w) * 100}%`,
    top: `${(box.y / h) * 100}%`,
    width: `${(box.width / w) * 100}%`,
    height: `${(box.height / h) * 100}%`,
  }
}
