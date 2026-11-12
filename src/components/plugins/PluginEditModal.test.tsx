import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

let role = 'user'
const showAlert = vi.fn()
const showConfirm = vi.fn()
const showMessage = vi.fn(() => Promise.resolve())
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role } } }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert, showConfirm, showMessage }) }))

import PluginEditModal from './PluginEditModal'

const PLUGIN = {
  _id: 'p1', pluginUid: 'com.x.y', name: 'מילון', version: '1.0.0', shortDescription: 'קצר', description: 'מלא',
  status: 'beta', author: 'א', compatibleWith: '0.9.0', requiresNetwork: false, tags: ['תלמוד'], homepage: '',
  pluginFileName: 'dict.otzplugin', screenshots: []
}
const fetchSpy = vi.fn()

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
  role = 'user'
  fetchSpy.mockReset(); showMessage.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

describe('PluginEditModal (עמוד התוסף + /library/admin/plugins)', () => {
  it('יוצר: ui/Dialog "עריכת תוסף", אזורים עם כותרות, בלי שדות המטא הידניים', () => {
    render(<PluginEditModal plugin={PLUGIN} endpoint="/api/plugins/p1/edit" onClose={() => {}} onSuccess={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'עריכת תוסף' })).toHaveAccessibleDescription('מילון')
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['מידע בסיסי', 'תגיות', 'קבצים'])
    expect(screen.queryByRole('textbox', { name: /שם התוסף/ })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'תיאור מלא' })).toHaveValue('מלא')
    expect(screen.getByText(/קובץ נוכחי:/)).toHaveTextContent('dict.otzplugin')
  })

  it('מנהל: שדות עם תוויות גלויות (לא רק placeholder) ותיבת "דורש חיבור אינטרנט"', () => {
    role = 'admin'
    render(<PluginEditModal plugin={PLUGIN} endpoint="/x" onClose={() => {}} onSuccess={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'שם התוסף' })).toHaveValue('מילון')
    expect(screen.getByRole('textbox', { name: 'גרסה' })).toHaveAttribute('dir', 'ltr')
    expect(screen.getByRole('textbox', { name: 'אתר בית (אופציונלי)' })).not.toBeRequired()
    expect(screen.getByRole('combobox', { name: 'רמת יציבות' })).toHaveValue('beta')
    expect(screen.getByRole('checkbox', { name: 'התוסף דורש חיבור אינטרנט' })).not.toBeChecked()
  })

  it('שמירה: PUT ל-endpoint עם אותם שמות שדות; Esc לא סוגר בזמן השמירה', async () => {
    let resolveFetch: (v: unknown) => void = () => {}
    fetchSpy.mockReturnValue(new Promise((r) => { resolveFetch = r }))
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    render(<PluginEditModal plugin={PLUGIN} endpoint="/api/plugins/p1/edit" onClose={onClose} onSuccess={onSuccess} />)
    expect(screen.getByRole('button', { name: 'שמור שינויים' })).toHaveAttribute('form', 'plugin-edit-form')
    fireEvent.submit(document.getElementById('plugin-edit-form')!)
    expect(await screen.findByRole('button', { name: 'שומר...' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/api/plugins/p1/edit')
    expect(init.method).toBe('PUT')
    expect([...new Set([...(init.body as FormData).keys()])]).toEqual([
      'name', 'shortDescription', 'description', 'version', 'status', 'author', 'compatibleWith', 'requiresNetwork', 'tags', 'homepage'
    ])
    resolveFetch({ ok: true, json: () => Promise.resolve({ message: 'נשמר' }) })
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ message: 'נשמר' }))
  })

  it('תגיות: הוספה והסרה עם שם נגיש', () => {
    render(<PluginEditModal plugin={PLUGIN} endpoint="/x" onClose={() => {}} onSuccess={() => {}} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'הוסף תגית' }), { target: { value: 'מילון' } })
    fireEvent.click(screen.getByRole('button', { name: 'הוסף' }))
    expect(screen.getByRole('button', { name: 'הסרת התגית מילון' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'הסרת התגית תלמוד' }))
    expect(screen.queryByRole('button', { name: 'הסרת התגית תלמוד' })).toBeNull()
  })

  it('תגיות ישנות מנורמלות כבר בפתיחה (פסיקים, גרשיים, כפילויות), ונשלחות כך בשמירה', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ message: 'נשמר' }) })
    const legacy = { ...PLUGIN, tags: ['כלי עזר, גימטריא', 'תנ״ך', 'תנ"ך'] }
    render(<PluginEditModal plugin={legacy} endpoint="/x" onClose={() => {}} onSuccess={() => {}} />)
    for (const tag of ['כלי עזר', 'גימטריא', 'תנ"ך']) {
      expect(screen.getByRole('button', { name: `הסרת התגית ${tag}` })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button', { name: /^הסרת התגית/ })).toHaveLength(3)
    fireEvent.submit(document.getElementById('plugin-edit-form')!)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const [, init] = fetchSpy.mock.calls[0]
    expect(JSON.parse((init.body as FormData).get('tags') as string)).toEqual(['כלי עזר', 'גימטריא', 'תנ"ך'])
  })
})
