import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HELP_SEEN_KEY } from '../ProofHelp'
import ReviewModal from './ReviewModal'

// "בטל קישור" גם בסקירת המנהל (עריכה לפני אישור) — עם העורך האמיתי: קישור שהמתנדב יצר בהגשה יורד יחד עם
// פעולת ה-link_add שלו (בלי link_del), וקישור אוטומטי שהגיע עם העמוד — link_del.
const dialog = vi.hoisted(() => ({ api: null }))
vi.mock('@/components/providers/DialogContext', () => {
  dialog.api = { showAlert: vi.fn(), showConfirm: vi.fn(async () => true) }
  return { useDialog: () => dialog.api }
})

const P = 3
const L = (id, text, extra = {}) => ({ id, order: id, line_no: id - 1, bbox: [100, id * 60, 900, id * 60 + 40], text, text_ocr: text, stream: 'main', status: 'pending', ...extra })
const doc = {
  page: P,
  revision: 1,
  size: [1000, 1000],
  lines: [L(1, 'אמר רבי יוחנן', { para_start: true }), L(2, 'משום רבי'), L(4, 'א רבי יוחנן', { stream: 'notes', para_start: true }), L(5, 'ב משום', { stream: 'notes', para_start: true })],
  links: [{ from_line: 4, to_line: 1, to_page: P, kind: 'note', conf: 0.7, src: 'auto', from_words: [0, 0], to_words: [1, 1] }],
  streams: [
    { key: 'main', he: 'ראשי', color: '#1a56db' },
    { key: 'notes', he: 'הערות', color: '#0e7f3c' },
  ],
}
// ההגשה: אישור שורה + קישור חדש של המתנדב (הערה 5 ← גוף 2)
const ADD = { kind: 'link_add', page: P, ids: [5, 2], value: { kind: 'note', from_words: [0, 0], to_words: [0, 0] } }
const subOps = [{ kind: 'line_ok', page: P, ids: [1] }, ADD]
const payload = {
  success: true,
  page: { id: 'p1', title: 'ספר', page: P, required: 1, revision: 1, doc },
  submission: { id: 's1', status: 'submitted', ops: subOps, userName: 'דוד', createdAt: '2026-09-29T10:00:00Z', note: '', needsRecut: false, revision: 1 },
  siblings: [],
}

let patches
beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(HELP_SEEN_KEY, '1')
  patches = []
  global.fetch = vi.fn(async (url, init) => {
    if (init?.method === 'PATCH') {
      patches.push(JSON.parse(init.body))
      return { json: async () => ({ success: true, status: 'approved', opCount: 1, needsRecut: false, pageStatus: 'done' }) }
    }
    return { json: async () => payload }
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReviewModal — בטל קישור בעריכה לפני אישור', { timeout: 30000 }, () => {
  it('קישור שהמתנדב יצר ← יורד עם ה-link_add שלו; אוטומטי ← link_del; זה מה שנשלח באישור', async () => {
    render(<ReviewModal id="s1" onClose={vi.fn()} onDone={vi.fn()} />)
    await screen.findByRole('textbox', { name: /טקסט הזרם/ })
    // בלי עריכה — "בטל קישור" חסום
    fireEvent.click(screen.getByRole('button', { name: 'פרטים' }))
    const drawer = () => screen.getByRole('complementary', { name: 'פרטים' })
    for (const b of within(drawer()).getAllByRole('button', { name: /בטל קישור/ })) expect(b).toBeDisabled()

    await userEvent.click(screen.getByRole('checkbox', { name: 'עריכה לפני אישור' }))
    const cancel = () => within(drawer()).getAllByRole('button', { name: /בטל קישור/ })
    await waitFor(() => expect(cancel()[0]).toBeEnabled())
    // שני קישורים: ① האוטומטי (גוף שורה 1), ② של המתנדב (גוף שורה 2)
    const added = [...drawer().querySelectorAll('[data-link-item]')].find((li) => /נוסף עכשיו/.test(li.textContent))
    fireEvent.click(within(added).getByRole('button', { name: /בטל קישור/ }))
    await waitFor(() => expect(drawer().querySelectorAll('[data-link-item]')).toHaveLength(1))
    fireEvent.click(cancel()[0])

    await userEvent.click(screen.getByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].action).toBe('approve')
    expect(patches[0].ops).toEqual([
      { kind: 'line_ok', page: P, ids: [1] },
      { kind: 'link_del', page: P, value: { src_line: 4, page: P } },
    ])
  })
})
