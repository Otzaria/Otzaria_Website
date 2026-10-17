import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LegalPage, { ForumContact, LegalHeading } from './LegalPage'

vi.mock('@/components/layout/OtzariaSoftwareHeader', () => ({ default: () => <header data-testid="site-header" /> }))
vi.mock('@/components/layout/OtzariaSoftwareFooter', () => ({ default: () => <footer data-testid="site-footer" /> }))

describe('LegalPage', () => {
  it('מעטפת ציבורית, h1 אחד, והפרקים בתוך section אחד ב-<main>', () => {
    render(<LegalPage title="מדיניות פרטיות"><p>פרק</p></LegalPage>)
    expect(screen.getByTestId('site-header')).toBeInTheDocument()
    expect(screen.getByTestId('site-footer')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('מדיניות פרטיות')
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
    expect(screen.getByText('פרק').closest('section')).not.toBeNull()
  })
})

describe('LegalHeading', () => {
  it('בלי אייקון — h2 טקסט בלבד', () => {
    render(<LegalHeading>מבוא</LegalHeading>)
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2.textContent).toBe('מבוא')
    expect(h2.className).not.toContain('flex')
  })

  it('עם אייקון — גליף לפני הטקסט', () => {
    render(<LegalHeading icon="gavel">תנאי הרישיון</LegalHeading>)
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2.firstElementChild).toHaveTextContent('gavel')
    expect(h2).toHaveTextContent('תנאי הרישיון')
  })
})

describe('ForumContact', () => {
  it('שאלה, קישור לפורום בחלון חדש, ותוכן נוסף', () => {
    render(<ForumContact question="יש לך שאלות?"><p>דוא״ל</p></ForumContact>)
    expect(screen.getByText('יש לך שאלות?')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /פנה אלינו בפורום אוצריא/ })
    expect(link).toHaveAttribute('href', '/forum')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('דוא״ל')).toBeInTheDocument()
  })
})
