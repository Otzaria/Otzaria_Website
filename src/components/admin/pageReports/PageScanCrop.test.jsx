// האזור המדווח בצילום: רק החלק החתוך, סימון המילים, לחיצה → הצילום המלא; בלי אזור/כתובת/תמונה — כלום.
import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PageScanCrop from './PageScanCrop'
import { cropLayout, FALLBACK_ASPECT } from './pageScanCropLayout'

const URL = '/uploads/books/sefer/page.2.jpg'
const CROP = { x: 0.1, y: 0.2, w: 0.8, h: 0.05, source: 'layout', level: 'word', mark: { x: 0.4, y: 0.21, w: 0.1, h: 0.03 } }

describe('cropLayout', () => {
  test('התמונה מוגדלת ומוזזת כך שהאזור ממלא את המסגרת; יחס לפי הגודל הטבעי', () => {
    const l = cropLayout(CROP, { w: 1000, h: 1600 })
    expect(l.aspect).toBe(10) // (0.8×1000)/(0.05×1600)
    expect(l.image).toEqual({ width: '125%', height: '2000%', left: '-12.5%', top: '-400%' })
    expect(l.mark).toEqual({ left: '37.5%', top: '20%', width: '12.5%', height: '60%' })
  })
  test('לפני הטעינה — יחס משוער; בלי סימון → mark null', () => {
    expect(cropLayout({ ...CROP, mark: null }, null)).toMatchObject({ aspect: FALLBACK_ASPECT, mark: null })
  })
})

describe('PageScanCrop', () => {
  test('בלי אזור, אזור פגום או בלי כתובת — לא מוצג דבר', () => {
    const { container, rerender } = render(<PageScanCrop imageUrl={URL} cropRect={null} alt="ספר, עמוד 2" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<PageScanCrop imageUrl={URL} cropRect={{ ...CROP, w: 3 }} alt="ספר, עמוד 2" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<PageScanCrop imageUrl={null} cropRect={CROP} alt="ספר, עמוד 2" />)
    expect(container).toBeEmptyDOMElement()
  })

  test('מציג את האזור עם סימון; אחרי הטעינה — יחס המסגרת לפי התמונה', () => {
    render(<PageScanCrop imageUrl={URL} cropRect={CROP} alt="ספר, עמוד 2" />)
    const img = screen.getByAltText('האזור המדווח בצילום — ספר, עמוד 2')
    expect(img).toHaveStyle({ left: '-12.5%', top: '-400%' })
    expect(screen.getByTestId('scan-crop-mark')).toBeInTheDocument()
    Object.defineProperty(img, 'naturalWidth', { value: 1000 })
    Object.defineProperty(img, 'naturalHeight', { value: 1600 })
    fireEvent.load(img)
    expect(screen.getByTestId('scan-crop-frame').style.aspectRatio).toMatch(/^10( \/ 1)?$/)
    expect(screen.getByTestId('scan-crop-frame')).toHaveAttribute('dir', 'ltr')
  })

  test('לחיצה פותחת את הצילום המלא', async () => {
    render(<PageScanCrop imageUrl={URL} cropRect={CROP} alt="ספר, עמוד 2" />)
    await userEvent.click(screen.getByRole('button', { name: 'הצג את צילום העמוד המלא — ספר, עמוד 2' }))
    expect(screen.getByAltText('צילום העמוד — ספר, עמוד 2')).toHaveAttribute('src', URL)
  })

  test('התמונה לא נטענה — הרכיב נעלם', () => {
    const { container } = render(<PageScanCrop imageUrl={URL} cropRect={CROP} alt="ספר, עמוד 2" />)
    fireEvent.error(screen.getByRole('img'))
    expect(container).toBeEmptyDOMElement()
  })
})
