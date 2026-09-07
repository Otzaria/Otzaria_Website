import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Breadcrumbs from './Breadcrumbs'

describe('Breadcrumbs', () => {
  it('links every item except the last, and separates them with the ‹ marker', () => {
    render(
      <Breadcrumbs
        className="nav-class"
        items={[
          { label: 'חנות התוספים', href: '/plugins' },
          { label: 'קטגוריה', href: '/plugins/category/x' },
          { label: 'שם התוסף' }
        ]}
      />
    )

    const storeLink = screen.getByRole('link', { name: 'חנות התוספים' })
    expect(storeLink).toHaveAttribute('href', '/plugins')
    const categoryLink = screen.getByRole('link', { name: 'קטגוריה' })
    expect(categoryLink).toHaveAttribute('href', '/plugins/category/x')

    // הפריט האחרון הוא העמוד הנוכחי — טקסט בלבד, לא קישור
    expect(screen.queryByRole('link', { name: 'שם התוסף' })).not.toBeInTheDocument()
    expect(screen.getByText('שם התוסף')).toBeInTheDocument()

    // שני מפרידים בין 3 פריטים
    expect(screen.getAllByText('‹')).toHaveLength(2)
  })

  it('renders no separator when there is only one item', () => {
    render(<Breadcrumbs className="nav-class" items={[{ label: 'חנות התוספים' }]} />)
    expect(screen.queryByText('‹')).not.toBeInTheDocument()
  })
})
