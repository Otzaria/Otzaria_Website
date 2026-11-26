// "אישור בלי אינטרנט" (docs/115) — החלק הטהור: חלוקה לקבצים, צורת הפריט, שמות, קובץ-ההחלטות, וההרכבה של ה-HTML
import { describe, it, expect } from 'vitest'
import {
  lineParts,
  clampPer,
  offlineItem,
  volunteerNames,
  checkDecisionsFile,
  skipReason,
  newOfflineId,
  OFFLINE_ID_RE,
  offlineFileName,
} from './contract.js'
import { scriptJson, htmlHead, htmlImage, htmlTail, OFFLINE_CSP } from './html.js'

const ID = (n) => String(n).padStart(24, '0')

describe('חלוקה לקבצים', () => {
  it('גבול לפי מזהה, לא לפי מקום', () => {
    expect(lineParts([ID(1), ID(2), ID(3), ID(4), ID(5)], 2)).toEqual([
      { after: null, count: 2 },
      { after: ID(2), count: 2 },
      { after: ID(4), count: 1 },
    ])
    expect(lineParts([], 2)).toEqual([])
  })
  it('גודל הקובץ בתחום', () => {
    expect(clampPer('x')).toBe(1000)
    expect(clampPer('1')).toBe(10)
    expect(clampPer('99999')).toBe(3000)
  })
  it('מזהה-הורדה ושם קובץ', () => {
    expect(newOfflineId(new Date('2026-11-23T10:00:00Z'), 'a1b2c3')).toBe('tpo-20261123-a1b2c3')
    expect(OFFLINE_ID_RE.test(newOfflineId())).toBe(true)
    expect(offlineFileName({ section: 'ocr', offlineId: 'tpo-20261123-a1b2c3', part: 2, parts: 3 })).toBe('tp-offline-ocr-tpo-20261123-a1b2c3-p2of3.html')
  })
})

describe('הפריט בקובץ', () => {
  const doc = {
    _id: ID(7),
    section: 'ocr',
    submittedAt: new Date('2026-11-20T18:02:11Z'),
    vol: 'u1',
    result: { action: 'ok' },
    rejectedFor: ['x'],
    ctxPath: '/uploads/training-proof/p/img/ctx.jpg',
    payload: { book: 'b-5e0c2a91d4', alias: 'ספר 412', page: 17, line_no: 5, track: 'rashi', text: 'אמר', conf: 91.4, w: 600, h: 40, ctx: { bbox: [1, 2, 3, 4] } },
  }
  it('בלי מפתח-ספר; חותם-גרסה; תמונת-הקשר רק כשנכללת', () => {
    const it0 = offlineItem(doc, { volName: () => 'רחל', ctxKey: () => 'c1' })
    expect(it0).toMatchObject({ id: ID(7), v: '2026-11-20T18:02:11.000Z', img: `i${ID(7)}`, alias: 'ספר 412', page: 17, line: 5, track: 'rashi', conf: 91.4, rejected: 1 })
    expect(it0.vol).toEqual({ id: 'u1', name: 'רחל' })
    expect(it0.ctx).toEqual({ img: 'c1', bbox: [1, 2, 3, 4] })
    expect(JSON.stringify(it0)).not.toContain('b-5e0c2a91d4')
    expect(offlineItem(doc).ctx).toBeNull()
  })
  it('שמות מתנדבים: שם בלבד; בלי שם — "מתנדב N"', () => {
    const names = volunteerNames([{ _id: 'a', name: 'רחל', email: 'r@x.org' }, { _id: 'b', name: '' }], ['a', 'b', 'c', 'b'])
    expect([...names.values()]).toEqual(['רחל', 'מתנדב 1', 'מתנדב 2'])
  })
})

describe('קובץ-ההחלטות', () => {
  const base = { contract: 'tpd/1', section: 'ocr', offline_id: 'tpo-20261123-a1b2c3' }
  const one = (x = {}) => ({ id: ID(1), v: '2026-11-20T18:02:11.000Z', d: 'approve', ...x })
  it('תקין; כפילות — האחרונה קובעת', () => {
    const r = checkDecisionsFile({ ...base, decisions: [one(), one({ d: 'reject' }), one({ id: ID(2), d: 'fix', mark: { action: 'bad' } })] })
    expect(r.error).toBeUndefined()
    expect(r.offlineId).toBe('tpo-20261123-a1b2c3')
    expect(r.decisions).toEqual([{ id: ID(1), v: '2026-11-20T18:02:11.000Z', d: 'reject' }, { id: ID(2), v: '2026-11-20T18:02:11.000Z', d: 'fix', mark: { action: 'bad' } }])
  })
  it.each([
    [{ ...base, contract: 'tp/1', decisions: [one()] }, /tpd\/1/],
    [{ ...base, section: 'x', decisions: [one()] }, /חלק/],
    [{ ...base, decisions: [] }, /אף החלטה/],
    [{ ...base, decisions: [one({ id: 'nope' })] }, /מזהה/],
    [{ ...base, decisions: [one({ v: 'אתמול' })] }, /חותם/],
    [{ ...base, decisions: [one({ d: 'maybe' })] }, /לא מוכרת/],
    [{ ...base, decisions: [one({ d: 'fix' })] }, /חסר התיקון/],
    [{ ...base, section: 'frames', decisions: [one({ d: 'fix', mark: {} })] }, /רק באתר/],
    [[], /אינו קובץ/],
  ])('נדחה בעברית (%#)', (body, re) => {
    expect(checkDecisionsFile(body).error).toMatch(re)
  })
  it('סיבות הדילוג', () => {
    const dec = { v: '2026-11-20T18:02:11.000Z' }
    const at = new Date(dec.v)
    expect(skipReason(dec, null, 'ocr')).toBe('gone')
    expect(skipReason(dec, { section: 'router', status: 'submitted', submittedAt: at }, 'ocr')).toBe('wrong-section')
    expect(skipReason(dec, { section: 'ocr', status: 'approved', submittedAt: at }, 'ocr')).toBe('approved-online')
    expect(skipReason(dec, { section: 'ocr', status: 'available', submittedAt: null }, 'ocr')).toBe('not-pending')
    expect(skipReason(dec, { section: 'ocr', status: 'submitted', submittedAt: new Date() }, 'ocr')).toBe('resubmitted')
    expect(skipReason(dec, { section: 'ocr', status: 'submitted', submittedAt: at, streamChange: { id: 'x' } }, 'ocr')).toBe('stream-change')
    expect(skipReason(dec, { section: 'ocr', status: 'submitted', submittedAt: at, streamChange: null }, 'ocr')).toBeNull()
  })
})

describe('ה-HTML', () => {
  it('JSON בטוח בתוך <script>', () => {
    const s = scriptJson({ t: '</script><b>' + String.fromCharCode(0x2028) })
    expect(s).not.toContain('</script>')
    expect(s).not.toContain(String.fromCharCode(0x2028))
    expect(JSON.parse(s).t).toBe('</script><b>' + String.fromCharCode(0x2028))
  })
  it('CSP שאוסר כל פנייה החוצה; תמונה ב-base64; החלון בסוף', () => {
    expect(htmlHead({ title: 'א<ב' })).toContain('<title>א&lt;ב</title>')
    expect(OFFLINE_CSP).toContain("default-src 'none'")
    expect(htmlImage('i1', 'image/webp', Buffer.from([1, 2, 3]))).toBe('<script type="text/plain" data-img="i1" data-t="image/webp">AQID</script>\n')
    expect(htmlImage('c1', 'text/html', Buffer.from([1]))).toContain('data-t="image/jpeg"')
    expect(() => htmlImage('a"b', 'image/png', Buffer.from([1]))).toThrow()
    expect(htmlTail()).toMatch(/^<script>\(function viewerMain\(\)/)
  })
})
