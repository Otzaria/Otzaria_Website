// צורת הדף — תצוגת שבירת השורות בהגשה (למנהל): השורות שהשתנו לפני ואחרי פעולות המתנדב, והעוגנים
// שנגזרים מהן. על אותה פונקציה טהורה של השרת (src/lib/tzuratHadaf/lineOps.js), כך שמה שהמנהל רואה
// הוא בדיוק מה שיישמר אחרי "אישור" (גם אחרי שהוריד פעולות בודדות).

import { applyLineOps, deriveAnchors } from '@/lib/tzuratHadaf/lineOps'

export const lineText = (line) => (line?.words || []).map((w) => w.t).join(' ')

export const REJECT_REASON = Object.freeze({
  unknown_line: 'שורה שאינה במודל',
  first_line: 'השורה הראשונה בגוש',
  no_word: 'המילה לא נמצאה בגוש',
  out_of_range: 'המילה רחוקה מהשורה',
  locked: 'גוש בלי בדיקת שורות',
  fake_line: 'שורה מדומה (הדרן/כותרת)',
})

/**
 * השורות שנגעו בהן (או שהמילים בהן זזו בגלל שורה סמוכה), לפי סדר הגושים והשורות:
 * {lines:[{key, block, blockLabel, line, action:'start'|'confirm'|'shift', before, after, changed, print}],
 *  rejected:[{op, reason}], anchors:[…]}.
 */
export function lineChanges(model, ops) {
  const { model: after, rejected, touched } = applyLineOps(model, ops || [])
  const lines = []
  ;(model?.blocks || []).forEach((b, bi) => {
    const ab = after.blocks[bi]
    ;(b.lines || []).forEach((line, k) => {
      const key = `${b.id}:${line.i}`
      const before = lineText(line)
      const afterText = lineText(ab?.lines?.[k])
      const t = touched.get(key)
      const changed = before !== afterText
      if (!t && !changed) return
      lines.push({
        key,
        block: b.id,
        blockLabel: b.label || b.id,
        line: line.i,
        action: t || 'shift',
        before,
        after: afterText,
        changed,
        print: Array.isArray(line.print) ? line.print.join(' ') : '',
      })
    })
  })
  return { lines, rejected, anchors: deriveAnchors(model, ops || []) }
}

/** תיאור קצר של פעולת שורה. */
export function opLabel(op, model) {
  const b = (model?.blocks || []).find((x) => x.id === op.block)
  const where = `${b?.label || op.block} · שורה ${op.line + 1}`
  if (op.op === 'confirm') return `${where}: נבדקה ונכונה`
  const w = b ? (b.lines || []).flatMap((l) => l.words || []).find((x) => x.ref === op.ref && x.wi === op.wi) : null
  return `${where}: מתחילה במילה «${w?.t ?? `${op.ref} #${op.wi}`}»`
}

/** הפעולות שנשארו אחרי שהמנהל הוריד חלק מהן (dropped — Set של אינדקסים). */
export const keepOps = (ops, dropped) => (ops || []).filter((_, i) => !dropped?.has(i))
