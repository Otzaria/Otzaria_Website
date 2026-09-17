import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DictaStatusBadge from './DictaStatusBadge'

describe('DictaStatusBadge', () => {
  it('מציג "פנוי" עבור available', () => {
    render(<DictaStatusBadge status="available" />)
    expect(screen.getByText('פנוי')).toBeInTheDocument()
  })

  it('מציג "בעריכה" עבור in-progress', () => {
    render(<DictaStatusBadge status="in-progress" />)
    expect(screen.getByText('בעריכה')).toBeInTheDocument()
  })

  it('מציג "הושלם" עבור completed', () => {
    render(<DictaStatusBadge status="completed" />)
    expect(screen.getByText('הושלם')).toBeInTheDocument()
  })

  it('מציג את הערך הגולמי עבור סטטוס לא מוכר', () => {
    render(<DictaStatusBadge status="mystery" />)
    expect(screen.getByText('mystery')).toBeInTheDocument()
  })
})
