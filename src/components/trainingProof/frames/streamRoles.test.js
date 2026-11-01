import { describe, it, expect } from 'vitest'
import {
  STREAM_KINDS,
  frameRoleFor,
  syncRoles,
  applyRole,
  applyStream,
  streamUsage,
  checkStreamKind,
  kindChanged,
  changedStreams,
} from './streamRoles'

// הסוג שייך לזרם (כמו setStream/frames_streams בתחנה): מסגרת-טקסט בזרם מקבלת את הסוג שלו, כותרת וכיתוב
// נשארים בתוך הזרם, ריהוט/אובייקט/בלי-זרם — בלי שינוי. הסוג של זרם מהתחנה לא משתנה באתר — טהור

const STREAMS = [
  { id: 's1', name: 'פנים', role: 'body' },
  { id: 's2', name: 'רש"י', role: 'commentary' },
  { id: 'x1', name: 'הגהות', role: 'notes', added: true },
]
const byId = new Map(STREAMS.map((s) => [s.id, s]))
const T = (fid, role, stream, extra = {}) => ({ fid, kind: 'text', role, box: [0, 0, 10, 10], stream, ord: 1, cont: false, src: 'auto', ...extra })

describe('frameRoleFor / syncRoles', () => {
  it('מסגרת בזרם — הסוג של הזרם; כותרת/כיתוב נשארים; ריהוט, אובייקט ובלי-זרם — כמו שהם', () => {
    expect(frameRoleFor(T('a', 'notes', 's2'), byId)).toBe('commentary')
    expect(frameRoleFor(T('a', 'heading', 's2'), byId)).toBe('heading')
    expect(frameRoleFor(T('a', 'caption', 's1'), byId)).toBe('caption')
    expect(frameRoleFor(T('a', 'furniture', null), byId)).toBe('furniture')
    expect(frameRoleFor({ fid: 'o', kind: 'object', role: 'object', stream: null }, byId)).toBe('object')
    expect(frameRoleFor(T('a', 'margin', null), byId)).toBe('margin')
    expect(frameRoleFor(T('a', 'box', 'zz'), byId)).toBe('box')
  })

  it('syncRoles מחזיר את אותו מערך כשאין שינוי, ומערך חדש כשיש', () => {
    const ok = [T('a', 'body', 's1'), T('b', 'heading', 's2')]
    expect(syncRoles(ok, STREAMS)).toBe(ok)
    const bad = [T('a', 'commentary', 's1'), T('b', 'body', 'x1')]
    const out = syncRoles(bad, STREAMS)
    expect(out).not.toBe(bad)
    expect(out.map((f) => f.role)).toEqual(['body', 'notes'])
    expect(out[0].src).toBe('auto')
  })

  it('זרם ששינה סוג — כל המסגרות שלו מקבלות את הסוג החדש', () => {
    const fr = [T('a', 'notes', 'x1'), T('b', 'notes', 'x1'), T('c', 'heading', 'x1'), T('d', 'body', 's1')]
    const next = STREAMS.map((s) => (s.id === 'x1' ? { ...s, role: 'commentary' } : s))
    expect(syncRoles(fr, next).map((f) => f.role)).toEqual(['commentary', 'commentary', 'heading', 'body'])
  })
})

describe('applyRole / applyStream', () => {
  it('מקש של סוג-זרם מעביר לזרם הראשון מהסוג הזה; בלי זרם כזה — בלי זרם', () => {
    expect(applyRole(T('a', 'body', 's1'), 'commentary', STREAMS)).toMatchObject({ role: 'commentary', stream: 's2', src: 'human' })
    expect(applyRole(T('a', 'body', 's1'), 'margin', STREAMS)).toMatchObject({ role: 'margin', stream: null })
    expect(applyRole(T('a', 'body', 's1'), 'body', STREAMS)).toMatchObject({ role: 'body', stream: 's1' })
  })

  it('כותרת/כיתוב — הזרם נשאר; ריהוט ואובייקט — בלי זרם', () => {
    expect(applyRole(T('a', 'body', 's2'), 'heading', STREAMS)).toMatchObject({ role: 'heading', stream: 's2' })
    expect(applyRole(T('a', 'body', 's1'), 'furniture', STREAMS)).toMatchObject({ role: 'furniture', stream: null, cont: false })
    expect(applyRole(T('a', 'body', 's1'), 'object', STREAMS, { obj: 'table' })).toMatchObject({ kind: 'object', obj: 'table', stream: null })
  })

  it('מריהוט ל"פנים" — מקבלת את זרם הפנים', () => {
    expect(applyRole(T('a', 'furniture', null), 'body', STREAMS)).toMatchObject({ role: 'body', stream: 's1' })
  })

  it('בחירת זרם נותנת את הסוג שלו; כותרת נשארת כותרת; "בלי זרם" שומר את הסוג', () => {
    expect(applyStream(T('a', 'body', 's1'), 'x1', STREAMS)).toMatchObject({ role: 'notes', stream: 'x1', src: 'human' })
    expect(applyStream(T('a', 'heading', 's1'), 's2', STREAMS)).toMatchObject({ role: 'heading', stream: 's2' })
    expect(applyStream(T('a', 'commentary', 's2'), null, STREAMS)).toMatchObject({ role: 'commentary', stream: null })
  })
})

describe('רשימת-הזרמים של הספר', () => {
  it('streamUsage סופר מסגרות ועמודים', () => {
    const pages = [{ frames: [T('a', 'body', 's1'), T('b', 'body', 's1')] }, { frames: [T('c', 'body', 's1')] }, { frames: [] }]
    expect(streamUsage(pages, 's1')).toEqual({ frames: 3, pages: 2 })
    expect(streamUsage(pages, 'x1')).toEqual({ frames: 0, pages: 0 })
  })

  it('checkStreamKind: כל זרם, ורק סוג של זרם', () => {
    expect(checkStreamKind(STREAMS, 's1', { role: 'notes' })).toMatchObject({ from: 'body', stream: { id: 's1', role: 'notes' } })
    expect(checkStreamKind(STREAMS, 'zz', { role: 'notes' }).error).toMatch(/לא נמצא/)
    expect(checkStreamKind(STREAMS, 'x1', { role: 'heading' }).error).toMatch(/סוג/)
    expect(checkStreamKind(STREAMS, 'x1', { role: 'furniture' }).error).toBeTruthy()
    const r = checkStreamKind(STREAMS, 'x1', { role: 'commentary' })
    expect(r.from).toBe('notes')
    expect(r.stream).toMatchObject({ id: 'x1', role: 'commentary', added: true })
    expect(r.streams.find((s) => s.id === 'x1').role).toBe('commentary')
    expect(STREAM_KINDS).not.toContain('heading')
  })

  it('changedStreams: רק זרם מהתחנה שהסוג שלו שונה, עם הסוג שהגיע ממנה', () => {
    const list = [
      { id: 's1', name: 'פנים', role: 'body' },
      { id: 's2', name: 'רש"י', role: 'notes', stationRole: 'commentary' },
      { id: 's3', name: 'הערות', role: 'notes', stationRole: 'notes' },
      { id: 'x1', name: 'הגהות', role: 'margin', added: true, stationRole: 'notes' },
    ]
    expect(list.map(kindChanged)).toEqual([false, true, false, false])
    expect(changedStreams(list)).toEqual([{ id: 's2', role: 'notes', from: 'commentary' }])
  })
})
