import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportCard from './ImportCard'

const zip = (name = 'ספר.zip') => new File([new Uint8Array([80, 75, 3, 4])], name, { type: 'application/zip' })

// שרת מדומה: GET רשימת-הספרים ← books(posted) (הבדיקה משנה את התשובה תוך כדי); POST ייבוא ← התשובה
// הבאה בתור ({status, json}, או הבטחה שלה; json: null — תשובה שאינה JSON, כמו דף-השגיאה של השער).
// posted — שמות הקבצים בכל בקשת-ייבוא
function mockServer({ books = () => [], imports = [] } = {}) {
  const posted = []
  const fn = vi.fn(async (url, init) => {
    if (url === '/api/admin/page-proof') return { status: 200, json: async () => ({ success: true, books: books(posted) }) }
    if (url === '/api/admin/page-proof/import') {
      posted.push(init.body.getAll('file').map((f) => f.name))
      const r = (await imports.shift()) || { status: 500, json: null }
      return {
        status: r.status,
        json: async () => {
          if (r.json === null) throw new SyntaxError('Unexpected token <')
          return r.json
        },
      }
    }
    throw new Error(`fetch לא צפוי: ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, posted }
}

const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function start(files, props = {}) {
  const onImported = vi.fn()
  render(<ImportCard onImported={onImported} {...props} />)
  fireEvent.change(screen.getByLabelText('קובצי ZIP לייבוא'), { target: { files } })
  fireEvent.click(screen.getByRole('button', { name: /ייבא/ }))
  return { onImported }
}

const idle = () => waitFor(() => expect(screen.queryByText(/מייבא…/)).toBeNull())

async function importWith(payload) {
  const { fn: fetchFn } = mockServer({ imports: [{ status: 200, json: payload }] })
  const { onImported } = start([zip()])
  await idle()
  return { onImported, fetchFn }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ImportCard — סיכום הייבוא', () => {
  it('מציג עמודים שחזרו מזיהוי-מחדש ועמודים שעודכנו', async () => {
    const { onImported, fetchFn } = await importWith({
      success: true,
      results: [{ gid: 'a1b2c3d4e5', title: 'ספר א', created: 2, updated: 5, recut: 3, skippedAnswered: 1, skippedRecut: 0, skippedOlder: 0, errors: [] }],
      errors: [],
    })
    expect(fetchFn).toHaveBeenCalledWith('/api/admin/page-proof/import', expect.objectContaining({ method: 'POST' }))
    const row = await screen.findByTestId('import-result')
    expect(row.textContent).toContain('ספר א')
    expect(row.textContent).toContain('2 עמודים חדשים')
    expect(row.textContent).toContain('5 עודכנו')
    expect(row.textContent).toContain('3 חזרו מזיהוי-מחדש ונפתחו למעבר שני')
    expect(row.textContent).toContain('1 דולגו (כבר הוגשו)')
    expect(row.textContent).not.toContain('ממתינים לזיהוי-מחדש')
    expect(onImported).toHaveBeenCalledTimes(1)
  })

  it('מסביר עמודים שממתינים לזיהוי-מחדש בלי גרסה חדשה, וגרסה ישנה בחבילה', async () => {
    await importWith({
      success: true,
      results: [{ gid: 'a1b2c3d4e5', title: 'ספר ב', created: 0, updated: 0, recut: 0, skippedRecut: 4, skippedOlder: 2, errors: ['עמוד 7: שגיאה'] }],
      errors: [],
    })
    const row = await screen.findByTestId('import-result')
    expect(row.textContent).toContain('4 ממתינים לזיהוי-מחדש — בחבילה אין גרסה חדשה שלהם')
    expect(row.textContent).toContain('2 דולגו — בחבילה גרסה ישנה מזו שבאתר')
    expect(screen.getByText('עמוד 7: שגיאה')).toBeTruthy()
  })

  it('שגיאות בלי תוצאות — לא קורא ל-onImported', async () => {
    const { onImported } = await importWith({ success: false, results: [], errors: ['ספר.zip: קובץ ה-ZIP פגום'] })
    expect(await screen.findByText('ספר.zip: קובץ ה-ZIP פגום')).toBeTruthy()
    expect(onImported).not.toHaveBeenCalled()
  })
})

describe('ImportCard — קובץ-קובץ, ושער שהפסיק לחכות', () => {
  const T0 = '2026-09-30T08:00:00.000Z'
  const book = (lastImportAt, extra = {}) => ({ gid: 'a1b2c3d4e5', title: 'ספר א', pageCount: 40, lineCount: 1800, lastImportAt, ...extra })

  it('כל קובץ בבקשה משלו, אחד אחרי השני ("קובץ i מתוך n"); ספר בכמה קבצים — שורה אחת; שגיאה עם שם הקובץ', async () => {
    const first = deferred()
    const { posted } = mockServer({
      books: () => [book(T0)],
      imports: [
        first.promise,
        { status: 200, json: { success: true, results: [{ gid: 'a1b2c3d4e5', title: 'ספר א', created: 32, updated: 4, errors: [] }], errors: [] } },
        { status: 500, json: { error: 'הייבוא נכשל' } },
      ],
    })
    const { onImported } = start([zip('א.zip'), zip('ב.zip'), zip('ג.zip')])
    expect(await screen.findByTestId('import-progress')).toHaveTextContent('קובץ 1 מתוך 3')
    await waitFor(() => expect(posted).toEqual([['א.zip']]))
    first.resolve({ status: 200, json: { success: true, results: [{ gid: 'a1b2c3d4e5', title: 'ספר א', created: 30, updated: 0, errors: [] }], errors: [] } })
    await idle()
    expect(posted).toEqual([['א.zip'], ['ב.zip'], ['ג.zip']])
    const rows = screen.getAllByTestId('import-result')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('62 עמודים חדשים')
    expect(rows[0].textContent).toContain('4 עודכנו')
    expect(screen.getByText('ג.zip: הייבוא נכשל')).toBeTruthy()
    expect(onImported).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('import-progress')).toBeNull()
  })

  it('504 מהשער אינו כישלון: בודק ברשימת-הספרים עד שתאריך-הייבוא מתחדש, ואז ממשיך לקובץ הבא', async () => {
    let polls = 0
    const { posted } = mockServer({
      // התצלום לפני הקובץ הראשון — T0; אחרי ה-504 הייבוא "מסתיים" בבדיקה השלישית
      books: (sent) => {
        if (!sent.length) return [book(T0)]
        polls++
        return polls < 3 ? [book(T0)] : [book('2026-09-30T08:01:10.000Z', { pageCount: 92, lineCount: 5000 })]
      },
      imports: [
        { status: 504, json: null },
        { status: 200, json: { success: true, results: [{ gid: 'f6e5d4c3b2', title: 'ספר ב', created: 3, updated: 0, errors: [] }], errors: [] } },
      ],
    })
    const { onImported } = start([zip('גדול.zip'), zip('קטן.zip')], { pollEvery: 5, pollFor: 1000 })
    expect(await screen.findByText(/השער של האתר הפסיק לחכות לתשובה — אבל השרת ממשיך לעבד אותו/)).toBeTruthy()
    await idle()
    expect(screen.getByTestId('import-finished')).toHaveTextContent('הייבוא הסתיים: ספר א · 92 עמודים · 5000 שורות')
    expect(posted).toEqual([['גדול.zip'], ['קטן.zip']])
    expect(screen.getByTestId('import-result')).toHaveTextContent('ספר ב')
    expect(screen.queryByText(/שגיאת שרת/)).toBeNull()
    expect(screen.queryByTestId('import-notice')).toBeNull()
    expect(polls).toBeGreaterThanOrEqual(3)
    expect(onImported).toHaveBeenCalledTimes(2)
  })

  it('504 ולא התקבל אישור בזמן — הודעה שאין צורך להעלות שוב, ושאר הקבצים לא נשלחים', async () => {
    const { posted } = mockServer({ books: () => [book(T0)], imports: [{ status: 502, json: null }] })
    const { onImported } = start([zip('א.zip'), zip('ב.zip'), zip('ג.zip')], { pollEvery: 2, pollFor: 20 })
    await idle()
    const note = screen.getByTestId('import-notice')
    expect(note).toHaveTextContent('לא התקבל אישור שהייבוא הסתיים')
    expect(note).toHaveTextContent('אין צורך להעלות שוב לפני כן')
    expect(note).toHaveTextContent('לא נשלחו: ב.zip, ג.zip')
    expect(posted).toEqual([['א.zip']])
    expect(screen.queryByText(/שגיאת שרת/)).toBeNull()
    expect(onImported).not.toHaveBeenCalled()
  })
})
