import { describe, it, expect } from 'vitest'
import {
  buildFinishChecks,
  positionText,
  restCountdownText,
  saveStatusInfo,
  savedAgoText,
  suspectCountText,
  trackingInfo,
  wordCountText
} from './editorStatusText'

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0)

describe('savedAgoText / saveStatusInfo', () => {
  it('לפי הזמן שעבר', () => {
    expect(savedAgoText(NOW - 10_000, NOW)).toBe('נשמר לפני רגע')
    expect(savedAgoText(NOW - 60_000, NOW)).toBe('נשמר לפני דקה')
    expect(savedAgoText(NOW - 5 * 60_000, NOW)).toBe('נשמר לפני 5 דק׳')
    expect(savedAgoText(NOW - 3 * 3_600_000, NOW)).toMatch(/^נשמר בשעה \d{2}:\d{2}$/)
    expect(savedAgoText(null, NOW)).toBe('נשמר')
    expect(savedAgoText('not a date', NOW)).toBe('נשמר')
  })

  it('לכל מצב טקסט וגוון', () => {
    expect(saveStatusInfo('saving').text).toBe('שומר…')
    expect(saveStatusInfo('dirty').text).toBe('יש שינויים שלא נשמרו')
    expect(saveStatusInfo('error').tone).toBe('error')
    expect(saveStatusInfo('saved', NOW, NOW)).toMatchObject({ text: 'נשמר לפני רגע', tone: 'success' })
  })
})

describe('trackingInfo', () => {
  it('רמה + מקור', () => {
    expect(trackingInfo({ level: 'word', source: 'layout' }).full).toBe('מעקב מילה (מזיהוי הטקסט)')
    expect(trackingInfo({ level: 'line', source: 'profile' }).label).toBe('מעקב שורה · מיקום המילה משוער')
    expect(trackingInfo({ level: 'word', estimated: true }).label).toContain('מיקום משוער')
  })

  it('רמה שהורדה (פריסה לא סבירה) — תווית והסבר שמציע זיהוי מילים', () => {
    const line = trackingInfo({ level: 'line', source: 'profile', downgraded: true })
    expect(line.label).toBe('מעקב שורה · הפריסה לא זוהתה בבטחה')
    expect(line.hint).toContain('זהה מילים בעמוד')
    expect(trackingInfo({ level: 'off', downgraded: true }).label).toBe('מעקב כבוי · הפריסה לא זוהתה בבטחה')
    // ברמת מילה downgraded אינו רלוונטי
    expect(trackingInfo({ level: 'word', source: 'profile', downgraded: true }).label).toBe('מעקב מילה')
  })

  it('רמה לא מוכרת → כבוי, בלי מקור', () => {
    expect(trackingInfo({ level: 'bogus', source: 'layout' })).toMatchObject({ level: 'off', label: 'מעקב כבוי', sourceLabel: null })
  })
})

describe('טקסטים בשורת המצב', () => {
  it('מיקום, ספירות וספירה לאחור', () => {
    expect(positionText({ line: 4, totalLines: 20, word: 3 })).toBe('שורה 4 מתוך 20 · מילה 3')
    expect(positionText({ line: 4, totalLines: 20, word: 3, pageWord: 153, totalWords: 420 })).toBe('שורה 4 מתוך 20 · מילה 153 מתוך 420')
    expect(positionText({ line: 2 })).toBe('שורה 2')
    expect(positionText({})).toBe('')
    expect(wordCountText(1)).toBe('מילה אחת')
    expect(wordCountText(1205)).toMatch(/^1,205 מילים$/)
    expect(suspectCountText(0)).toBe('אין מילים לבדיקה')
    expect(suspectCountText(6)).toBe('6 מילים לבדיקה')
    expect(restCountdownText(12 * 60_000 - 1)).toBe('הפסקת עיניים בעוד 12 ד׳')
    expect(restCountdownText(30_000)).toBe('הפסקת עיניים בעוד פחות מדקה')
    expect(restCountdownText(0)).toBe('הפסקת עיניים עכשיו')
    expect(restCountdownText(null)).toBe('')
  })
})

describe('buildFinishChecks', () => {
  it('הכול תקין', () => {
    const checks = buildFinishChecks({ suspectCount: 0, textLineCount: 20, scanLineCount: 20, saveStatus: 'saved', lastSavedAt: NOW, now: NOW })
    expect(checks.map((c) => c.ok)).toEqual([true, true, true])
    expect(checks[1].title).toBe('כל 20 השורות שבצילום הוקלדו')
    expect(checks[2].detail).toBe('השמירה האחרונה לפני רגע.')
  })

  it('התרעות: חשודות (עם פעולה), שורות שונות, שמירה שנכשלה', () => {
    const [suspects, lines, save] = buildFinishChecks({ suspectCount: 6, textLineCount: 19, scanLineCount: 20, saveStatus: 'error' })
    expect(suspects).toMatchObject({ ok: false, title: '6 מילים חשודות לא נבדקו', action: 'suspects' })
    expect(lines).toMatchObject({ ok: false, title: '19 שורות בטקסט, 20 בצילום' })
    expect(save).toMatchObject({ ok: false, title: 'השמירה האחרונה נכשלה' })
  })

  it('יחיד, ומספר שורות בצילום לא ידוע', () => {
    const [suspects, lines] = buildFinishChecks({ suspectCount: 1, textLineCount: 7, scanLineCount: null })
    expect(suspects.title).toBe('מילה חשודה אחת לא נבדקה')
    expect(lines).toMatchObject({ ok: true, title: '7 שורות בטקסט', detail: 'מספר השורות בצילום לא ידוע.' })
  })
})
