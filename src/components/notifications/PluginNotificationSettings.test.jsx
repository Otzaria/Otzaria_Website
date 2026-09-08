// בדיקות ל-PluginNotificationSettings: מוודאות שהטעינה וההגדרה (apiGet/apiPut מ-api-utils)
// שולחות בקשה נכונה, שהמתג נטען לפי הערך שהתקבל, ושהמודאל נסגר רק אחרי שמירה מוצלחת.
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PluginNotificationSettings from './PluginNotificationSettings'

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PluginNotificationSettings', () => {
  test('טוען את ההגדרות ומציג את מצב המתג בהתאם', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, enabled: true })
    })

    render(<PluginNotificationSettings onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked()
    })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/plugin-notifications',
      expect.objectContaining({ method: 'GET' })
    )
  })

  test('שומר את ההגדרה עם PUT וסוגר את המודאל בהצלחה', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, enabled: false })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, enabled: true })
      })

    render(<PluginNotificationSettings onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    await userEvent.setup().click(screen.getByRole('checkbox'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'שמור' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    const [, options] = global.fetch.mock.calls[1]
    expect(options.method).toBe('PUT')
    expect(JSON.parse(options.body)).toEqual({ enabled: true })
  })

  test('לא סוגר את המודאל כשהשמירה נכשלת', async () => {
    const onClose = vi.fn()
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, enabled: false })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      })

    render(<PluginNotificationSettings onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('checkbox')).toBeInTheDocument())
    await userEvent.setup().click(screen.getByRole('button', { name: 'שמור' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'שמור' })).not.toBeDisabled())
    expect(onClose).not.toHaveBeenCalled()
  })
})
