// החלונות של מסך הספרים (במקום הטסטים של RenameBookDialog / MergeBooksDialog / AddBookDialog הישנים):
// שינוי שם, מיזוג (סדר, אישור מפורש כשיש עבודה שתימחק, שם תפוס) והוספת ספר (בדיקות לפני העלאה).
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddBookDialog from './AddBookDialog'
import MergeBooksDialog from './MergeBooksDialog'
import ShowBookDialog from './ShowBookDialog'
import RenameBookDialog from './RenameBookDialog'

vi.setConfig({ testTimeout: 20000 })

const B = (id, name, extra = {}) => ({ id, name, path: `slug-${id}`, totalPages: 10, completedPages: 0, inProgressPages: 0, category: 'כללי', ...extra })
const OPTIONS = [{ value: 'כללי', label: 'כללי' }, { value: 'ראשונים', label: 'ראשונים' }]
const json = (data, status = 200) => ({
  ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
  headers: new Headers({ 'content-type': 'application/json' }), json: async () => data,
})

let calls
beforeEach(() => {
  calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
    return json(url === '/api/admin/books/merge' ? { success: true, bookId: 'new-id' } : { success: true })
  })
})

describe('RenameBookDialog', () => {
  test('"שמור" מושבת עד שיש שינוי; שומר שם וקטגוריה', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {})
    const onClose = vi.fn()
    render(<RenameBookDialog book={B('1', 'חוות דעת')} categoryOptions={OPTIONS} onSave={onSave} onClose={onClose} />)
    const save = screen.getByRole('button', { name: 'שמור' })
    expect(save).toBeDisabled()
    const input = screen.getByLabelText('שם הספר')
    await user.clear(input)
    await user.type(input, 'חוות דעת השלם')
    await user.click(save)
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), { name: 'חוות דעת השלם', category: 'כללי' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  test('ספר אישי — בלי בורר קטגוריה, ושומר רק את השם', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async () => {})
    render(<RenameBookDialog book={B('2', 'מעיין נדה', { isPrivate: true, ownerId: 'u1' })} categoryOptions={OPTIONS} onSave={onSave} onClose={() => {}} />)
    expect(screen.getByText('ספר אישי — אין לו קטגוריה לשנות.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('שם הספר'), ' ב')
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), { name: 'מעיין נדה ב' })
  })

  test('כשל בשמירה — ההודעה בתוך החלון, והחלון נשאר פתוח', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSave = vi.fn(async () => { throw new Error('שם הספר כבר קיים') })
    render(<RenameBookDialog book={B('1', 'חוות דעת')} categoryOptions={OPTIONS} onSave={onSave} onClose={onClose} />)
    await user.type(screen.getByLabelText('שם הספר'), ' ב')
    await user.click(screen.getByRole('button', { name: 'שמור' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('שם הספר כבר קיים')
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('MergeBooksDialog', () => {
  const books = [B('1', 'חלק א'), B('2', 'חלק ב'), B('3', 'חלק ג', { completedPages: 3 })]

  test('שולח את הספרים לפי הסדר שבחלון, אחרי שינוי סדר', async () => {
    const user = userEvent.setup()
    const onMerged = vi.fn()
    render(<MergeBooksDialog initial={[books[0], books[1]]} books={books} onMerged={onMerged} onClose={() => {}} />)
    const submit = screen.getByRole('button', { name: 'מזג ומחק 2 ספרים' })
    await user.click(screen.getByRole('button', { name: 'אחר את חלק א' }))
    await user.clear(screen.getByLabelText('שם הספר המאוחד'))
    await user.type(screen.getByLabelText('שם הספר המאוחד'), 'הספר השלם')
    await user.click(submit)
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith('הספר השלם', undefined))
    expect(calls).toEqual([{ url: '/api/admin/books/merge', method: 'POST', body: { bookIds: ['2', '1'], newName: 'הספר השלם', isHidden: true } }])
  })

  test('ספר שכבר התחילו לעבוד עליו — אי אפשר למזג בלי אישור מפורש', async () => {
    const user = userEvent.setup()
    render(<MergeBooksDialog initial={[books[0], books[2]]} books={books} onMerged={() => {}} onClose={() => {}} />)
    await user.clear(screen.getByLabelText('שם הספר המאוחד'))
    await user.type(screen.getByLabelText('שם הספר המאוחד'), 'חדש')
    const submit = screen.getByRole('button', { name: /^מזג ומחק/ })
    expect(submit).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /אני מבין שהטקסט שכבר נערך/ }))
    expect(submit).toBeEnabled()
  })

  test('שם שכבר קיים — שגיאה, והכפתור מושבת', async () => {
    const user = userEvent.setup()
    render(<MergeBooksDialog initial={[books[0], books[1]]} books={books} onMerged={() => {}} onClose={() => {}} />)
    await user.clear(screen.getByLabelText('שם הספר המאוחד'))
    await user.type(screen.getByLabelText('שם הספר המאוחד'), 'חלק ג')
    expect(screen.getByRole('alert')).toHaveTextContent('כבר יש ספר בשם הזה')
    expect(screen.getByRole('button', { name: /^מזג ומחק/ })).toBeDisabled()
  })

  test('הספר שנשאר: השם שלו מוצע; ממזגים בשם זמני ואז מחזירים לו את השם והקטגוריה — באותו API', async () => {
    const user = userEvent.setup()
    const onMerged = vi.fn()
    const kept = B('2', 'חלק ב', { category: 'ראשונים' })
    render(<MergeBooksDialog initial={[books[0], kept]} books={[books[0], kept, books[2]]} onMerged={onMerged} onClose={() => {}} />)
    expect(screen.getByLabelText('שם הספר המאוחד')).toHaveValue('חלק א')
    await user.click(screen.getByRole('radio', { name: 'חלק ב — הספר שנשאר' }))
    expect(screen.getByLabelText('שם הספר המאוחד')).toHaveValue('חלק ב')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'מזג ומחק 2 ספרים' }))
    await waitFor(() => expect(onMerged).toHaveBeenCalledWith('חלק ב', undefined))
    expect(calls[0].body.bookIds).toEqual(['1', '2'])
    expect(calls[0].body.newName).toMatch(/^חלק ב \(מיזוג \d+\)$/)
    expect(calls[1]).toMatchObject({ url: '/api/admin/books/update', method: 'PUT', body: { bookId: 'new-id', name: 'חלק ב', category: 'ראשונים' } })
  })

  test('פחות משני ספרים — "צריך לפחות שני ספרים"', async () => {
    const user = userEvent.setup()
    render(<MergeBooksDialog initial={[books[0], books[1]]} books={books} onMerged={() => {}} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'הסר את חלק ב מהמיזוג' }))
    expect(screen.getByText('צריך לפחות שני ספרים.')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'מזג ספרים' })).toBeDisabled()
  })
})

describe('ShowBookDialog', () => {
  test('"הצג בלי הודעה" הוא הכפתור הבולט; כמה מנויים יקבלו הודעה כתוב בחלון', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => true)
    render(<ShowBookDialog book={B('1', 'חוות דעת')} subscriberCount={665} onConfirm={onConfirm} onClose={() => {}} />)
    expect(screen.getByText('665 מנויים יקבלו את ההודעה.')).toBeInTheDocument()
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button').map((b) => b.textContent.replace('send', '').trim())
    expect(buttons.slice(-2)).toEqual(['הצג ושלח הודעה', 'הצג בלי הודעה'])
    await user.click(screen.getByRole('button', { name: 'הצג בלי הודעה' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), false)
  })
})

describe('AddBookDialog', () => {
  test('בלי קובץ ובלי שם — שגיאות בשדות, ושום דבר לא נשלח', async () => {
    const user = userEvent.setup()
    render(<AddBookDialog categoryOptions={OPTIONS} onAdded={() => {}} onClose={() => {}} />)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'הוסף ספר' }))
    expect(screen.getByText('כתוב שם לספר.')).toBeInTheDocument()
    expect(screen.getByText('בחר קובץ PDF.')).toBeInTheDocument()
    expect(calls).toEqual([])
  })
})
