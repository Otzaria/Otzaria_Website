// העמוד עצמו רק עוטף את המסך (src/components/admin/plugins/PluginsScreen — שם הטסטים של ההתנהגות):
// כאן — שהמסך מוצג, ושהשלד (גם של loading.jsx) הוא באותו מבנה: כותרת, ארבע הלשוניות והכרזת טעינה.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/components/admin/plugins/PluginsScreen', () => ({ default: () => <p>המסך</p> }))

import AdminPluginsPage from './page'
import Loading from './loading'

describe('/library/admin/plugins', () => {
  it('מציג את מסך התוספים', async () => {
    render(await AdminPluginsPage({ searchParams: Promise.resolve({ view: 'layout' }) }))
    expect(screen.getByText('המסך')).toBeInTheDocument()
  })

  it('שלד הטעינה: אותו שם מסך, ארבע התצוגות, והכרזה לקורא המסך', () => {
    render(<Loading />)
    expect(screen.getByRole('status')).toHaveTextContent('טוען את התוספים…')
    for (const label of ['תוספים', 'לאישור', 'בחנות', 'סידור החנות', 'תוספי שירות']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
