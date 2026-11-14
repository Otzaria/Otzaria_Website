import { describe, expect, it } from 'vitest'
import { buildRichIndex, displayToRaw, displayWindow, lineOfDisplay, rawToDisplay, serialize, snapRaw, tokenize } from './richMap'

const EDGE_CASES = [
  '',
  'abc',
  '<b>שם.</b> טקסט',
  '<h2>כותרת</h2>\nשורה\n\n<b>a<i>b</i></b>c',
  '<big>חוצה\nשורות</big>',
  'a < b && c > d',
  '<<b>>x</b>>',
  '&nbsp;&amp;&#1488;&#x5D0;&bogus',
  '<span class="x" data-a="1">s</span><img src="a.png"/>',
  'trailing  \n  \nend ',
  '<B>upper</B><unknown>u</unknown><b>open',
  '</b>stray close',
  '\n\n',
  'tab\there',
  '<p>\n</p>',
  '<b\n>not a tag'
]

describe('tokenize/serialize', () => {
  it('round-trip is exact for edge cases', () => {
    for (const s of EDGE_CASES) expect(serialize(tokenize(s))).toBe(s)
  })

  it('tokens are contiguous', () => {
    for (const s of EDGE_CASES) {
      let pos = 0
      for (const t of tokenize(s)) {
        expect(t.start).toBe(pos)
        pos = t.end
      }
      expect(pos).toBe(s.length)
    }
  })

  it('recognizes tags, entities and stray <', () => {
    const kinds = tokenize('a<b>c</b>&nbsp;<x').map((t) => t.kind)
    expect(kinds).toEqual(['text', 'tag', 'text', 'tag', 'entity', 'text'])
    expect(tokenize('<b\n>').every((t) => t.kind !== 'tag')).toBe(true)
  })
})

describe('buildRichIndex', () => {
  it('display text drops tags and entities', () => {
    const ix = buildRichIndex('<h2>כו</h2>\na<b>b</b>&nbsp;c')
    expect(ix.display).toBe('כו\nabc')
    expect(ix.lines).toHaveLength(2)
    expect(ix.lines[0].parts[0].cls).toEqual(['h2'])
    expect(ix.lines[1].parts.map((p) => p.kind)).toEqual(['text', 'text', 'chip', 'text'])
    expect(ix.lines[1].parts[1].cls).toEqual(['b'])
  })

  it('formatting carries across lines like HTML', () => {
    const ix = buildRichIndex('<big>a\nb</big>c')
    expect(ix.lines[1].parts[0].cls).toEqual(['big'])
    expect(ix.lines[1].parts[1].cls).toEqual([])
  })

  it('unknown tags become chips; known tags are hidden', () => {
    const ix = buildRichIndex('<d>x</d><img src="y">')
    expect(ix.lines[0].parts.filter((p) => p.kind === 'chip').map((p) => p.chip)).toEqual(['tag', 'tag', 'img'])
  })

  it('line display starts', () => {
    const ix = buildRichIndex('ab\n<b>c</b>\n\nd')
    expect(ix.lines.map((l) => l.dispStart)).toEqual([0, 3, 5, 6])
    expect(lineOfDisplay(ix, 4)).toBe(1)
    expect(lineOfDisplay(ix, 5)).toBe(2)
  })
})

describe('raw ↔ display', () => {
  const raw = 'abc<b>def</b>ghi'
  const ix = buildRichIndex(raw)

  it('window spans the hidden tags', () => {
    expect(displayWindow(ix, 3)).toEqual({ lo: 3, hi: 6 })
    expect(displayWindow(ix, 6)).toEqual({ lo: 9, hi: 13 })
    expect(displayWindow(ix, 0)).toEqual({ lo: 0, hi: 0 })
    expect(displayWindow(ix, 9)).toEqual({ lo: 16, hi: 16 })
  })

  it('bias picks the side', () => {
    expect(displayToRaw(ix, 3, 'before')).toBe(3)
    expect(displayToRaw(ix, 3, 'after')).toBe(6)
  })

  it('rawToDisplay → displayToRaw returns the window edges exactly', () => {
    for (const s of EDGE_CASES) {
      const x = buildRichIndex(s)
      for (let p = 0; p <= s.length; p++) {
        const q = snapRaw(x, p)
        const { d, bias } = rawToDisplay(x, q)
        const w = displayWindow(x, d)
        expect(q).toBeGreaterThanOrEqual(w.lo)
        expect(q).toBeLessThanOrEqual(w.hi)
        if (q === w.lo || q === w.hi) expect(displayToRaw(x, d, bias)).toBe(q)
      }
    }
  })

  it('snapRaw moves offsets out of tags', () => {
    expect(snapRaw(ix, 4)).toBe(3)
    expect(snapRaw(ix, 4, true)).toBe(6)
    expect(snapRaw(ix, 7)).toBe(7)
  })
})
