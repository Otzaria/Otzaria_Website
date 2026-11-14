import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginMeta, { showsStatusBadge } from './PluginMeta'

describe('PluginMeta', () => {
  it('דירוג מקוצר, הורדות, וגרסה צמודה לתג הסטטוס (יחידה שלא נשברת)', () => {
    render(<PluginMeta plugin={{ version: '1.2.0', status: 'beta', downloadCount: 2473, ratingAvg: 4.6, ratingCount: 12 }} />)
    expect(screen.getByText('2,473')).toBeInTheDocument()
    expect(screen.getByText(/דירוג ממוצע 4.6/)).toHaveClass('sr-only')
    const version = screen.getByText('גרסה 1.2.0')
    const badge = screen.getByText('בטא')
    expect(version.parentElement).toBe(badge.parentElement)
    expect(version.parentElement?.className).toContain('whitespace-nowrap')
  })

  it('יציב — בלי תג; בלי מדרגים — בלי דירוג', () => {
    render(<PluginMeta plugin={{ version: '1.0.0', status: 'stable', downloadCount: 0, ratingCount: 0 }} />)
    expect(screen.queryByText('יציב')).toBeNull()
    expect(screen.queryByText(/דירוג ממוצע/)).toBeNull()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('showsStatusBadge', () => {
    expect(showsStatusBadge('stable')).toBe(false)
    expect(showsStatusBadge('experimental')).toBe(true)
    expect(showsStatusBadge(undefined)).toBe(false)
  })
})

describe('PluginMeta — תוסף שירות', () => {
  it('תג "דורש שירות חיצוני" רק כש-hasService', () => {
    const { rerender } = render(<PluginMeta plugin={{ version: '1.0.0', hasService: true }} />)
    expect(screen.getByText('דורש שירות חיצוני')).toBeInTheDocument()
    rerender(<PluginMeta plugin={{ version: '1.0.0' }} />)
    expect(screen.queryByText('דורש שירות חיצוני')).toBeNull()
  })
})
