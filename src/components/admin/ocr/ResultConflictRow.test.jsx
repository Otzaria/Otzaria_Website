// "סמן כנבדק": אותה כתובת, שיטה וגוף; הצלחה — תג "נבדק"; התחברות שפגה (הפניה) — שגיאה עם הסבר, לא "נבדק".
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResultConflictRow from './ResultConflictRow'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock
})

const conflict = { sha256: 'a'.repeat(64), receivedAt: '2026-01-01T10:00:00Z', bytes: 2048 }
const renderRow = (onChanged = vi.fn()) => render(<ul><ResultConflictRow jobId="job1" conflict={conflict} onChanged={onChanged} /></ul>)

describe('ResultConflictRow', () => {
  it('הצלחה — "נבדק", ואותה בקשה כמו קודם', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, reviewedAt: '2026-01-02T00:00:00Z' }) })
    const onChanged = vi.fn()
    renderRow(onChanged)
    await userEvent.setup().click(screen.getByRole('button', { name: 'סמן כנבדק' }))
    expect(await screen.findByText('נבדק')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/books/ocr/result-conflicts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ jobId: 'job1', sha256: conflict.sha256 })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('התחברות שפגה — שגיאה, והכפתור נשאר', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 0, type: 'opaqueredirect', json: async () => ({}) })
    renderRow()
    await userEvent.setup().click(screen.getByRole('button', { name: 'סמן כנבדק' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('פג תוקף ההתחברות')
    expect(screen.queryByText('נבדק')).not.toBeInTheDocument()
  })
})
