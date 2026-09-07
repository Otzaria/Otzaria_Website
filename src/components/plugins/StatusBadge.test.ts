import { describe, it, expect } from 'vitest'
import { statusBadgeClass } from './StatusBadge'

describe('statusBadgeClass', () => {
  it('returns the lightest primary tint for stable', () => {
    expect(statusBadgeClass('stable')).toBe('bg-primary/10 text-primary')
  })

  it('returns a medium primary tint for beta', () => {
    expect(statusBadgeClass('beta')).toBe('bg-primary/15 text-primary')
  })

  it('returns the strongest primary tint for experimental', () => {
    expect(statusBadgeClass('experimental')).toBe('bg-primary/20 text-primary')
  })

  it('falls back to the experimental tint for unknown statuses', () => {
    expect(statusBadgeClass('unknown-status')).toBe('bg-primary/20 text-primary')
  })
})
