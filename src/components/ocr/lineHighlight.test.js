import { describe, expect, it } from 'vitest'
import { lineHighlightStyle } from './lineHighlight'

describe('lineHighlightStyle', () => {
  it('ממיר תיבה בפיקסלים לאחוזים, עם הצד הימני', () => {
    expect(lineHighlightStyle({ x: 100, y: 50, width: 200, height: 25 }, 1000, 500)).toEqual({
      right: '70%',
      top: '10%',
      width: '20%',
      height: '5%',
    })
  })

  it('בלי מידות או בלי תיבה — null', () => {
    expect(lineHighlightStyle({ x: 1, y: 1, width: 1, height: 1 }, 0, 500)).toBeNull()
    expect(lineHighlightStyle({ x: 1, y: 1, width: 1, height: 1 }, 1000, 0)).toBeNull()
    expect(lineHighlightStyle(null, 1000, 500)).toBeNull()
  })
})
