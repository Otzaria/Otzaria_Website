// תצוגת ההבדלים: כיתוב הנוסחים, סימון חלקים (פעם אחת בלחיצה), חלק שטופל אינו ניתן לבחירה, ובהתנגשות —
// כפתור לכל נוסח (גם ריק), בחירה שמשאירה את החלק במקומו, ו"בטל".
import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiffPreview from './DiffPreview'

const CHANGES = [
  { idx: 0, before: 'יהי אור', after: 'יהי אור,', status: 'pending' },
  { idx: 1, before: 'שרש', after: 'שורש', status: 'approved' },
  { idx: 2, before: 'ויאמר', after: 'ויאמר משה', status: 'pending' },
]

describe('DiffPreview — הצעת עריכה', () => {
  test('טקסט אחד: כיתוב "השינוי המוצע" (בלי "כרגע בספר" / "מוצע"), ו"חלק 1 מתוך 3"', () => {
    render(<DiffPreview changes={CHANGES.slice(0, 1)} total={3} />)
    expect(screen.getByText('השינוי המוצע')).toBeInTheDocument()
    expect(screen.queryByText('כרגע בספר')).toBeNull()
    expect(screen.getByText('חלק 1 מתוך 3')).toBeInTheDocument()
  })

  test('טקסט אחד: המילה הישנה (<del>, קו חוצה) ומיד אחריה החדשה (<ins>, קו תחתון), עם "נמחק:" / "נוסף:" לקורא מסך', () => {
    const { container } = render(<DiffPreview changes={[{ idx: 0, before: 'ויאמר משה אל העם', after: 'ויאמר אהרן אל העם' }]} />)
    const text = container.querySelector('p')
    expect(text.textContent).toBe('ויאמר נמחק: משה נוסף: אהרן אל העם')
    const del = text.querySelector('del')
    const ins = text.querySelector('ins')
    expect(del.className).toMatch(/line-through/)
    expect(del.querySelector('.sr-only').textContent).toBe('נמחק: ')
    expect(ins.className).toMatch(/underline/)
    expect(ins.querySelector('.sr-only').textContent).toBe('נוסף: ')
    expect(del.nextSibling.textContent).toBe(' ') // רווח בין המחוק לחדש
    expect(container.querySelectorAll('mark')).toHaveLength(0)
  })

  test('רק הוספה / רק מחיקה: תיבה אחת, "מוצע להוסיף" / "מוצע למחוק"', () => {
    const { container } = render(<DiffPreview changes={[{ idx: 0, before: '', after: 'פסוק חדש' }, { idx: 1, before: 'פסוק ישן', after: '' }]} />)
    expect(screen.getByText('מוצע להוסיף')).toBeInTheDocument()
    expect(screen.getByText('מוצע למחוק')).toBeInTheDocument()
    expect(container.querySelector('ins').textContent).toBe('נוסף: פסוק חדש')
    expect(container.querySelector('del').textContent).toBe('נמחק: פסוק ישן')
  })

  test('רוב הקטע השתנה — שתי תיבות, "כרגע בספר" ו"מוצע"', () => {
    const before = 'ויאמר משה אל העם אל תיראו התיצבו וראו את ישועת ה׳'
    const after = 'וידבר אהרן לכל העדה לאמר חזקו ואמצו כי ה׳ נלחם לכם'
    const { container } = render(<DiffPreview changes={[{ idx: 0, before, after }]} />)
    expect(screen.getByText('כרגע בספר')).toBeInTheDocument()
    expect(screen.getByText('מוצע')).toBeInTheDocument()
    expect(screen.queryByText('השינוי המוצע')).toBeNull()
    const marks = [...container.querySelectorAll('mark')]
    expect(marks.find((m) => m.textContent.includes('משה')).className).toMatch(/line-through/)
    expect(marks.find((m) => m.textContent.includes('אהרן')).className).toMatch(/underline/)
  })

  test('לחיצה על התיבה ועל החלק מסמנת פעם אחת בלבד; שם נגיש ייחודי', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<DiffPreview changes={CHANGES} selectable selected={new Set()} onToggle={onToggle} partLabel={(i) => `חלק ${i + 1} בהצעה לבראשית`} />)
    await user.click(screen.getByRole('checkbox', { name: 'חלק 1 בהצעה לבראשית' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenLastCalledWith(0)
    await user.click(screen.getByText('חלק 3 מתוך 3'))
    expect(onToggle).toHaveBeenCalledTimes(2)
    expect(onToggle).toHaveBeenLastCalledWith(2)
  })

  test('חלק שכבר אושר — תג, בלי תיבה, ולחיצה עליו לא מסמנת', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(<DiffPreview changes={CHANGES} selectable selected={new Set()} onToggle={onToggle} />)
    expect(screen.queryByRole('checkbox', { name: 'חלק 2' })).toBeNull()
    expect(screen.getByText('אושר')).toBeInTheDocument()
    await user.click(within(screen.getByText('אושר').closest('.overflow-hidden')).getByText('נמחק:').parentElement)
    expect(onToggle).not.toHaveBeenCalled()
  })

  test('אין חלקים — "אין שינויים להצגה"', () => {
    render(<DiffPreview changes={[]} />)
    expect(screen.getByText('אין שינויים להצגה')).toBeInTheDocument()
  })
})

describe('DiffPreview — התנגשות', () => {
  const PARTS = [
    { before: 'יהי אור', after: 'יהי אור,' },
    { before: '', after: 'פסוק שנוסף באתר' },
  ]

  test('onResolve מקבל את החלק ואת הצד; לכל כפתור שם עם מספר החלק', async () => {
    const onResolve = vi.fn()
    const user = userEvent.setup()
    render(<DiffPreview changes={PARTS} onResolve={onResolve} />)
    await user.click(screen.getByRole('button', { name: 'השאר את הנוסח שבאתר: חלק 1 מתוך 2' }))
    expect(onResolve).toHaveBeenCalledWith(PARTS[0], 'ours')
    await user.click(screen.getByRole('button', { name: 'השאר את הנוסח שבמאגר: חלק 1 מתוך 2' }))
    expect(onResolve).toHaveBeenLastCalledWith(PARTS[0], 'theirs')
  })

  test('צד ריק — מוצג, עם "השאר בלי טקסט (מחק את החלק)"', async () => {
    const onResolve = vi.fn()
    const user = userEvent.setup()
    render(<DiffPreview changes={PARTS} onResolve={onResolve} />)
    expect(screen.getByText('(אין כאן טקסט)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'השאר בלי טקסט (מחק את החלק): חלק 2 מתוך 2' }))
    expect(onResolve).toHaveBeenCalledWith(PARTS[1], 'theirs')
  })

  test('אחרי בחירה: החלק נשאר, בלי כפתורי בחירה, עם "נבחר" ו"בטל"', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    const decisions = new Map([[PARTS[0], { strategy: 'ours', state: 'waiting' }]])
    render(<DiffPreview changes={PARTS} onResolve={vi.fn()} decisions={decisions} onCancel={onCancel} />)
    expect(screen.queryByRole('button', { name: /^השאר.*חלק 1 מתוך 2$/ })).toBeNull()
    expect(screen.getByText('נבחר: הנוסח שבאתר')).toBeInTheDocument()
    expect(screen.getByText('נבחר')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'בטל את הבחירה: חלק 1 מתוך 2' }))
    expect(onCancel).toHaveBeenCalledWith(PARTS[0])
    // החלק השני עדיין ניתן להכרעה
    expect(within(screen.getByText('חלק 2 מתוך 2').closest('div').parentElement).getAllByRole('button')).toHaveLength(2)
  })

  test('נשמר — בלי "בטל"', () => {
    const decisions = new Map([[PARTS[0], { strategy: 'theirs', state: 'saved' }]])
    render(<DiffPreview changes={PARTS} onResolve={vi.fn()} decisions={decisions} />)
    expect(screen.getByText('נשמר: נשאר הנוסח שבמאגר')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /בטל/ })).toBeNull()
  })
})
