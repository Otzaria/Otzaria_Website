import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Chip from './Chip'

describe('Chip', () => {
  it('מציג את התווית והערך', () => {
    render(<Chip label="סה״כ" value={5} />)
    expect(screen.getByText('סה״כ: 5')).toBeInTheDocument()
  })

  it('מיישם tone מותאם אישית כמחלקת CSS', () => {
    render(<Chip label="שגיאות" value={2} tone="bg-danger-100 text-danger-700" />)
    expect(screen.getByText('שגיאות: 2')).toHaveClass('bg-danger-100', 'text-danger-700')
  })
})
