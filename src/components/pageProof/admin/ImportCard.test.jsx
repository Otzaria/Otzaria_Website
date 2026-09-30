import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ImportCard from './ImportCard'

const zip = () => new File([new Uint8Array([80, 75, 3, 4])], 'ספר.zip', { type: 'application/zip' })

function mockFetch(payload, status = 200) {
  const fn = vi.fn(async () => ({ status, json: async () => payload }))
  vi.stubGlobal('fetch', fn)
  return fn
}

async function importWith(payload) {
  const onImported = vi.fn()
  const fetchFn = mockFetch(payload)
  render(<ImportCard onImported={onImported} />)
  fireEvent.change(screen.getByLabelText('קובצי ZIP לייבוא'), { target: { files: [zip()] } })
  fireEvent.click(screen.getByRole('button', { name: /ייבא/ }))
  await waitFor(() => expect(screen.queryByText(/מייבא…/)).toBeNull())
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
