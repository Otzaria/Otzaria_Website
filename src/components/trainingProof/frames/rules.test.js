import { describe, it, expect } from 'vitest'
import { checkFramesPage, checkNewStream, resyncResult, pageState, effectiveFrames, pageBy, bookState, claimDecision, claimActive } from './rules'
import { framesItem, BOOKS } from '@/lib/trainingProof/testFixtures'
import { BOOK_CLAIM_MS } from '@/lib/trainingProof/vocab'

// בדיקת העמוד לפני שמירה (התוצאה לפי docs/76 §5.3), מצב העמוד, מצב הספר ותפיסת הספר (§8.2) — טהור

const payload = framesItem(0)
const STREAMS = [...BOOKS[0].streams, { id: 'x1', name: 'הגהות', role: 'notes', added: true }]
const draft = (frames, status = 'draft') => checkFramesPage(payload, { status, frames }, { streams: STREAMS })

describe('checkFramesPage', () => {
  it('הצעת המודל כמו שהיא — עוברת כטיוטה, src נשמר', () => {
    const { result, error } = draft(payload.frames)
    expect(error).toBeUndefined()
    expect(result.status).toBe('draft')
    expect(result.frames.map((f) => f.src)).toEqual(['auto', 'auto', 'auto'])
    expect(result.frames[2]).toMatchObject({ kind: 'object', obj: 'figure', stream: null })
  })

  it('"העמוד נכון" — בצורה של §5.3, בלי src, וסדר רציף', () => {
    const fr = payload.frames.map((f) => ({ ...f, ord: f.ord ? f.ord * 10 : null }))
    const { result } = draft(fr, 'marked')
    expect(result.status).toBe('marked')
    expect(result.frames[0]).toEqual({ fid: 'f1', kind: 'text', role: 'furniture', box: [474.7, 163.6, 1519.5, 211.7], stream: null, ord: 1, cont: false })
    expect(result.frames[1].ord).toBe(2)
    expect(result.frames.some((f) => 'src' in f)).toBe(false)
    expect(result.streams_added).toEqual([])
  })

  it('"העמוד נכון" נחסם כשמסגרת-טקסט בלי מספר בסדר', () => {
    const fr = payload.frames.map((f) => (f.fid === 'f2' ? { ...f, ord: null } : f))
    expect(draft(fr, 'marked').error).toMatch(/בלי מספר בסדר הקריאה/)
    // אובייקט בלי מספר — מותר (כמו בחוזה)
    expect(draft(payload.frames, 'marked').error).toBeUndefined()
  })

  it('זרם שנוסף ומשמש בעמוד — ב-streams_added', () => {
    const fr = [...payload.frames, { fid: 'n1', kind: 'text', role: 'notes', box: [100, 2300, 900, 2400], stream: 'x1', ord: 9, cont: false }]
    const { result } = draft(fr, 'marked')
    expect(result.streams_added).toEqual([{ id: 'x1', name: 'הגהות', role: 'notes' }])
    expect(result.frames.at(-1).ord).toBe(3)
  })

  it('ריהוט עם זרם — הזרם יורד; "ממשיך" יורד מריהוט', () => {
    const fr = [{ fid: 'f1', kind: 'text', role: 'furniture', box: [1, 1, 50, 50], stream: 's1', ord: 1, cont: true }]
    expect(draft(fr).result.frames[0]).toMatchObject({ stream: null, cont: false })
  })

  it.each([
    ['מצב לא מוכר', { status: 'done', frames: [] }, /מצב/],
    ['בלי רשימה', { status: 'draft' }, /רשימת/],
    ['מזהה כפול', { status: 'draft', frames: [payload.frames[0], payload.frames[0]] }, /כפול/],
    ['תיבה מחוץ לעמוד', { status: 'draft', frames: [{ ...payload.frames[0], box: [0, 0, 5000, 10] }] }, /התיבה/],
    ['תיבה הפוכה', { status: 'draft', frames: [{ ...payload.frames[0], box: [50, 50, 10, 10] }] }, /התיבה/],
    ['זרם לא מוכר', { status: 'draft', frames: [{ ...payload.frames[1], stream: 'zz' }] }, /זרם/],
    ['סוג לא מתאים', { status: 'draft', frames: [{ ...payload.frames[1], kind: 'object' }] }, /הסוג/],
    ['סוג-אובייקט לא מוכר', { status: 'draft', frames: [{ ...payload.frames[2], obj: 'cat' }] }, /סוג-אובייקט/],
    ['סדר כפול', { status: 'draft', frames: [{ ...payload.frames[0], ord: 1 }, { ...payload.frames[1], ord: 1 }] }, /באותו מקום/],
    ['תפקיד לא מוכר', { status: 'draft', frames: [{ ...payload.frames[1], role: 'poem' }] }, /תפקיד/],
  ])('נדחה: %s', (_, body, re) => {
    expect(checkFramesPage(payload, body, { streams: STREAMS }).error).toMatch(re)
  })

  it('caption_of למסגרת שלא קיימת — יורד', () => {
    const fr = [{ ...payload.frames[2], caption_of: 'nope' }]
    expect(draft(fr).result.frames[0].caption_of).toBeUndefined()
  })
})

describe('הסוג נקבע לפי הזרם', () => {
  it('מסגרת בזרם נשמרת בסוג של הזרם, גם אם הדפדפן שלח אחר — גם "כותרת" ישנה; כיתוב נשאר', () => {
    const fr = [
      { ...payload.frames[1], role: 'notes' },
      { fid: 'n1', kind: 'text', role: 'heading', box: [100, 300, 800, 340], stream: 's2', ord: 9, cont: false },
      { fid: 'n2', kind: 'text', role: 'margin', box: [100, 400, 800, 500], stream: null, ord: 10, cont: false },
      { fid: 'n3', kind: 'text', role: 'caption', box: [100, 600, 800, 640], stream: 's2', ord: 11, cont: false },
    ]
    const { result } = draft(fr, 'marked')
    expect(result.frames.map((f) => [f.fid, f.role])).toEqual([
      ['f2', 'body'],
      ['n1', 'commentary'],
      ['n2', 'margin'],
      ['n3', 'caption'],
    ])
  })

  it('resyncResult: סוג חדש לזרם שנוסף — במסגרות וב-streams_added; בלי שינוי — אותו אובייקט', () => {
    const fr = [{ fid: 'n1', kind: 'text', role: 'notes', box: [100, 2300, 900, 2400], stream: 'x1', ord: 1, cont: false }]
    const { result } = draft(fr, 'marked')
    expect(resyncResult(result, STREAMS)).toBe(result)
    const next = STREAMS.map((s) => (s.id === 'x1' ? { ...s, role: 'commentary' } : s))
    const r = resyncResult(result, next)
    expect(r.frames[0].role).toBe('commentary')
    expect(r.streams_added).toEqual([{ id: 'x1', name: 'הגהות', role: 'commentary' }])
    expect(r.status).toBe('marked')
  })

  it('זרם מהתחנה שהסוג שלו שונה — streams_changed בעמוד שמשתמש בו בלבד, והתפקיד לפי הסוג החדש', () => {
    const changed = STREAMS.map((s) => (s.id === 's2' ? { ...s, role: 'notes', stationRole: 'commentary' } : s))
    const fr = [{ fid: 'n1', kind: 'text', role: 'commentary', box: [100, 300, 800, 340], stream: 's2', ord: 1, cont: false }]
    const { result } = checkFramesPage(payload, { status: 'marked', frames: fr }, { streams: changed })
    expect(result.frames[0].role).toBe('notes')
    expect(result.streams_changed).toEqual([{ id: 's2', role: 'notes', from: 'commentary' }])
    const other = checkFramesPage(payload, { status: 'marked', frames: [payload.frames[1]] }, { streams: changed }).result
    expect('streams_changed' in other).toBe(false)
    // חזרה לסוג של התחנה — השדה יורד
    const back = resyncResult(result, STREAMS)
    expect(back.frames[0].role).toBe('commentary')
    expect('streams_changed' in back).toBe(false)
  })
})

describe('checkNewStream', () => {
  it('זרם חדש מקבל x1, x2…', () => {
    expect(checkNewStream(BOOKS[0].streams, { name: ' הגהות  ', role: 'notes' }).stream).toEqual({ id: 'x1', name: 'הגהות', role: 'notes', added: true })
    expect(checkNewStream(STREAMS, { name: 'עוד', role: 'margin' }).stream.id).toBe('x2')
  })
  it('שם ריק, כפול, או תפקיד של ריהוט — נדחה', () => {
    expect(checkNewStream(STREAMS, { name: '', role: 'body' }).error).toBeTruthy()
    expect(checkNewStream(STREAMS, { name: 'פנים', role: 'body' }).error).toMatch(/כבר/)
    expect(checkNewStream(STREAMS, { name: 'א', role: 'furniture' }).error).toBeTruthy()
    expect(checkNewStream(STREAMS, { name: 'א', role: 'heading' }).error).toMatch(/סוג/)
  })
})

describe('מצב עמוד', () => {
  const U = '64b7f0c2a1b2c3d4e5f60003'
  it.each([
    [{ status: 'available', payload }, 'proposed', null],
    [{ status: 'held', heldBy: U, result: { status: 'draft', frames: [] }, payload }, 'draft', U],
    [{ status: 'submitted', vol: U, result: { status: 'marked', frames: [] }, payload }, 'marked', U],
    [{ status: 'submitted', vol: U, result: { status: 'skip', frames: [] }, payload }, 'skip', U],
    [{ status: 'approved', vol: U, result: { status: 'marked', frames: [] }, payload }, 'approved', U],
  ])('%#', (item, st, by) => {
    expect(pageState(item)).toBe(st)
    expect(pageBy(item)).toBe(by)
  })

  it('המסגרות המוצגות: הצעה (מקווקוות) או מה שסומן', () => {
    expect(effectiveFrames({ status: 'available', payload }).every((f) => f.src === 'auto')).toBe(true)
    const marked = { status: 'submitted', payload, result: { status: 'marked', frames: [{ fid: 'n1', box: [1, 1, 9, 9] }] } }
    expect(effectiveFrames(marked)).toEqual([{ fid: 'n1', box: [1, 1, 9, 9], src: 'human' }])
  })
})

describe('מצב ספר ותפיסת ספר (48 שעות)', () => {
  const A = '64b7f0c2a1b2c3d4e5f60001'
  const B = '64b7f0c2a1b2c3d4e5f60002'
  const now = new Date('2026-10-28T10:00:00Z')
  const later = new Date(now.getTime() + BOOK_CLAIM_MS - 1000)
  const book = (extra = {}) => ({ book: 'b-a7f3310c6e', alias: 'ספר 388', claimedBy: null, claimedUntil: null, lastBy: null, ...extra })
  const counts = (done = 0, draft = 0, total = 24, by = {}) => ({ total, done, draft, by })

  it('פנוי → קח', () => {
    expect(bookState(book(), counts(), A, now).state).toBe('free')
    expect(claimDecision(book(), counts(), A, now)).toEqual({ ok: true, already: false })
  })

  it('תפוס בידי אחר בתוקף → אי-אפשר', () => {
    const b = book({ claimedBy: B, claimedUntil: later })
    expect(bookState(b, counts(), A, now)).toMatchObject({ state: 'taken', claimedBy: B })
    expect(claimDecision(b, counts(), A, now)).toMatchObject({ ok: false, status: 409 })
  })

  it('אצלי → "המשך" בלי תפיסה חדשה', () => {
    const b = book({ claimedBy: A, claimedUntil: later })
    expect(bookState(b, counts(), A, now).state).toBe('mine')
    expect(claimDecision(b, counts(), A, now)).toEqual({ ok: true, already: true })
  })

  it('הזמן עבר עם עבודה → "הופסק באמצע", ומי עשה את רובה', () => {
    const b = book({ claimedBy: B, claimedUntil: new Date(now.getTime() - 1) })
    expect(claimActive(b, now)).toBe(false)
    const st = bookState(b, counts(5, 2, 24, { [B]: 6, [A]: 1 }), A, now)
    expect(st).toMatchObject({ state: 'partial', worked: 7, workedBy: B })
    expect(claimDecision(b, counts(5, 2), A, now).ok).toBe(true)
  })

  it('שוחרר — lastBy קובע את "בידי …"', () => {
    const st = bookState(book({ lastBy: B }), counts(3, 0, 24, { [A]: 9 }), A, now)
    expect(st).toMatchObject({ state: 'partial', workedBy: B })
  })

  it('כל העמודים סומנו → הושלם, אי-אפשר לקחת', () => {
    expect(bookState(book(), counts(24, 0), A, now).state).toBe('done')
    expect(claimDecision(book(), counts(24, 0), A, now).ok).toBe(false)
  })

  it('כבר יש לי ספר אחר בעבודה → אי-אפשר לקחת עוד אחד', () => {
    const r = claimDecision(book(), counts(), A, now, { otherClaims: [{ book: 'b-0000000001', alias: 'ספר 12' }] })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(r.error).toMatch(/ספר 12/)
  })

  it('הספר הקודם הוגש כולו וממתין לאישור → לא חוסם ספר חדש', () => {
    const prev = { book: 'b-0000000001', alias: 'ספר 33' }
    expect(claimDecision(book(), counts(), A, now, { otherClaims: [{ ...prev, counts: counts(2, 0, 2) }] })).toEqual({ ok: true, already: false })
    // עוד לא הוגש כולו (או שהמנהל דחה עמוד והוא שוב פתוח) → חוסם
    const r = claimDecision(book(), counts(), A, now, { otherClaims: [{ ...prev, counts: counts(1, 0, 2) }] })
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(r.error).toMatch(/ספר 33/)
    expect(claimDecision(book(), counts(), A, now, { otherClaims: [{ ...prev, counts: counts(1, 1, 2) }] }).ok).toBe(false)
  })

  it('ספר שלא קיים → 404', () => {
    expect(claimDecision(null, counts(), A, now).status).toBe(404)
  })
})
