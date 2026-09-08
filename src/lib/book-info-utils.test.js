import { describe, it, expect } from 'vitest'
import { mergeBookInfoWithPending, normalizeBookInfoUpdates } from './book-info-utils'

describe('mergeBookInfoWithPending', () => {
  const book = { bookName: 'ספר', authorName: 'מחבר', startYear: 100 }

  it('ללא pending — מחזיר עותק של הספר כמות שהוא', () => {
    const result = mergeBookInfoWithPending(book, null)
    expect(result).toEqual(book)
    expect(result).not.toBe(book) // עותק, לא אותו אובייקט
  })

  it('pending ללא changes — מחזיר עותק של הספר כמות שהוא', () => {
    expect(mergeBookInfoWithPending(book, {})).toEqual(book)
    expect(mergeBookInfoWithPending(book, { changes: null })).toEqual(book)
  })

  it('pending.changes גובר על שדות הספר המקוריים', () => {
    const result = mergeBookInfoWithPending(book, { changes: { authorName: 'מחבר חדש' } })
    expect(result).toEqual({ bookName: 'ספר', authorName: 'מחבר חדש', startYear: 100 })
  })

  it('pending.changes יכול להוסיף שדות שלא היו בספר המקורי', () => {
    const result = mergeBookInfoWithPending(book, { changes: { endYear: 200 } })
    expect(result.endYear).toBe(200)
  })
})

describe('normalizeBookInfoUpdates', () => {
  it('מעדכן אך ורק שדות שנשלחו בפועל (hasOwnProperty), לא כל שדה שאינו undefined', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ bookName: 'שם' })
    expect(errors).toEqual([])
    expect(Object.keys(updates)).toEqual(['bookName'])
  })

  it('בורך ריק מחזיר עדכונים ריקים ללא שגיאות', () => {
    expect(normalizeBookInfoUpdates()).toEqual({ updates: {}, errors: [] })
    expect(normalizeBookInfoUpdates({})).toEqual({ updates: {}, errors: [] })
  })

  it('bookName ריק נדחה כשדה חובה, ואינו נכנס לעדכונים', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ bookName: '   ' })
    expect(errors).toContain('שם הספר הוא שדה חובה')
    expect(updates.bookName).toBeUndefined()
  })

  it('authorName ריק/null מנורמל למחרוזת ריקה (לא null)', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ authorName: null })
    expect(errors).toEqual([])
    expect(updates.authorName).toBe('')
  })

  it('authorName עם רווחים סביב נחתך', () => {
    const { updates } = normalizeBookInfoUpdates({ authorName: '  רבי עקיבא  ' })
    expect(updates.authorName).toBe('רבי עקיבא')
  })

  it('generationName לא תקין נדחה', () => {
    const { errors } = normalizeBookInfoUpdates({ generationName: 'לא קיים' })
    expect(errors).toContain('ערך דור מחבר לא תקין')
  })

  it('generationName ריק מאופס ל-null, וגורר איפוס subGenerationName ל-null גם אם לא נשלח', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ generationName: '' })
    expect(errors).toEqual([])
    expect(updates.generationName).toBeNull()
    expect(updates.subGenerationName).toBeNull()
  })

  it('subGenerationName תקין תואם ל-generationName שנשלח יחד עמו', () => {
    const { updates, errors } = normalizeBookInfoUpdates({
      generationName: 'חז"ל',
      subGenerationName: 'תנאים'
    })
    expect(errors).toEqual([])
    expect(updates.subGenerationName).toBe('תנאים')
  })

  it('subGenerationName שאינו שייך ל-generationName שנשלח נדחה', () => {
    const { errors } = normalizeBookInfoUpdates({
      generationName: 'ראשונים',
      subGenerationName: 'אמוראים' // שייך ל"חז"ל", לא ל"ראשונים"
    })
    expect(errors).toContain('דור המשנה לא תואם לדור שנבחר')
  })

  it('דור "מחברי זמננו" ללא תת-דור מקבל תת-דור ברירת מחדל זהה', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ generationName: 'מחברי זמננו' })
    expect(errors).toEqual([])
    expect(updates.subGenerationName).toBe('מחברי זמננו')
  })

  it('startYear/endYear תקינים נכנסים כמספרים', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ startYear: '100', endYear: 200 })
    expect(errors).toEqual([])
    expect(updates.startYear).toBe(100)
    expect(updates.endYear).toBe(200)
  })

  it('startYear ריק מנורמל ל-null ולא נחשב שגיאה', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ startYear: '' })
    expect(errors).toEqual([])
    expect(updates.startYear).toBeNull()
  })

  it('startYear שאינו מספר נדחה ואינו נכנס לעדכונים', () => {
    const { updates, errors } = normalizeBookInfoUpdates({ startYear: 'לא מספר' })
    expect(errors).toContain('ערך לא תקין בשדה startYear')
    expect(updates.startYear).toBeUndefined()
  })

  it('startYear גדול מ-endYear נדחה', () => {
    const { errors } = normalizeBookInfoUpdates({ startYear: 200, endYear: 100 })
    expect(errors).toContain('שנת התחלה לא יכולה להיות גדולה משנת סיום')
  })

  it('startYear שווה ל-endYear תקין (גבול לא כולל)', () => {
    const { errors } = normalizeBookInfoUpdates({ startYear: 100, endYear: 100 })
    expect(errors).toEqual([])
  })

  it('צובר כמה שגיאות בו-זמנית', () => {
    const { errors } = normalizeBookInfoUpdates({
      bookName: '',
      generationName: 'לא קיים',
      startYear: 'abc'
    })
    expect(errors).toHaveLength(3)
  })
})
