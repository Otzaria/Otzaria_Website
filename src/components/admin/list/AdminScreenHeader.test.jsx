import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminScreenHeader from './AdminScreenHeader'

describe('AdminScreenHeader', () => {
  test('כותרת h1 (היחידה בעמוד) ותפריט ⋮ עם שם נגיש', () => {
    render(<AdminScreenHeader title="העלאות" description="הסבר" menuLabel="הגדרות ההעלאות" menuItems={[{ id: 'a', label: 'הגדרות מצבים', onSelect() {} }]} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'העלאות' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הגדרות ההעלאות' })).toHaveAttribute('aria-haspopup', 'menu')
  })
})
