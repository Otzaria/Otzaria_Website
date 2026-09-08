// בדיקות ל-OfflineUpdateDownloadClient: מוודאות שמספר הגרסה שמגיע כבר טעון
// (releases prop, נשלף בשרת ע"י OfflineUpdateDownload.jsx) מוצג בהצלחה,
// ושכש-releases הוא null (השרת נכשל בשליפה) מוצג מסר הנפילה.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import OfflineUpdateDownloadClient from './OfflineUpdateDownloadClient'

describe('OfflineUpdateDownloadClient', () => {
  test('מציג את מספר הגרסה בהצלחה', () => {
    render(
      <OfflineUpdateDownloadClient
        repoUrl="https://github.com/org/repo"
        releases={{
          version: 'v1.2.3',
          windows: { url: 'https://example.com/win.exe', size: 1000 },
          macos: { url: 'https://example.com/mac.zip', size: 2000 }
        }}
      />
    )

    expect(screen.getByText(/v1\.2\.3/)).toBeInTheDocument()
  })

  test('מציג מסר נפילה כש-releases הוא null', () => {
    render(<OfflineUpdateDownloadClient repoUrl="https://github.com/org/repo" releases={null} />)

    expect(screen.getByText(/לא הצלחנו לטעון את פרטי הגרסה/)).toBeInTheDocument()
  })
})
