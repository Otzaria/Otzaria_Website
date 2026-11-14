// צורת הדף — דיווחים ומלבנים על התמונות: בדיקת דיווח לפני שמירה, ומלבן שצויר (פיקסלי תמונה) → שברים. טהור.
// המלבן: {x, y, w, h} בשברים (0–1) מהתמונה (CONTRACT: regions, manualItems.box).
import { MIN_BOX_PX, boxOk, clampBox, normBox } from '@/lib/pageProof/scanGeometry'
import { REPORT_CATEGORIES } from './labels'

export const MAX_REPORT_TEXT = 2000
export const MAX_NOTE = 1000
const CATS = new Set(REPORT_CATEGORIES.map((c) => c.id))

const r5 = (v) => Math.round(v * 1e5) / 1e5

/** שתי נקודות בפיקסלי תמונה (W×H) → {x,y,w,h} בשברים; null כשהמלבן קטן מדי */
export function fracBoxFromPoints(a, b, W, H, min = MIN_BOX_PX) {
  if (!(W > 0 && H > 0)) return null
  const px = clampBox(normBox(a, b), W, H)
  if (!px || !boxOk(px, min)) return null
  return { x: r5(px[0] / W), y: r5(px[1] / H), w: r5((px[2] - px[0]) / W), h: r5((px[3] - px[1]) / H) }
}

/** האם זה מלבן שברים תקין */
export function fracBoxOk(b) {
  if (!b || typeof b !== 'object') return false
  const { x, y, w, h } = b
  if (![x, y, w, h].every(Number.isFinite)) return false
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.00001 && y + h <= 1.00001
}

/** regions של הדיווח מהמלבנים שצוירו על כל צד */
export function regionsOf({ scan = null, ours = null } = {}) {
  const out = []
  if (fracBoxOk(scan)) out.push({ side: 'scan', ...scan })
  if (fracBoxOk(ours)) out.push({ side: 'ours', ...ours })
  return out
}

/** המלבן של צד מתוך regions */
export const regionOf = (regions, side) => {
  const r = (regions || []).find((x) => x.side === side)
  return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null
}

/** בדיקת דיווח: הודעת שגיאה בעברית, או null */
export function validateReport(r) {
  if (!r || !CATS.has(r.category)) return 'בחרו את סוג הבעיה'
  const text = String(r.text || '').trim()
  if (r.category === 'other' && !text) return 'בדיווח מסוג "אחר" צריך לכתוב מה הבעיה'
  if (text.length > MAX_REPORT_TEXT) return `התיאור ארוך מדי (עד ${MAX_REPORT_TEXT} תווים)`
  if (!text && !(r.regions || []).length) return 'כתבו מה הבעיה, או סמנו את המקום על אחת התמונות'
  if ((r.regions || []).some((g) => !['scan', 'ours'].includes(g.side) || !fracBoxOk(g))) return 'המלבן שסומן אינו תקין'
  return null
}

/** הדיווח בצורה שנשלחת (CONTRACT: reports[] בהגשה) */
export const reportBody = (r) => ({ category: r.category, text: String(r.text || '').trim(), regions: (r.regions || []).map((g) => ({ side: g.side, x: g.x, y: g.y, w: g.w, h: g.h })) })
