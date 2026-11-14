import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LegacyTab from './LegacyTab'

// הדף הישן: המחיקה רק אחרי שני אישורים — חלון ראשון, ואז הקלדת משפט-האישור. בלי שניהם
// לא נשלחת שום בקשת מחיקה.

const { showConfirm, showAlert } = vi.hoisted(() => ({ showConfirm: vi.fn(), showAlert: vi.fn() }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm, showAlert }) }))

const json = (b) => Promise.resolve(new Response(JSON.stringify({ success: true, ...b })))
const COUNTS = { counts: { books: 2, pages: 40, submissions: 7, drafts: 1 }, files: 40, confirm: 'מחק את הדף הישן' }

beforeEach(() => {
  vi.restoreAllMocks()
  showConfirm.mockReset()
})

describe('LegacyTab', () => {
  it('חלון ראשון שבוטל — שום בקשה', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(COUNTS))
    showConfirm.mockImplementation(() => {})
    render(<LegacyTab />)
    fireEvent.click(await screen.findByRole('button', { name: /מחק את הנתונים של הדף הישן/ }))
    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(showConfirm.mock.calls[0][1]).toMatch(/2 ספרים, 40 עמודים, 7 הגשות/)
    // כפתור הביטול נשאר "ביטול" (ולא טקסט האישור)
    expect(showConfirm.mock.calls[0].slice(3)).toEqual(['המשך', 'ביטול'])
    expect(screen.queryByText('אישור אחרון')).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('אישור שני: הכפתור נעול עד שמקלידים את המשפט, ורק אז נשלחת המחיקה', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation((url, opt) =>
      opt?.method === 'POST' ? json({ deleted: { books: 2, pages: 40, submissions: 7, drafts: 1 }, files: 40 }) : json(COUNTS)
    )
    showConfirm.mockImplementation((_t, _m, onYes) => onYes())
    render(<LegacyTab />)
    fireEvent.click(await screen.findByRole('button', { name: /מחק את הנתונים של הדף הישן/ }))
    const go = await screen.findByRole('button', { name: 'מחק לצמיתות' })
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'מחק' } })
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'מחק את הדף הישן' } })
    expect(go).toBeEnabled()
    fireEvent.click(go)
    await waitFor(() => expect(f.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true))
    const post = f.mock.calls.find(([, o]) => o?.method === 'POST')
    expect(JSON.parse(post[1].body)).toEqual({ confirm: 'מחק את הדף הישן' })
  })
})
