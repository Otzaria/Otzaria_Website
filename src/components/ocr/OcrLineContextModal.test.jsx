// חלון "העמוד המלא": מצב טעינה, שגיאה ו"נסה שוב"
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import OcrLineContextModal from './OcrLineContextModal'

const line = { id: 'l1', box: { x: 10, y: 20, width: 100, height: 10 }, imageWidth: 1000, imageHeight: 1500, bookName: 'ספר', pageNumber: 3 }

// jsdom בלי scrollIntoView (החלון גולל אל השורה המודגשת אחרי הטעינה)
Element.prototype.scrollIntoView ??= function scrollIntoView() {}

describe('OcrLineContextModal', () => {
  it('עד שהתמונה נטענת — "טוען את העמוד…" במקום שמור ביחס-הגובה של העמוד', () => {
    render(<OcrLineContextModal line={line} onClose={vi.fn()} />)
    expect(screen.getByRole('status', { name: 'טוען את העמוד…' })).toBeInTheDocument()
    const img = screen.getByAltText('עמוד מלא')
    expect(img.parentElement.style.aspectRatio).toBe('1000 / 1500')
    fireEvent.load(img)
    expect(screen.queryByRole('status', { name: 'טוען את העמוד…' })).not.toBeInTheDocument()
  })

  it('תמונה שנכשלה — הודעה ו"נסה שוב" שטוען מחדש את אותה כתובת', () => {
    render(<OcrLineContextModal line={line} onClose={vi.fn()} />)
    const src = screen.getByAltText('עמוד מלא').getAttribute('src')
    fireEvent.error(screen.getByAltText('עמוד מלא'))
    expect(screen.getByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את העמוד')
    expect(screen.queryByAltText('עמוד מלא')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByAltText('עמוד מלא').getAttribute('src')).toBe(src)
    expect(screen.getByRole('status', { name: 'טוען את העמוד…' })).toBeInTheDocument()
  })
})
