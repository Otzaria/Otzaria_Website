// צורת הדף — שלב "שורות" בבדיקת עמוד: היסטוריית הפעולות (ביטול/חזרה), הוספת פעולה עם בדיקה מול lineOps,
// "לשורה החשודה הבאה", החיתוך של שורת הסריקה, הפעולות על מילה, ובחירת מילים ל"בדפוס כתוב אחרת". טהור.
// פעולות השורה והעוגנים: src/lib/tzuratHadaf/lineOps.js (אותה פונקציה גם בשרת).
import { applyLineOps, deriveAnchors, opStartAt } from '@/lib/tzuratHadaf/lineOps'

export const HISTORY_MAX = 200

// ---------- היסטוריה ----------

export const initHistory = (ops = []) => ({ past: [], present: Array.isArray(ops) ? ops : [], future: [] })

export function pushHistory(h, nextOps) {
  return { past: [...h.past, h.present].slice(-HISTORY_MAX), present: nextOps, future: [] }
}

export function undoHistory(h) {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redoHistory(h) {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

// ---------- פעולות ----------

/** הוספת פעולה: {ops} (הרשימה החדשה) או {ops: הישנה, reason} כשהפעולה נדחית (reason — מפתח של REJECT_REASON) */
export function tryAddOp(model, ops, op) {
  if (!op) return { ops, reason: 'out_of_range' }
  const next = [...ops, op]
  const { rejected } = applyLineOps(model, next)
  const mine = rejected.find((r) => r.op === op)
  if (mine) return { ops, reason: mine.reason }
  return { ops: next, reason: null }
}

/** "השורה נכונה": מוסיף confirm לשורה, או מסיר אותו אם כבר סומנה */
export function toggleConfirm(ops, blockId, lineI) {
  const has = ops.some((o) => o.op === 'confirm' && o.block === blockId && o.line === lineI)
  if (has) return ops.filter((o) => !(o.op === 'confirm' && o.block === blockId && o.line === lineI))
  return [...ops, { op: 'confirm', block: blockId, line: lineI }]
}

/** האם יש confirm לשורה */
export const isConfirmed = (ops, blockId, lineI) => ops.some((o) => o.op === 'confirm' && o.block === blockId && o.line === lineI)

/**
 * הפעולות על מילה j בשורה k: startHere — "השורה מתחילה כאן" (המילים שלפניה עולות לשורה הקודמת);
 * nextFromHere — "מכאן — לשורה הבאה" (המילה והמילים שאחריה יורדות לתחילת השורה הבאה). null כשאי אפשר.
 */
export function wordActions(block, k, j) {
  const line = block?.lines?.[k]
  const w = line?.words?.[j]
  if (!w || j === 0) return { startHere: null, nextFromHere: null }
  return {
    startHere: k > 0 ? opStartAt(block, k, w) : null,
    nextFromHere: k + 1 < (block.lines || []).length ? opStartAt(block, k + 1, w) : null,
  }
}

/** השורה החשודה הבאה (flag ולא נגעו בה) אחרי k, במעגל; -1 כשאין */
export function nextSuspicious(block, fromK, touched) {
  const lines = block?.lines || []
  const n = lines.length
  for (let s = 1; s <= n; s++) {
    const k = (((fromK + s) % n) + n) % n
    const l = lines[k]
    if (l.flag && !touched?.has(`${block.id}:${l.i}`)) return k
  }
  return -1
}

/** כמה שורות חשודות בגוש שעוד לא נגעו בהן */
export function suspiciousLeft(block, touched) {
  return (block?.lines || []).filter((l) => l.flag && !touched?.has(`${block.id}:${l.i}`)).length
}

/** חיתוך שורת הסריקה: [x,y,w,h] בשברים עם ריפוד, בתוך התמונה; null כשאין רישום */
export function lineCropBox(scan, { padX = 0.012, padY = 0.35 } = {}) {
  if (!Array.isArray(scan) || scan.length !== 4 || !scan.every(Number.isFinite)) return null
  const [x, y, w, h] = scan
  if (w <= 0 || h <= 0) return null
  const px = padX
  const py = h * padY
  const x0 = Math.max(0, x - px)
  const y0 = Math.max(0, y - py)
  const x1 = Math.min(1, x + w + px)
  const y1 = Math.min(1, y + h + py)
  return [x0, y0, x1 - x0, y1 - y0]
}

/** סיכום הפעולות לשלב ההגשה: כמה שורות הוזזו, כמה אושרו, וכמה פעולות נדחו */
export function opsSummary(model, ops) {
  const anchors = deriveAnchors(model, ops)
  const { rejected } = applyLineOps(model, ops)
  return {
    starts: anchors.filter((a) => a.action === 'start').length,
    confirms: anchors.filter((a) => a.action === 'confirm').length,
    rejected: rejected.length,
  }
}

// ---------- בחירת מילים ("בדפוס כתוב אחרת") ----------

/** לחיצה על מילה j בשורה k של גוש: בחירה חדשה, הרחבה (באותה שורה), או ביטול */
export function selectWord(sel, blockId, k, j) {
  if (!sel || sel.block !== blockId || sel.k !== k) return { block: blockId, k, from: j, to: j }
  if (sel.from === j && sel.to === j) return null
  return { block: blockId, k, from: Math.min(sel.from, j), to: Math.max(sel.to, j) }
}

export const inSelection = (sel, blockId, k, j) => !!sel && sel.block === blockId && sel.k === k && j >= sel.from && j <= sel.to

/** המילים שנבחרו (מהמודל המוצג) */
export function selectedWords(model, sel) {
  if (!sel) return []
  const b = (model?.blocks || []).find((x) => x.id === sel.block)
  return (b?.lines?.[sel.k]?.words || []).slice(sel.from, sel.to + 1)
}

/** רשומת manualItems מהבחירה; null כשהמילה הראשונה בלי זהות (ref) */
export function manualFromSelection(model, sel, text, box = null) {
  const words = selectedWords(model, sel)
  const b = (model?.blocks || []).find((x) => x.id === sel?.block)
  const line = b?.lines?.[sel?.k]
  if (!words.length || !line || typeof words[0].ref !== 'string') return null
  return {
    block: sel.block,
    line: line.i,
    ref: words[0].ref,
    wi: words[0].wi,
    n: words.length,
    otz: words.map((w) => w.t),
    text: String(text || '').trim(),
    box: box || null,
  }
}
