import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ScreenshotGallery from './ScreenshotGallery'

describe('ScreenshotGallery', () => {
  it('renders nothing when there are no screenshots', () => {
    const { container } = render(<ScreenshotGallery screenshots={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the lightbox on the clicked thumbnail and navigates with the keyboard', async () => {
    const user = userEvent.setup()
    render(<ScreenshotGallery screenshots={['/a.png', '/b.png', '/c.png']} />)

    // אין lightbox לפני קליק
    expect(screen.queryByLabelText('סגור')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'צילום מסך 2' }))
    // גם התמונה הממוזערת וגם תמונת ה-lightbox חולקות alt זהה — יש שתיים
    expect(screen.getAllByAltText('צילום מסך 2')).toHaveLength(2)
    // 2/3 מוצג בתחתית ה-lightbox (התמונה השנייה מתוך 3)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()

    // חץ שמאלה מקדם לתמונה הבאה (RTL: ArrowLeft = הבא)
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('3 / 3')).toBeInTheDocument()

    // Escape סוגר את ה-lightbox
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('סגור')).not.toBeInTheDocument()
  })

  it('wraps around from the last screenshot back to the first', async () => {
    const user = userEvent.setup()
    render(<ScreenshotGallery screenshots={['/a.png', '/b.png']} />)
    await user.click(screen.getByRole('button', { name: 'צילום מסך 2' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })
})
