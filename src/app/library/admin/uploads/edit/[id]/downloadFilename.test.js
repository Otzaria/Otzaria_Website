import { describe, it, expect } from 'vitest'
import { getDownloadBaseName, buildDownloadFilename, buildAsciiFilename } from './downloadFilename'

describe('getDownloadBaseName', () => {
  it('returns the default name when no title is given', () => {
    expect(getDownloadBaseName()).toBe('edit-copy')
  })

  it('returns the default name for non-string input', () => {
    expect(getDownloadBaseName(null)).toBe('edit-copy')
    expect(getDownloadBaseName(42)).toBe('edit-copy')
  })

  it('returns the trimmed title when it has no slashes', () => {
    expect(getDownloadBaseName('  ספר בראשית  ')).toBe('ספר בראשית')
  })

  it('returns only the last path segment, ignoring trailing slashes', () => {
    expect(getDownloadBaseName('תנך/תורה/בראשית/')).toBe('בראשית')
  })

  it('falls back to the default name for a whitespace title', () => {
    expect(getDownloadBaseName('   ')).toBe('edit-copy')
  })
})

describe('buildDownloadFilename', () => {
  it('replaces characters that are illegal in file names', () => {
    expect(buildDownloadFilename('ספר: "א" ? ב\\ג')).toBe('ספר_ _א_ _ ב_ג.txt')
  })

  it('uses the default name when the title is missing', () => {
    expect(buildDownloadFilename(undefined)).toBe('edit-copy.txt')
  })
})

describe('buildAsciiFilename', () => {
  it('replaces non-ASCII characters', () => {
    expect(buildAsciiFilename('ספר.txt')).toBe('___.txt')
  })

  it('falls back to the default name when nothing is left', () => {
    expect(buildAsciiFilename('   ')).toBe('edit-copy.txt')
  })
})
