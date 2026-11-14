import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// דף ההנחיות הציבורי של צורת הדף: הנוסח השמור (guideStore.loadGuide), ובלעדיו הנוסח המקורי (guideContent).
vi.mock('@/components/layout/OtzariaSoftwareHeader', () => ({ default: () => null }))
vi.mock('@/components/layout/OtzariaSoftwareFooter', () => ({ default: () => null }))
const { loadGuideMock } = vi.hoisted(() => ({ loadGuideMock: vi.fn() }))
vi.mock('@/lib/tzuratHadaf/guideStore', () => ({ loadGuide: loadGuideMock }))

import TzuratGuidePage, { metadata } from './page'
import { GUIDE_SECTIONS } from '@/components/tzuratHadaf/labels'

const show = async () => render(await TzuratGuidePage())

beforeEach(() => {
  loadGuideMock.mockReset().mockResolvedValue(null)
})

describe('דף ההנחיות של צורת הדף', { timeout: 20000 }, () => {
  it('כותרת, metadata, ותוכן הדף מהפרקים של הנוסח המקורי', async () => {
    expect(metadata.title).toMatch(/הנחיות לצורת הדף/)
    await show()
    expect(screen.getByRole('heading', { level: 1, name: 'הנחיות לצורת הדף' })).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: 'תוכן הדף' })
    expect(within(toc).getAllByRole('link').length).toBeGreaterThanOrEqual(3)
    // כל פרק שהממשק מקשר אליו קיים בנוסח המקורי
    for (const id of new Set(Object.values(GUIDE_SECTIONS))) expect(document.getElementById(id)).not.toBeNull()
    expect(screen.getByRole('link', { name: 'להשתתפות בבדיקה' })).toHaveAttribute('href', '/library/tzurat-hadaf')
  })

  it('נוסח שנשמר בניהול גובר על המקורי', async () => {
    loadGuideMock.mockResolvedValue({ html: '<section id="x"><h2>פרק מותאם</h2><p>שלום</p></section>' })
    await show()
    expect(screen.getByRole('heading', { level: 2, name: /פרק מותאם/ })).toBeInTheDocument()
  })
})
