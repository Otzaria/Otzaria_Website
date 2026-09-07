import { describe, it, expect } from 'vitest'
import { formatFileSize } from './formatFileSize'

describe('formatFileSize', () => {
  it('formats sizes under 1KB in bytes', () => {
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats sizes under 1MB in KB with no decimals', () => {
    expect(formatFileSize(2048)).toBe('2 KB')
  })

  it('formats sizes of 1MB or more in MB with one decimal', () => {
    expect(formatFileSize(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })
})
