import { describe, expect, it } from 'vitest'
import { splitVersion } from './downloadVersion'

describe('splitVersion', () => {
  it('מפריד את מספר הבנייה שאחרי +', () => {
    expect(splitVersion('0.9.98+801')).toEqual({ display: '0.9.98', build: '801' })
  })

  it('גרסה בלי מספר בנייה נשארת כמו שהיא', () => {
    expect(splitVersion('0.9.98')).toEqual({ display: '0.9.98', build: null })
  })

  it('מסיר v בתחילה ורווחים', () => {
    expect(splitVersion(' v1.2.3+4 ')).toEqual({ display: '1.2.3', build: '4' })
  })

  it('+ בסוף או בתחילה לא שובר את התצוגה', () => {
    expect(splitVersion('1.2.3+')).toEqual({ display: '1.2.3', build: null })
    expect(splitVersion('+5')).toEqual({ display: '+5', build: null })
  })

  it('ריק או חסר → null', () => {
    expect(splitVersion(undefined)).toBeNull()
    expect(splitVersion('  ')).toBeNull()
  })
})
