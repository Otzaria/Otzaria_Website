import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PluginApproveModal from './PluginApproveModal'

const CATEGORIES = [
  { id: 'c1', name: 'כלי לימוד', icon: 'school', isVisible: true, plugins: [1, 2] },
  { id: 'c2', name: 'מוסתרת', icon: 'extension', isVisible: false, plugins: [] },
  { id: 'c3', name: 'תצוגה', icon: '', isVisible: true, plugins: [] }
]
const fetchSpy = vi.fn()

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

describe('PluginApproveModal (משמש את /library/admin/plugins)', () => {
  it('ui/Dialog "לאשר את התוסף?"; רק קטגוריות גלויות, כתיבות סימון עם תוויות', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(CATEGORIES) })
    render(<PluginApproveModal plugin={{ name: 'מילון' }} onClose={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'לאשר את התוסף?' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('טוען קטגוריות…')
    expect(await screen.findByRole('checkbox', { name: /כלי לימוד/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /תצוגה/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /מוסתרת/ })).toBeNull()
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/plugin-categories')
    // לפי המילון: שיבוץ (לא שיכון), והמפתח יודע שאושר
    expect(screen.getByText(/שיבוץ בקטגוריות/)).toBeInTheDocument()
    expect(screen.getByText(/המפתח יקבל הודעה במייל/)).toBeInTheDocument()
  })

  it('אישור מעביר את הבחירה (קטגוריות + נבחרים) ל-onConfirm; בזמן האישור Esc לא סוגר', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(CATEGORIES) })
    let resolveConfirm: () => void = () => {}
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolveConfirm = r }))
    const onClose = vi.fn()
    render(<PluginApproveModal plugin={{ name: 'מילון' }} onClose={onClose} onConfirm={onConfirm} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /כלי לימוד/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'הוסף לנבחרים בדף הבית' }))
    fireEvent.click(screen.getByRole('button', { name: 'אשר' }))
    expect(onConfirm).toHaveBeenCalledWith({ categoryIds: ['c1'], addToFeatured: true })
    expect(await screen.findByRole('button', { name: 'מאשר…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'ביטול' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    resolveConfirm()
    await waitFor(() => expect(screen.getByRole('button', { name: 'אשר' })).toBeEnabled())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('כשל בטעינת הקטגוריות — הודעה, ועדיין אפשר לאשר', async () => {
    fetchSpy.mockResolvedValue({ ok: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<PluginApproveModal plugin={{ name: 'מילון' }} onClose={() => {}} onConfirm={() => {}} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את הקטגוריות')
    expect(screen.getByRole('button', { name: 'אשר' })).toBeEnabled()
  })
})
