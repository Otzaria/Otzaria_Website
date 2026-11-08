import { describe, it, expect } from 'vitest'
import {
  RESUME_MAX_AGE_MS,
  RESUME_STORE,
  backoffMs,
  findResume,
  forgetResume,
  formatBytes,
  isTerminal,
  pendingChunks,
  percent,
  planChunks,
  receivedBytes,
  rememberResume,
  resumeKey,
} from './uploadPlan'
import { LRI, PDI } from '@/lib/adminList/fileSize'

// חישובי ההעלאה המחולקת: חלוקה לחלקים, מה חסר, מפתח ההמשך ב-localStorage, ופורמט בתים.

const memStorage = () => {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    raw: m,
  }
}
const file = (name = 'berakhot.zip', size = 25, lastModified = 1000) => ({ name, size, lastModified })

describe('planChunks', () => {
  it('מחלק לפי גודל החלק, והאחרון קצר', () => {
    expect(planChunks(25, 10)).toEqual([
      { n: 0, start: 0, end: 10 },
      { n: 1, start: 10, end: 20 },
      { n: 2, start: 20, end: 25 },
    ])
  })
  it('גודל שמתחלק בדיוק — בלי חלק ריק בסוף', () => {
    expect(planChunks(20, 10)).toHaveLength(2)
  })
  it('קלט לא תקין — אין חלקים', () => {
    expect(planChunks(0, 10)).toEqual([])
    expect(planChunks(10, 0)).toEqual([])
    expect(planChunks('x', 10)).toEqual([])
  })
  it('קובץ של 2GB בחלקים של 16MB', () => {
    const plan = planChunks(2 * 1024 ** 3, 16 * 1024 ** 2)
    expect(plan).toHaveLength(128)
    expect(plan.at(-1).end).toBe(2 * 1024 ** 3)
  })
})

describe('pendingChunks / receivedBytes', () => {
  const plan = planChunks(25, 10)
  it('מדלג על חלקים שכבר התקבלו (גם כמחרוזות)', () => {
    expect(pendingChunks(plan, [0, '2']).map((c) => c.n)).toEqual([1])
    expect(pendingChunks(plan, null).map((c) => c.n)).toEqual([0, 1, 2])
  })
  it('סופר בתים של חלקים שהתקבלו', () => {
    expect(receivedBytes(plan, [0, 2])).toBe(15)
    expect(receivedBytes(plan, [])).toBe(0)
  })
})

describe('backoffMs', () => {
  it('מכפיל, עם תקרה', () => {
    expect(backoffMs(1)).toBe(1000)
    expect(backoffMs(2)).toBe(2000)
    expect(backoffMs(3)).toBe(4000)
    expect(backoffMs(20)).toBe(30000)
    expect(backoffMs(2, 10)).toBe(20)
  })
})

describe('מפתח ההמשך', () => {
  it('resumeKey — שם, גודל ותאריך שינוי', () => {
    expect(resumeKey(file())).toBe('berakhot.zip|25|1000')
    expect(resumeKey(file('a.zip', 25, 2000))).not.toBe(resumeKey(file('a.zip', 25, 1000)))
  })
  it('שומר, מוצא ושוכח', () => {
    const s = memStorage()
    expect(findResume(file(), s)).toBeNull()
    rememberResume(file(), 'u1', s, 5000)
    expect(findResume(file(), s, 6000)).toBe('u1')
    expect(findResume(file('other.zip'), s, 6000)).toBeNull()
    forgetResume(file(), s)
    expect(findResume(file(), s, 6000)).toBeNull()
  })
  it('רשומה ישנה אינה מוצעת ונמחקת בשמירה הבאה', () => {
    const s = memStorage()
    rememberResume(file('old.zip'), 'u0', s, 1)
    expect(findResume(file('old.zip'), s, 2 + RESUME_MAX_AGE_MS)).toBeNull()
    rememberResume(file(), 'u1', s, 2 + RESUME_MAX_AGE_MS)
    expect(Object.keys(JSON.parse(s.raw.get(RESUME_STORE)))).toEqual([resumeKey(file())])
  })
  it('אחסון חסום או פגום — לא זורק', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(findResume(file(), broken)).toBeNull()
    expect(() => rememberResume(file(), 'u1', broken)).not.toThrow()
    const s = memStorage()
    s.setItem(RESUME_STORE, '{not json')
    expect(findResume(file(), s)).toBeNull()
  })
})

describe('formatBytes / percent / isTerminal', () => {
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe(`${LRI}512 B${PDI}`)
    expect(formatBytes(1536)).toBe(`${LRI}2 KB${PDI}`)
    expect(formatBytes(320 * 1024 ** 2)).toBe(`${LRI}320 MB${PDI}`)
    expect(formatBytes(1.5 * 1024 ** 3)).toBe(`${LRI}1.5 GB${PDI}`)
    expect(formatBytes(-1)).toBe('—')
  })
  it('percent', () => {
    expect(percent(5, 10)).toBe(50)
    expect(percent(5, 0)).toBe(0)
    expect(percent(20, 10)).toBe(100)
  })
  it('isTerminal', () => {
    expect(isTerminal('done')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('processing')).toBe(false)
  })
})
