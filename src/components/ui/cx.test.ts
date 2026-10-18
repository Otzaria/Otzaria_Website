import { describe, it, expect } from 'vitest'
import { cx } from './cx'

describe('cx', () => {
  it('מחבר מחלקות ומדלג על ערכים ריקים', () => {
    expect(cx('a', false, null, undefined, 0, '', 'b')).toBe('a b')
  })
  it('מנקה רווחים בקצוות ולא מכפיל רווחים', () => {
    expect(cx('  a  ', '   ', 'b ')).toBe('a b')
  })
  it('בלי ערכים — מחרוזת ריקה', () => {
    expect(cx()).toBe('')
  })
})
