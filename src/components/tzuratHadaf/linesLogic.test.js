import { describe, it, expect } from 'vitest'
import { applyLineOps, opFirstWordUp, opLastWordDown } from '@/lib/tzuratHadaf/lineOps'
import {
  initHistory,
  inSelection,
  lineCropBox,
  manualFromSelection,
  nextSuspicious,
  opsSummary,
  pushHistory,
  redoHistory,
  selectWord,
  suspiciousLeft,
  toggleConfirm,
  tryAddOp,
  undoHistory,
  wordActions,
} from './linesLogic'
import { fixtureModel } from './testFixtures'

const words = (model, ops, b = 'g') =>
  applyLineOps(model, ops)
    .model.blocks.find((x) => x.id === b)
    .lines.map((l) => l.words.map((w) => w.t).join(' '))

describe('linesLogic — היסטוריה', () => {
  it('push / undo / redo; push אחרי undo מוחק את ה-redo', () => {
    let h = initHistory([])
    h = pushHistory(h, [1])
    h = pushHistory(h, [1, 2])
    expect(h.present).toEqual([1, 2])
    h = undoHistory(h)
    expect(h.present).toEqual([1])
    expect(h.future).toHaveLength(1)
    h = redoHistory(h)
    expect(h.present).toEqual([1, 2])
    h = undoHistory(undoHistory(h))
    expect(h.present).toEqual([])
    expect(undoHistory(h)).toBe(h)
    h = pushHistory(h, [9])
    expect(h.future).toEqual([])
    expect(redoHistory(h)).toBe(h)
  })
})

describe('linesLogic — פעולות', () => {
  const model = fixtureModel()
  const g = model.blocks[0]

  it('"את" עוברת למטה (opLastWordDown) ושוב למעלה (opFirstWordUp)', () => {
    const down = tryAddOp(model, [], opLastWordDown(g, 0))
    expect(down.reason).toBeNull()
    expect(words(model, down.ops)).toEqual(['מאימתי קורין', 'את שמע בערבין משעה', 'שהכהנים נכנסים'])
    const shown = applyLineOps(model, down.ops).model.blocks[0]
    const up = tryAddOp(model, down.ops, opFirstWordUp(shown, 1))
    expect(up.reason).toBeNull()
    expect(words(model, up.ops)).toEqual(['מאימתי קורין את', 'שמע בערבין משעה', 'שהכהנים נכנסים'])
  })

  it('פעולה שהייתה מרוקנת שורה — נדחית עם סיבה, והרשימה לא משתנה', () => {
    const bad = { op: 'start', block: 'g', line: 2, ref: 'ברכות ב.', wi: 3 }
    const r = tryAddOp(model, [], bad)
    expect(r.reason).toBe('out_of_range')
    expect(r.ops).toEqual([])
    expect(tryAddOp(model, [], null).reason).toBeTruthy()
    expect(tryAddOp(model, [], { op: 'start', block: 'g', line: 0, ref: 'ברכות ב.', wi: 1 }).reason).toBe('first_line')
  })

  it('wordActions: "השורה מתחילה כאן" ו"מכאן — לשורה הבאה"', () => {
    const a = wordActions(g, 1, 1)
    expect(a.startHere).toEqual({ op: 'start', block: 'g', line: 1, ref: 'ברכות ב.', wi: 4 })
    expect(a.nextFromHere).toEqual({ op: 'start', block: 'g', line: 2, ref: 'ברכות ב.', wi: 4 })
    expect(words(model, [a.startHere])).toEqual(['מאימתי קורין את שמע', 'בערבין משעה', 'שהכהנים נכנסים'])
    expect(words(model, [a.nextFromHere])).toEqual(['מאימתי קורין את', 'שמע', 'בערבין משעה שהכהנים נכנסים'])
    expect(wordActions(g, 0, 1).startHere).toBeNull()
    expect(wordActions(g, 2, 1).nextFromHere).toBeNull()
    expect(wordActions(g, 1, 0)).toEqual({ startHere: null, nextFromHere: null })
  })

  it('toggleConfirm מוסיף ומסיר; opsSummary סופר', () => {
    let ops = toggleConfirm([], 'g', 2)
    expect(ops).toEqual([{ op: 'confirm', block: 'g', line: 2 }])
    ops = [...ops, opLastWordDown(g, 0), { op: 'start', block: 'g', line: 9, ref: 'x', wi: 1 }]
    expect(opsSummary(model, ops)).toEqual({ starts: 1, confirms: 1, rejected: 1 })
    expect(toggleConfirm(ops, 'g', 2)).toHaveLength(2)
  })

  it('השורה החשודה הבאה — במעגל, בלי שורות שנגעו בהן', () => {
    expect(nextSuspicious(g, -1, new Map())).toBe(0)
    expect(nextSuspicious(g, 0, new Map())).toBe(1)
    expect(nextSuspicious(g, 1, new Map())).toBe(0)
    const touched = new Map([['g:0', 'confirm']])
    expect(nextSuspicious(g, 1, touched)).toBe(1)
    expect(suspiciousLeft(g, touched)).toBe(1)
    expect(nextSuspicious(model.blocks[1], -1, new Map())).toBe(-1)
  })

  it('lineCropBox — ריפוד בתוך התמונה; בלי רישום — null', () => {
    const c = lineCropBox([0.3, 0.1, 0.4, 0.02])
    expect(c[0]).toBeCloseTo(0.288)
    expect(c[1]).toBeCloseTo(0.093)
    expect(c[2]).toBeCloseTo(0.424)
    expect(lineCropBox([0, 0, 1, 0.01])[0]).toBe(0)
    expect(lineCropBox(null)).toBeNull()
  })
})

describe('linesLogic — בחירת מילים ל"בדפוס כתוב אחרת"', () => {
  const model = fixtureModel()
  it('בחירה, הרחבה באותה שורה, מעבר לשורה אחרת, ביטול', () => {
    let s = selectWord(null, 'g', 1, 2)
    expect(s).toEqual({ block: 'g', k: 1, from: 2, to: 2 })
    s = selectWord(s, 'g', 1, 0)
    expect(s).toEqual({ block: 'g', k: 1, from: 0, to: 2 })
    expect(inSelection(s, 'g', 1, 1)).toBe(true)
    expect(inSelection(s, 'g', 0, 1)).toBe(false)
    expect(selectWord(s, 'g', 0, 1)).toEqual({ block: 'g', k: 0, from: 1, to: 1 })
    expect(selectWord({ block: 'g', k: 1, from: 2, to: 2 }, 'g', 1, 2)).toBeNull()
  })
  it('manualFromSelection — הרשומה לפי PACKAGE (otz, n, המילה הראשונה)', () => {
    const m = manualFromSelection(model, { block: 'g', k: 1, from: 1, to: 2 }, ' בערבית משעה ', { x: 0.1, y: 0.1, w: 0.1, h: 0.02 })
    expect(m).toEqual({ block: 'g', line: 1, ref: 'ברכות ב.', wi: 4, n: 2, otz: ['בערבין', 'משעה'], text: 'בערבית משעה', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.02 } })
    expect(manualFromSelection(model, null, 'x')).toBeNull()
  })
})
