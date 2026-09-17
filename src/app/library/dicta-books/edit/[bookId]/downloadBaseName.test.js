import { describe, it, expect } from 'vitest'
import { getDownloadBaseName } from './downloadBaseName'

describe('getDownloadBaseName', () => {
  it('returns the default name when no title is given', () => {
    expect(getDownloadBaseName()).toBe('dicta-book')
  })

  it('returns the default name for non-string input', () => {
    expect(getDownloadBaseName(null)).toBe('dicta-book')
    expect(getDownloadBaseName(undefined)).toBe('dicta-book')
    expect(getDownloadBaseName(42)).toBe('dicta-book')
  })

  it('returns the trimmed title when it has no slashes', () => {
    expect(getDownloadBaseName('  ספר בראשית  ')).toBe('ספר בראשית')
  })

  it('returns only the last path segment when the title contains slashes', () => {
    expect(getDownloadBaseName('תנך/תורה/בראשית')).toBe('בראשית')
  })

  it('ignores trailing slashes when picking the last segment', () => {
    expect(getDownloadBaseName('תנך/תורה/בראשית/')).toBe('בראשית')
  })

  it('falls back to the default name for an empty/whitespace title', () => {
    expect(getDownloadBaseName('')).toBe('dicta-book')
    expect(getDownloadBaseName('   ')).toBe('dicta-book')
  })
})
