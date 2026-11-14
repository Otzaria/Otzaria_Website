// צורת הדף — שני הלוחות של "מבט כללי" (הסריקה | העמוד שלנו): זום יחסי לרוחב הלוח, וגלילה מסונכרנת
// במרחב השברים (נקודת המרכז של החלון, כשבר מגודל התוכן). טהור.

export const PANE_MIN_ZOOM = 0.5
export const PANE_MAX_ZOOM = 6
export const PANE_ZOOM_STEP = 1.25

export function clampPaneZoom(z) {
  const v = Number(z)
  if (!Number.isFinite(v) || v <= 0) return 1
  return Math.min(PANE_MAX_ZOOM, Math.max(PANE_MIN_ZOOM, v))
}

/** צעד זום (dir > 0 — הגדלה) */
export function paneZoomStep(z, dir) {
  const next = clampPaneZoom(z) * (dir > 0 ? PANE_ZOOM_STEP : 1 / PANE_ZOOM_STEP)
  return clampPaneZoom(Math.round(next * 1000) / 1000)
}

/** נקודת המרכז של החלון כשבר מהתוכן: {x, y} */
export function centerFraction(el) {
  const fx = el.scrollWidth > 0 ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5
  const fy = el.scrollHeight > 0 ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0
  return { x: fx, y: fy }
}

/** הגלילה שמביאה את השבר f למרכז החלון: {left, top} */
export function scrollForFraction(f, el) {
  const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
  const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
  const left = Math.min(maxL, Math.max(0, f.x * el.scrollWidth - el.clientWidth / 2))
  const top = Math.min(maxT, Math.max(0, f.y * el.scrollHeight - el.clientHeight / 2))
  return { left, top }
}

/** [x, y, w, h] בשברים → style באחוזים; null כשאינו תיבה */
export function pctStyle(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || b[2] <= 0 || b[3] <= 0) return null
  return { left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%` }
}

/** כל תיבות השורות בעמוד לצד אחד: [{key, label, style}] */
export function lineBoxes(model, side) {
  const out = []
  for (const b of model?.blocks || []) {
    for (const l of b.lines || []) {
      const style = pctStyle(l[side])
      if (style) out.push({ key: `${b.id}:${l.i}`, label: `${b.label || b.id} — שורה ${l.i + 1}`, style, flag: l.flag || null })
    }
  }
  return out
}
