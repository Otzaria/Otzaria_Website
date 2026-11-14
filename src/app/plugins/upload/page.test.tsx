import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { zipSync, strToU8 } from 'fflate'

const push = vi.fn()
const showAlert = vi.fn()
const showMessage = vi.fn(() => Promise.resolve())

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/providers/DialogContext', () => ({ useDialog: () => ({ showAlert, showMessage }) }))

// page.tsx (Server Component): unstable_cache שקוף, ו-DB מדומה — רק שדה tags של התוספים הציבוריים
const findPlugins = vi.fn()
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => unknown) => fn }))
vi.mock('@/lib/db', () => ({ default: vi.fn(async () => {}) }))
vi.mock('@/models/Plugin', () => ({
  default: { find: (...args: unknown[]) => ({ select: (fields: string) => ({ lean: () => findPlugins(args, fields) }) }) }
}))

import UploadPluginPage from './UploadPluginPageClient'
import UploadPluginServerPage from './page'

const fetchSpy = vi.fn()

beforeEach(() => {
  push.mockReset(); showAlert.mockReset(); showMessage.mockClear(); fetchSpy.mockReset(); findPlugins.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

describe('/plugins/upload (מחובר — ה-proxy מפנה אורח להתחברות לפני העמוד)', () => {
  it('main#main-content יחיד, h1 אחד, פירורי לחם ושלבים ממוספרים (h2) בסדר המילוי', () => {
    const { container } = render(<UploadPluginPage />)
    expect(container.querySelectorAll('main#main-content')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'העלאת תוסף חדש' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'פירורי לחם' })).getByRole('link', { name: 'חנות התוספים' })).toHaveAttribute('href', '/plugins')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['קבצים', 'מידע בסיסי', 'תגיות'])
    expect(screen.getByText(/^מלא את הפרטים הבאים/)).toBeInTheDocument()
  })

  it('שדות החובה מסומנים ומחוברים לתוויות; כפתור ראשי אחד', () => {
    render(<UploadPluginPage />)
    expect(screen.getByLabelText(/קובץ תוסף/)).toBeRequired()
    expect(screen.getByLabelText(/צילומי מסך/)).toBeRequired()
    expect(screen.getByLabelText(/תמונת תוסף/)).not.toBeRequired()
    expect(screen.getByRole('textbox', { name: 'תיאור מלא' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('checkbox', { name: /אני מאשר קבלת דיווחים/ })).toBeRequired()
    const submit = screen.getByRole('button', { name: 'העלה תוסף' })
    expect(submit).toHaveAttribute('type', 'submit')
    expect(screen.getByRole('link', { name: 'ביטול' })).toHaveAttribute('href', '/plugins')
  })

  it('שליחה בלי קובץ: אותה הודעת שגיאה בחלון, גם ליד השדה, ובלי פנייה לשרת', async () => {
    const { container } = render(<UploadPluginPage />)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(showMessage).toHaveBeenCalledWith('שגיאה בהעלאת התוסף', 'חובה לצרף קובץ תוסף', undefined, {
      returnFocus: expect.any(Function)
    }))
    expect(fetchSpy).not.toHaveBeenCalled()
    const fileInput = screen.getByLabelText(/קובץ תוסף/)
    await waitFor(() => expect(fileInput).toHaveAttribute('aria-invalid', 'true'))
    expect(fileInput).toHaveAccessibleDescription(expect.stringContaining('חובה לצרף קובץ תוסף'))
    // בסגירת ההודעה הפוקוס עובר לשדה השגוי (useDialogA11y קורא ל-returnFocus), לא לכפתור השליחה
    const [, , , options] = showMessage.mock.calls[0] as unknown as [string, string, undefined, { returnFocus: () => HTMLElement | null }]
    expect(options.returnFocus()).toBe(fileInput)
  })

  it('קובץ בסיומת שגויה: הודעה (כמו קודם) + שגיאה ליד השדה, והשדה מתאפס', async () => {
    render(<UploadPluginPage />)
    const input = screen.getByLabelText(/קובץ תוסף/) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.zip')] } })
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('שגיאה', 'קובץ התוסף חייב להיות בפורמט .otzplugin'))
    expect(screen.getAllByText('קובץ התוסף חייב להיות בפורמט .otzplugin').length).toBeGreaterThan(0)
  })

  it('צילום מסך בפורמט לא נתמך — שגיאה ליד שדה צילומי המסך', async () => {
    render(<UploadPluginPage />)
    fireEvent.change(screen.getByLabelText(/צילומי מסך/), { target: { files: [new File(['x'], 'a.bmp', { type: 'image/bmp' })] } })
    expect(showAlert).toHaveBeenCalledWith('שגיאה', 'צילומי מסך חייבים להיות בפורמט PNG, JPEG, WEBP או GIF')
    await waitFor(() => expect(screen.getByLabelText(/צילומי מסך/)).toHaveAttribute('aria-invalid', 'true'))
  })

  it('קובץ תוסף שנגרר מאפשר שליחה גם כששדה הקובץ המקורי ריק', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({}) })
    const { container } = render(<UploadPluginPage tagPool={[]} />)
    const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify({
      id: 'com.example.plugin', name: 'בדיקה', author: 'מפתח', version: '1.0.0',
      description: 'תיאור קצר', stability: 'stable', minAppVersion: '99.0.0'
    })) })
    const file = new File([Uint8Array.from(bytes)], 'example.otzplugin')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(bytes).buffer })
    const input = screen.getByLabelText(/קובץ תוסף/) as HTMLInputElement
    fireEvent.drop(input.closest('[data-dragging]') ?? input.parentElement!, {
      dataTransfer: { files: [file], types: ['Files'] }
    })
    await screen.findByText('נבחר: example.otzplugin')
    expect(input.files).toHaveLength(0)
    expect(input.validity.valueMissing).toBe(false)

    fireEvent.change(screen.getByRole('textbox', { name: 'תיאור מלא' }), { target: { value: 'תיאור מלא' } })
    fireEvent.change(screen.getByLabelText(/צילומי מסך/), {
      target: { files: [new File(['image'], 'screen.png', { type: 'image/png' })] }
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /אני מאשר קבלת דיווחים/ }))
    fireEvent.click(screen.getByRole('button', { name: 'העלה תוסף' }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/plugins/upload', expect.objectContaining({ method: 'POST' })))
    const body = fetchSpy.mock.calls[0][1].body as FormData
    expect(body.get('pluginFile')).toBe(file)
  })

  it('תגיות: Enter מוסיף, בלי כפילויות, והסרה', () => {
    render(<UploadPluginPage />)
    const input = screen.getByRole('combobox', { name: /הוסף תגית/ })
    fireEvent.change(input, { target: { value: ' מילון ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'מילון' } })
    fireEvent.click(screen.getByRole('button', { name: 'הוסף' }))
    expect(screen.getAllByRole('button', { name: 'הסרת התגית מילון' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'הסרת התגית מילון' }))
    expect(screen.queryByRole('button', { name: 'הסרת התגית מילון' })).toBeNull()
  })

  it('מאגר התגיות נטען בשרת (רק שדה tags) ומוצע בשדה — בלי להוריד את /api/plugins', async () => {
    findPlugins.mockResolvedValue([{ tags: ['מילון', 'כלי עזר'] }, { tags: ['מילון'] }])
    render(await UploadPluginServerPage())
    expect(findPlugins).toHaveBeenCalledWith([expect.objectContaining({ isApproved: true, isHidden: false })], 'tags -_id')
    const input = screen.getByRole('combobox', { name: /הוסף תגית/ })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'מיל' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['מילון (2)'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('כישלון בשרת — השדה טוען את ההצעות בעצמו בפוקוס (fallback ל-/api/plugins)', async () => {
    findPlugins.mockRejectedValue(new Error('db down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchSpy.mockResolvedValue(new Response(JSON.stringify([{ tags: ['חיפוש'] }]), { status: 200 }))
    try {
      render(await UploadPluginServerPage())
      fireEvent.focus(screen.getByRole('combobox', { name: /הוסף תגית/ }))
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/plugins'))
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('/plugins/upload — "דורש שירות חיצוני"', () => {
  async function fillValidForm() {
    const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify({
      id: 'com.example.svc', name: 'שירות', author: 'מפתח', version: '1.0.0',
      description: 'תיאור קצר', stability: 'stable', minAppVersion: '99.0.0'
    })) })
    const file = new File([Uint8Array.from(bytes)], 'svc.otzplugin')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => Uint8Array.from(bytes).buffer })
    fireEvent.change(screen.getByLabelText(/קובץ תוסף/), { target: { files: [file] } })
    await screen.findByText('נבחר: svc.otzplugin')
    fireEvent.change(screen.getByRole('textbox', { name: 'תיאור מלא' }), { target: { value: 'תיאור מלא' } })
    fireEvent.change(screen.getByLabelText(/צילומי מסך/), {
      target: { files: [new File(['image'], 'screen.png', { type: 'image/png' })] }
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /אני מאשר קבלת דיווחים/ }))
  }

  it('התכונה כבויה — אין תיבה, והבקשה בלי requiresService; אחרי ההצלחה — לחנות', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ plugin: { id: 'p1' } }) })
    render(<UploadPluginPage />)
    expect(screen.queryByRole('checkbox', { name: /דורש שירות חיצוני/ })).toBeNull()
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'העלה תוסף' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/plugins'))
    expect((fetchSpy.mock.calls[0][1].body as FormData).has('requiresService')).toBe(false)
  })

  it('סימון התיבה שולח requiresService=true ומעביר לדף הגשת השירות', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ plugin: { id: 'abc', hasService: true }, serviceSubmissionUrl: '/plugins/abc/service' })
    })
    render(<UploadPluginPage serviceEnabled />)
    await fillValidForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /דורש שירות חיצוני/ }))
    fireEvent.click(screen.getByRole('button', { name: 'העלה תוסף' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/plugins/abc/service'))
    expect((fetchSpy.mock.calls[0][1].body as FormData).get('requiresService')).toBe('true')
    expect(showAlert).toHaveBeenCalledWith('הצלחה', expect.stringContaining('להשלים את הגשת השירות'))
  })

  it('תיבה גלויה אך לא סומנה — בלי requiresService', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ plugin: { id: 'p1' } }) })
    render(<UploadPluginPage serviceEnabled />)
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'העלה תוסף' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/plugins'))
    expect((fetchSpy.mock.calls[0][1].body as FormData).has('requiresService')).toBe(false)
  })

  it('דף השרת מעביר את מצב הדגל מ-SERVICE_PLUGINS_ENABLED', async () => {
    findPlugins.mockResolvedValue([])
    vi.stubEnv('SERVICE_PLUGINS_ENABLED', 'true')
    try {
      render(await UploadPluginServerPage())
      expect(screen.getByRole('checkbox', { name: /דורש שירות חיצוני/ })).not.toBeChecked()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
