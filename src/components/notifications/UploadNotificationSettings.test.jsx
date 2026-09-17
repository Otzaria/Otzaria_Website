// בדיקות ל-UploadNotificationSettings: מוודאות שהטעינה וההגדרה (apiGet/apiPut מ-api-utils)
// שולחות בקשה נכונה, שההגדרות נטענות למצב המתגים, ושהמודאל נסגר רק אחרי שמירה מוצלחת.
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UploadNotificationSettings from './UploadNotificationSettings'

const initialSettings = { enabled: true, dicta: true, fullBook: false, singlePage: false }

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UploadNotificationSettings', () => {
  test('טוען את ההגדרות ומציג את מצב המתגים בהתאם', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, notifications: initialSettings })
    })

    render(<UploadNotificationSettings onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/upload-notifications',
      expect.objectContaining({ method: 'GET' })
    )
  })

  test('שומר את ההגדרות עם PUT וסוגר את המודאל בהצלחה', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, notifications: initialSettings })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, notifications: { ...initialSettings, fullBook: true } })
      })

    render(<UploadNotificationSettings onClose={onClose} />)

    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))
    await userEvent.setup().click(screen.getByRole('button', { name: 'שמור' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual(initialSettings)
  })

  test('לא סוגר את המודאל כשהשמירה נכשלת', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, notifications: initialSettings })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      })

    render(<UploadNotificationSettings onClose={onClose} />)

    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0))
    await userEvent.setup().click(screen.getByRole('button', { name: 'שמור' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'שמור' })).not.toBeDisabled())
    expect(onClose).not.toHaveBeenCalled()
  })
})
