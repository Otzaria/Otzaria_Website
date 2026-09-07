import { describe, it, expect } from 'vitest'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('returns the Error message when present', () => {
    expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('returns the fallback for a non-Error value', () => {
    expect(getErrorMessage('not an error', 'fallback')).toBe('fallback')
  })

  it('returns the fallback for an Error with an empty message', () => {
    expect(getErrorMessage(new Error(''), 'fallback')).toBe('fallback')
  })
})
