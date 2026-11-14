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

// הוספת ספר: הקריאה והחיתוך של ה-PDF (pdf-lib) נבדקים ב-pdfSlice.test.js; כאן — מה החלון עושה איתם.
const pdfMock = vi.hoisted(() => ({ info: {}, sliceSize: 1000 }))
vi.mock('./pdfSlice', () => ({
  openPdf: vi.fn(async (file) => {
    const info = pdfMock.info[file.name]
    if (!info) throw new Error('unreadable')
    return { doc: { name: file.name }, encrypted: false, ...info }
  }),
  slicePdf: vi.fn(async (_doc, range, fileName) => {
    const f = new File(['x'], fileName, { type: 'application/pdf' })
    Object.defineProperty(f, 'size', { value: pdfMock.sliceSize })
    f.slicedRange = range
    return f
  }),
}))
vi.mock('./booksApi', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadBook: vi.fn(async () => ({ success: true, bookId: 'b1' })),
}))

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

  const MB = 1024 * 1024
  const pdfFile = (fileName, size) => {
    const f = new File(['%PDF'], fileName, { type: 'application/pdf' })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }
  const setup = async (file, info) => {
    const user = userEvent.setup()
    const { uploadBook } = await import('./booksApi')
    const { slicePdf } = await import('./pdfSlice')
    uploadBook.mockClear()
    slicePdf.mockClear()
    pdfMock.info = info ? { [file.name]: info } : {}
    pdfMock.sliceSize = 1000
    const onAdded = vi.fn()
    render(<AddBookDialog categoryOptions={OPTIONS} onAdded={onAdded} onClose={() => {}} />)
    await user.upload(document.querySelector('input[type="file"]'), file)
    const dialog = within(screen.getByRole('dialog'))
    const submit = () => user.click(dialog.getByRole('button', { name: 'הוסף ספר' }))
    const uploaded = () => uploadBook.mock.calls[0]?.[0]?.get('pdf')
    return { user, dialog, submit, uploaded, uploadBook, slicePdf, onAdded }
  }

  test('בלי טווח — הקובץ המקורי נשלח כמו שהוא, בלי חיתוך', async () => {
    const file = pdfFile('ספר_א.pdf', 2 * MB)
    const { dialog, submit, uploaded, slicePdf, onAdded } = await setup(file, { pageCount: 300 })
    expect(await dialog.findByText('יועלו כל 300 העמודים.')).toBeInTheDocument()
    expect(dialog.getByRole('textbox', { name: 'עד עמוד' })).toHaveAttribute('placeholder', '300')
    await submit()
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith('ספר א'))
    expect(slicePdf).not.toHaveBeenCalled()
    expect(uploaded()).toBe(file)
  })

  test('טווח חלקי — נשלח רק ה-PDF שנחתך מהעמודים שנבחרו, והסיכום אומר שהמספור מתחיל מ-1', async () => {
    const file = pdfFile('ספר.pdf', 2 * MB)
    const { user, dialog, submit, uploaded, slicePdf } = await setup(file, { pageCount: 300 })
    await dialog.findByText('יועלו כל 300 העמודים.')
    await user.type(dialog.getByRole('textbox', { name: 'מעמוד' }), '41')
    await user.type(dialog.getByRole('textbox', { name: 'עד עמוד' }), '60')
    expect(dialog.getByText('יועלו 20 עמודים (41–60) מתוך 300; בספר הם ימוספרו 1–20.')).toBeInTheDocument()
    await submit()
    await waitFor(() => expect(uploaded()).toBeTruthy())
    expect(slicePdf).toHaveBeenCalledWith({ name: 'ספר.pdf' }, { from: 41, to: 60 }, 'ספר.pdf')
    expect(uploaded().slicedRange).toEqual({ from: 41, to: 60 })
  })

  test('קובץ מעל 50MB: בלי טווח — שגיאה שמציעה טווח; עם טווח — עולה החלק', async () => {
    const file = pdfFile('גדול.pdf', 200 * MB)
    const { user, dialog, submit, uploaded, uploadBook } = await setup(file, { pageCount: 900 })
    await dialog.findByText('יועלו כל 900 העמודים.')
    await submit()
    expect(dialog.getByText(/בחר טווח עמודים כדי להעלות רק חלק ממנו/)).toBeInTheDocument()
    expect(uploadBook).not.toHaveBeenCalled()
    await user.type(dialog.getByRole('textbox', { name: 'עד עמוד' }), '100')
    await submit()
    await waitFor(() => expect(uploaded()?.slicedRange).toEqual({ from: 1, to: 100 }))
  })

  test('טווח לא תקין — שגיאה ליד השדות, ושום דבר לא נחתך או נשלח', async () => {
    const { user, dialog, submit, uploadBook, slicePdf } = await setup(pdfFile('a.pdf', MB), { pageCount: 10 })
    await dialog.findByText('יועלו כל 10 העמודים.')
    await user.type(dialog.getByRole('textbox', { name: 'מעמוד' }), '8')
    await user.type(dialog.getByRole('textbox', { name: 'עד עמוד' }), '3')
    await submit()
    expect(dialog.getByText('עמוד הסוף לפני עמוד ההתחלה.')).toBeInTheDocument()
    expect(dialog.getByRole('textbox', { name: 'עד עמוד' })).toHaveAttribute('aria-invalid', 'true')
    expect(slicePdf).not.toHaveBeenCalled()
    expect(uploadBook).not.toHaveBeenCalled()
  })

  test('החלק שנחתך עדיין מעל 50MB — הודעה לבחור פחות עמודים, ולא נשלח', async () => {
    const { user, dialog, submit, uploadBook } = await setup(pdfFile('a.pdf', 300 * MB), { pageCount: 500 })
    await dialog.findByText('יועלו כל 500 העמודים.')
    pdfMock.sliceSize = 80 * MB
    await user.type(dialog.getByRole('textbox', { name: 'עד עמוד' }), '400')
    await submit()
    expect(await dialog.findByText(/בחר פחות עמודים/)).toBeInTheDocument()
    expect(uploadBook).not.toHaveBeenCalled()
  })

  test('קובץ מוצפן או שלא נקרא — השדות מושבתים ואפשר להעלות רק בשלמותו', async () => {
    const enc = await setup(pdfFile('מוצפן.pdf', MB), { pageCount: 12, encrypted: true })
    expect(await enc.dialog.findByText(/מוגן בהצפנה \(12 עמודים\)/)).toBeInTheDocument()
    expect(enc.dialog.getByRole('textbox', { name: 'מעמוד' })).toBeDisabled()
    await enc.submit()
    await waitFor(() => expect(enc.uploaded()?.name).toBe('מוצפן.pdf'))
    expect(enc.slicePdf).not.toHaveBeenCalled()
  })

  test('קובץ שלא נקרא בדפדפן ומעל 50MB — הודעת הגודל הרגילה (בלי הצעת טווח)', async () => {
    const { dialog, submit, uploadBook } = await setup(pdfFile('שבור.pdf', 60 * MB), null)
    expect(await dialog.findByText(/אפשר להעלות אותו רק בשלמותו/)).toBeInTheDocument()
    expect(dialog.getByRole('textbox', { name: 'עד עמוד' })).toBeDisabled()
    await submit()
    expect(dialog.getByText(/^הקובץ גדול מדי \(.*\)\. אפשר עד 50MB\.$/)).toBeInTheDocument()
    expect(uploadBook).not.toHaveBeenCalled()
  })
})
