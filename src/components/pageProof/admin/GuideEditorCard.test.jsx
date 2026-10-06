import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GuideEditorCard from './GuideEditorCard'
import { DEFAULT_GUIDE_HTML, guideCodes, renderGuide } from '@/lib/pageProof/guideContent'

// כרטיס "דף ההנחיות למתנדבים" בדף הניהול: טוען את הנוסח (השמור או המקורי), תצוגה מקדימה בלי לשמור, שמירה, "בטל
// שינויים" ו"חזרה לנוסח המקורי" (באישור). fetch והחלונות מדומים (showConfirm — בצורת callback, מאשר מיד).

const { showConfirm, showAlert } = vi.hoisted(() => ({ showConfirm: vi.fn(), showAlert: vi.fn() }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showConfirm, showAlert }) }))

const SAVED = '<section id="a"><h2>נוסח שמור</h2><p>[[כפתור:finish]]</p></section>'

function mockServer(saved = null) {
  let cur = saved
  const calls = []
  global.fetch = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ url, method, body })
    const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
    if (method === 'GET') return reply(200, { success: true, saved: cur ? { html: cur, byName: 'מנהלת', at: new Date().toISOString() } : null, default: DEFAULT_GUIDE_HTML, codes: guideCodes() })
    if (method === 'PUT' && body.preview) return reply(200, { success: true, preview: renderGuide(body.html) })
    if (method === 'PUT') {
      cur = body.html
      return reply(200, { success: true, html: cur, at: new Date().toISOString(), unknown: [] })
    }
    if (method === 'DELETE') {
      cur = null
      return reply(200, { success: true })
    }
    return reply(404, { success: false })
  })
  return calls
}

const area = () => screen.getByRole('textbox', { name: 'תוכן דף ההנחיות (HTML)' })

beforeEach(() => {
  vi.clearAllMocks()
  showConfirm.mockImplementation((_t, _m, onConfirm) => onConfirm())
})
afterEach(() => {
  delete global.fetch
})

describe('GuideEditorCard', { timeout: 20000 }, () => {
  it('בלי נוסח שמור — הנוסח המקורי בעורך; "שמור" ו"חזרה" כבויים עד שיש מה', async () => {
    mockServer()
    render(<GuideEditorCard />)
    await waitFor(() => expect(area()).toHaveValue(DEFAULT_GUIDE_HTML))
    expect(screen.getByText(/מוצג הנוסח המקורי/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שמור ועדכן את הדף' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'חזרה לנוסח המקורי' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'פתח את הדף' })).toHaveAttribute('href', '/docs/page-proof')
  })

  it('עריכה ← תצוגה מקדימה (בלי לשמור) ← שמירה; קוד נוסף במקום הסמן', async () => {
    const calls = mockServer()
    render(<GuideEditorCard />)
    await waitFor(() => expect(area()).toHaveValue(DEFAULT_GUIDE_HTML))
    fireEvent.change(area(), { target: { value: SAVED } })
    fireEvent.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }))
    const preview = await screen.findByRole('region', { name: 'תצוגה מקדימה' })
    expect(preview).toHaveTextContent('נוסח שמור')
    expect(calls.filter((c) => c.method === 'PUT' && !c.body.preview)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '[[איור:ריהוט]]' }))
    expect(area().value).toContain('[[איור:ריהוט]]')
    fireEvent.click(screen.getByRole('button', { name: 'שמור ועדכן את הדף' }))
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('נשמר', expect.stringContaining('דף ההנחיות עודכן')))
    expect(calls.find((c) => c.method === 'PUT' && !c.body.preview).body.html).toContain('נוסח שמור')
    await waitFor(() => expect(screen.getByText(/מוצג הנוסח שנשמר בידי מנהלת/)).toBeInTheDocument())
  })

  it('נוסח שמור ← "חזרה לנוסח המקורי" (באישור) מוחקת אותו', async () => {
    const calls = mockServer(SAVED)
    render(<GuideEditorCard />)
    await waitFor(() => expect(area()).toHaveValue(SAVED))
    fireEvent.click(screen.getByRole('button', { name: 'חזרה לנוסח המקורי' }))
    await waitFor(() => expect(area()).toHaveValue(DEFAULT_GUIDE_HTML))
    expect(showConfirm).toHaveBeenCalled()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true)
  })
})
