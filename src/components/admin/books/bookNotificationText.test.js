import { describe, expect, test } from 'vitest'
import { notificationOutcome } from './bookNotificationText'

describe('notificationOutcome', () => {
  test('נכנס לתור — כמה מנויים, ושזה ברקע', () => {
    expect(notificationOutcome({ status: 'queued', total: 726 })).toEqual({ text: 'ההודעה ל־726 המנויים נשלחת ברקע, בהדרגה', problem: false })
    expect(notificationOutcome({ status: 'queued', total: 1 }).text).toBe('ההודעה למנוי נשלחת ברקע')
  })

  test('לחיצה חוזרת — אומר שלא נשלח שוב', () => {
    expect(notificationOutcome({ status: 'already_queued', total: 5 }).text).toMatch('לא נשלחה שוב')
    expect(notificationOutcome({ status: 'already_sent', total: 5 }).text).toMatch('כבר נשלחה בעבר')
  })

  test('אין מנויים', () => {
    expect(notificationOutcome({ status: 'no_subscribers', total: 0 })).toEqual({ text: 'אין מנויים לשלוח להם הודעה', problem: false })
  })

  test('כשל בתור / תשובה בלי notification — בעיה', () => {
    expect(notificationOutcome({ status: 'error' }).problem).toBe(true)
    expect(notificationOutcome(undefined).problem).toBe(true)
  })
})
