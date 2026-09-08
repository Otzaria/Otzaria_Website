// בדיקות ל-OfflineUpdateDownload: מוודאות שקריאת ה-apiGet מציגה את מספר הגרסה בהצלחה,
// ושכשהשרת מחזיר תשובה שלילית מוצג מסר הנפילה (ללא זריקת שגיאה החוצה מהקומפוננטה).
import { describe, expect, test, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import OfflineUpdateDownload from './OfflineUpdateDownload'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OfflineUpdateDownload', () => {
  test('מציג את מספר הגרסה בהצלחה', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        version: 'v1.2.3',
        windows: { url: 'https://example.com/win.exe', size: 1000 },
        macos: { url: 'https://example.com/mac.zip', size: 2000 }
      })
    })

    render(<OfflineUpdateDownload repoUrl="https://github.com/org/repo" />)

    await waitFor(() => {
      expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument()
    })
  })

  test('מציג מסר נפילה כשהשרת מחזיר שגיאה', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to fetch releases' })
    })

    render(<OfflineUpdateDownload repoUrl="https://github.com/org/repo" />)

    await waitFor(() => {
      expect(screen.getByText(/לא הצלחנו לטעון את פרטי הגרסה/)).toBeInTheDocument()
    })
  })
})
