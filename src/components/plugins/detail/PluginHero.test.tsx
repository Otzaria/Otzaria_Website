import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginHero from './PluginHero'
import DetailSection from './DetailSection'
import PluginDetailSkeleton from './PluginDetailSkeleton'
import type { Plugin } from './types'

const plugin: Plugin = {
  id: 'p1',
  name: 'מרקר',
  shortDescription: 'סימון טקסט בספרים',
  description: 'תיאור ארוך',
  version: '1.2.0',
  status: 'beta',
  author: 'מפתח א',
  updatedAt: '2026-01-01',
  compatibleWith: '0.9.97',
  tags: [],
  image: '',
  screenshots: [],
  downloadUrl: '/api/plugins/p1/download',
  supportsDirectInstall: true,
  homepage: '',
  downloadCount: 10,
  ratingAvg: 4,
  ratingCount: 2
}

describe('PluginHero', () => {
  it('h1, תג סטטוס, תיאור קצר, פעולות ונתוני המפתח', () => {
    render(
      <PluginHero
        plugin={plugin}
        titleId="plugin-title"
        actions={<button type="button">הורדה</button>}
        secondaryActions={<button type="button">דיווח למפתח</button>}
      />
    )
    expect(screen.getByRole('heading', { level: 1, name: 'מרקר' })).toHaveAttribute('id', 'plugin-title')
    expect(screen.getByText('בטא')).toBeInTheDocument()
    expect(screen.getByText('סימון טקסט בספרים')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'הורדה' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'דיווח למפתח' })).toBeInTheDocument()
    expect(screen.getByText('הורדות')).toBeInTheDocument()
    // האייקון דקורטיבי — השם כתוב ב-h1
    expect(screen.getByRole('presentation', { hidden: true })).toHaveAttribute('alt', '')
  })

  it('שם ותיאור באנגלית: dir="auto" ויישור לימין', () => {
    render(<PluginHero plugin={{ ...plugin, name: 'Aramaic → Eng.', shortDescription: 'and optional examples.' }} titleId="t" actions={null} />)
    expect(screen.getByText('Aramaic → Eng.')).toHaveAttribute('dir', 'auto')
    const line = screen.getByText('and optional examples.')
    expect(line).toHaveAttribute('dir', 'auto')
    expect(line).toHaveClass('text-right')
  })

  it('media — עמודה שנייה מ-lg, אחרי נתוני המפתח ב-DOM (בנייד מתחתיהם)', () => {
    const { container } = render(<PluginHero plugin={plugin} titleId="t" actions={null} media={<div data-testid="media" />} />)
    const grid = container.firstElementChild as HTMLElement
    expect(grid.className).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]')
    const media = screen.getByTestId('media').parentElement as HTMLElement
    expect(media).toHaveClass('lg:col-start-2', 'lg:row-start-1')
    expect(container.querySelector('dl')?.compareDocumentPosition(media)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('תג מצב לתוסף מושהה ולגרסה ישנה', () => {
    render(<PluginHero plugin={{ ...plugin, isSuspended: true, isHistoricalVersion: true }} titleId="t" actions={null} />)
    expect(screen.getByText('מושהה')).toBeInTheDocument()
    expect(screen.getByText('גרסה ישנה')).toBeInTheDocument()
  })
})

describe('DetailSection', () => {
  it('section בעל שם עם h2', () => {
    render(<DetailSection id="s1" title="מידע כללי"><p>תוכן</p></DetailSection>)
    expect(screen.getByRole('region', { name: 'מידע כללי' })).toContainElement(screen.getByText('תוכן'))
    expect(screen.getByRole('heading', { level: 2, name: 'מידע כללי' })).toHaveAttribute('id', 's1')
  })
})

describe('PluginDetailSkeleton', () => {
  it('main#main-content יחיד עם הכרזת טעינה', () => {
    const { container } = render(<PluginDetailSkeleton />)
    expect(container.querySelectorAll('main#main-content')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('טוען פרטי תוסף…')
  })
})

describe('PluginHero — תוסף שירות', () => {
  it('תג "דורש שירות חיצוני" ליד השם', () => {
    render(<PluginHero plugin={{ ...plugin, hasService: true }} titleId="t" actions={null} />)
    expect(screen.getByText('דורש שירות חיצוני')).toBeInTheDocument()
  })
})
