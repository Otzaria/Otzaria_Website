import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategoryModal from './CategoryModal'

const showAlertMock = vi.fn()
const showConfirmMock = vi.fn()

vi.mock('@/components/providers/DialogContext', () => ({
  useDialog: () => ({
    showAlert: showAlertMock,
    showConfirm: showConfirmMock
  })
}))

const pickerOptions = [
  { id: 'p1', name: 'תוסף ראשון', version: '1.0.0', status: 'stable', image: null },
  { id: 'p2', name: 'תוסף שני', version: '1.0.0', status: 'beta', image: null }
]

const existingCategory = {
  id: 'c1',
  name: 'כלי לימוד',
  slug: 'study-tools',
  description: '',
  icon: '',
  showOnHome: false,
  homeLimit: 6,
  sortMode: 'rating',
  manualTopCount: 0,
  isVisible: true,
  ghostCount: 0,
  plugins: [
    { id: 'p1', name: 'תוסף ראשון', status: 'stable', isApproved: true, isHidden: false, isSuspended: false, downloadCount: 3, image: null }
  ]
}

beforeEach(() => {
  showAlertMock.mockClear()
  showConfirmMock.mockReset()
  global.fetch = vi.fn()
})

describe('CategoryModal — create mode', () => {
  it('renders the "new category" heading and disables save until a valid name/slug is entered', async () => {
    const onClose = vi.fn()
    render(<CategoryModal category={null} pickerOptions={pickerOptions} onClose={onClose} onChanged={vi.fn()} />)

    expect(screen.getByText('קטגוריה חדשה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'צור קטגוריה' })).toBeDisabled()

    await userEvent.setup().type(screen.getByPlaceholderText('למשל: כלי לימוד'), 'study tools')
    expect(screen.getByRole('button', { name: 'צור קטגוריה' })).not.toBeDisabled()
  })

  it('calls onClose from the header close button and the footer close button', async () => {
    const onClose = vi.fn()
    render(<CategoryModal category={null} pickerOptions={pickerOptions} onClose={onClose} onChanged={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'סגור' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('creates a category and calls onChanged + onClose on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ category: { id: 'new1' } })
    })
    const onClose = vi.fn()
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(<CategoryModal category={null} pickerOptions={pickerOptions} onClose={onClose} onChanged={onChanged} />)

    await userEvent.setup().type(screen.getByPlaceholderText('למשל: כלי לימוד'), 'study tools')
    await userEvent.setup().click(screen.getByRole('button', { name: 'צור קטגוריה' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/plugin-categories',
      expect.objectContaining({ method: 'POST' })
    ))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(showAlertMock).toHaveBeenCalledWith('קטגוריה נוצרה', expect.stringContaining('study tools')))
  })
})

describe('CategoryModal — edit mode', () => {
  it('shows the assigned plugin and lets the user add another from the picker', async () => {
    render(<CategoryModal category={existingCategory} pickerOptions={pickerOptions} onClose={vi.fn()} onChanged={vi.fn()} />)

    expect(screen.getByText(`עריכת קטגוריה: ${existingCategory.name}`)).toBeInTheDocument()
    expect(screen.getByText('תוסף ראשון')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שמור שיבוץ' })).toBeDisabled()

    const input = screen.getByPlaceholderText('הוסף תוסף לקטגוריה — חיפוש לפי שם...')
    await userEvent.setup().click(input)
    await userEvent.setup().click(screen.getByText('תוסף שני'))

    expect(screen.getByText('תוסף שני')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שמור שיבוץ' })).not.toBeDisabled()
  })

  it('removes a plugin from the assignment list', async () => {
    render(<CategoryModal category={existingCategory} pickerOptions={pickerOptions} onClose={vi.fn()} onChanged={vi.fn()} />)

    await userEvent.setup().click(screen.getByTitle('הסר מהרשימה'))

    expect(screen.getByText('אין תוספים משובצים בקטגוריה זו')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'שמור שיבוץ' })).not.toBeDisabled()
  })

  it('saves the assignment list to the server and reports success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ category: { plugins: [] } })
    })
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(<CategoryModal category={existingCategory} pickerOptions={pickerOptions} onClose={vi.fn()} onChanged={onChanged} />)

    await userEvent.setup().click(screen.getByTitle('הסר מהרשימה'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'שמור שיבוץ' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/plugin-categories/c1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'setPlugins', pluginIds: [] })
      })
    ))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(showAlertMock).toHaveBeenCalledWith('נשמר', 'שיבוץ התוספים בקטגוריה נשמר בהצלחה'))
  })

  it('deletes the category after confirmation', async () => {
    showConfirmMock.mockResolvedValueOnce(true)
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    const onClose = vi.fn()
    const onChanged = vi.fn().mockResolvedValue(undefined)
    render(<CategoryModal category={existingCategory} pickerOptions={pickerOptions} onClose={onClose} onChanged={onChanged} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /מחק קטגוריה/ }))

    expect(showConfirmMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/admin/plugin-categories/c1', { method: 'DELETE' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('does not delete when the confirmation is declined', async () => {
    showConfirmMock.mockResolvedValueOnce(false)
    render(<CategoryModal category={existingCategory} pickerOptions={pickerOptions} onClose={vi.fn()} onChanged={vi.fn()} />)

    await userEvent.setup().click(screen.getByRole('button', { name: /מחק קטגוריה/ }))

    expect(showConfirmMock).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
