import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeApi } from '../../testing/fakeApi'

// "תיקנת" בלשונית המתנדבים: מונה לפי חלק ליד "התאמה", ו"הצג תיקונים" — המתנדב ← המנהל.

vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }) }))

import VolunteersTab, { correctedText } from './VolunteersTab'

const stats = (o, r) => ({
  lines: 10, pages: 0, pending: 0, approved: 8, rejected: 0, match: 70, corrected: o + r,
  bySection: { ocr: { corrected: o }, router: { corrected: r }, frames: { corrected: 0 } },
})

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

describe('VolunteersTab — תיקונים', () => {
  it('correctedText — רק חלקים שיש בהם', () => {
    expect(correctedText(stats(0, 0))).toBe('0')
    expect(correctedText(stats(3, 1))).toBe('זיהוי טקסט 3 · נתב הכתב 1')
  })

  it('"הצג תיקונים" פותח את היומן: החלק, הגרסה של המתנדב והגרסה של המנהל', async () => {
    const vols = [
      { userId: 'a'.repeat(24), name: 'רחל', email: 'r@x', since: null, last: null, stats: stats(1, 1) },
      { userId: 'b'.repeat(24), name: 'דוד', email: 'd@x', since: null, last: null, stats: stats(0, 0) },
    ]
    const { calls } = fakeApi({
      'GET /api/admin/training-proof/volunteers': () => ({ status: 200, data: { requests: [], approved: vols, others: [] } }),
      'GET /api/admin/training-proof/volunteers/*': () => ({
        status: 200,
        data: {
          keep: 200,
          items: [
            { id: '1', section: 'router', alias: 'ספר 7', page: 2, track: 'rashi', before: { label: 'square', words: null }, after: { bad: true }, at: '2026-10-28T20:00:00Z' },
            { id: '2', section: 'ocr', alias: 'ספר 4', page: 3, track: 'rashi', before: { action: 'ok', text: 'אמר רבי' }, after: { action: 'fixed', text: 'אמר רבא' }, at: '2026-10-27T20:00:00Z' },
          ],
        },
      }),
    })
    const user = userEvent.setup()
    render(<VolunteersTab />)
    expect(await screen.findByTestId(`corrected-${'a'.repeat(24)}`)).toHaveTextContent('זיהוי טקסט 1 · נתב הכתב 1')
    expect(within(screen.getByTestId(`corrected-${'b'.repeat(24)}`)).queryByRole('button')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'הצג תיקונים' }))
    const dialog = await screen.findByRole('dialog', { name: 'התיקונים שלך בסימונים של רחל' })
    expect(calls.at(-1).path).toBe(`/api/admin/training-proof/volunteers/${'a'.repeat(24)}/corrections`)
    const rows = await within(dialog).findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('נתב הכתב')
    expect(rows[0]).toHaveTextContent('המתנדב:מרובע')
    expect(rows[0]).toHaveTextContent('אתה:פסול')
    expect(rows[1]).toHaveTextContent('זיהוי טקסט')
    expect(within(rows[1]).getByText('רבא').tagName).toBe('INS')
    expect(within(rows[1]).getByText('רבי').tagName).toBe('DEL')
  })
})
