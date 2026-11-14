import { describe, it, expect } from 'vitest'
import { keepOps, lineChanges, lineText, opLabel } from './lineDiff'
import { fixtureModel } from './testFixtures'

describe('lineChanges', () => {
  it('הזזת תחילת שורה: שתי השורות לפני/אחרי, ועוגן start', () => {
    const ops = [{ op: 'start', block: 'g', line: 1, ref: 'R', wi: 2 }]
    const { lines, rejected, anchors } = lineChanges(fixtureModel(), ops)
    expect(rejected).toEqual([])
    expect(lines.map((l) => [l.key, l.action, l.before, l.after])).toEqual([
      ['g:0', 'shift', 'מ0 מ1 מ2', 'מ0 מ1'],
      ['g:1', 'start', 'מ3 מ4 מ5', 'מ2 מ3 מ4 מ5'],
    ])
    expect(lines[1].print).toBe('מ2 מ3 מ4 מ5')
    expect(anchors).toEqual([{ block: 'g', line: 1, ref: 'R', wi: 2, action: 'start' }])
  })
  it('confirm — השורה מופיעה בלי שינוי, ועוגן confirm', () => {
    const { lines, anchors } = lineChanges(fixtureModel(), [{ op: 'confirm', block: 'g', line: 2 }])
    expect(lines).toEqual([expect.objectContaining({ key: 'g:2', action: 'confirm', changed: false })])
    expect(anchors).toEqual([{ block: 'g', line: 2, action: 'confirm' }])
  })
  it('פעולה פסולה נרשמת ב-rejected', () => {
    const { lines, rejected } = lineChanges(fixtureModel(), [{ op: 'start', block: 'g', line: 0, ref: 'R', wi: 1 }])
    expect(lines).toEqual([])
    expect(rejected[0].reason).toBe('first_line')
  })
  it('בלי מודל או פעולות', () => {
    expect(lineChanges({ blocks: [] }, null)).toEqual({ lines: [], rejected: [], anchors: [] })
  })
})

describe('עזרים', () => {
  it('lineText / opLabel / keepOps', () => {
    const m = fixtureModel()
    expect(lineText(m.blocks[0].lines[0])).toBe('מ0 מ1 מ2')
    expect(opLabel({ op: 'start', block: 'g', line: 1, ref: 'R', wi: 2 }, m)).toContain('«מ2»')
    expect(opLabel({ op: 'confirm', block: 'g', line: 2 }, m)).toContain('שורה 3')
    expect(keepOps(['a', 'b', 'c'], new Set([1]))).toEqual(['a', 'c'])
  })
})
