import { describe, it, expect } from 'vitest'
import { filterCommands, groupCommands, nextEnabledIndex } from './commandPaletteFilter'

const noop = () => {}
const COMMANDS = [
  { id: 'find', label: 'חיפוש והחלפה', group: 'עריכה', run: noop },
  { id: 'bold', label: 'הדגשה', group: 'עריכה', run: noop },
  { id: 'ocr', label: 'זיהוי טקסט לעמוד כולו', group: 'צילום', run: noop },
  { id: 'rotate', label: 'סיבוב', group: 'צילום', keywords: ['הטיה'], run: noop },
  { id: 'next', label: 'עמוד הבא', group: 'עמוד', run: noop, disabled: true },
  { id: 'finish', label: 'סיום עמוד', group: 'עמוד', run: noop }
]

describe('filterCommands', () => {
  it('שאילתה ריקה — הכול', () => {
    expect(filterCommands(COMMANDS, '  ').map((c) => c.id)).toEqual(COMMANDS.map((c) => c.id))
  })

  it('מתעלם מניקוד ומאותיות סופיות', () => {
    expect(filterCommands(COMMANDS, 'הַדְגָּשָׁה').map((c) => c.id)).toEqual(['bold'])
    expect(filterCommands(COMMANDS, 'עמוד').map((c) => c.id)).toContain('ocr')
  })

  it('כל המילים חייבות להופיע; מילות מפתח וקבוצה נספרות', () => {
    expect(filterCommands(COMMANDS, 'זיהוי כולו').map((c) => c.id)).toEqual(['ocr'])
    expect(filterCommands(COMMANDS, 'הטיה').map((c) => c.id)).toEqual(['rotate'])
    expect(filterCommands(COMMANDS, 'צילום').map((c) => c.id)).toEqual(['ocr', 'rotate'])
  })

  it('שם שמתחיל בשאילתה עולה לראש', () => {
    expect(filterCommands(COMMANDS, 'עמוד').map((c) => c.id)[0]).toBe('next')
  })
})

describe('groupCommands', () => {
  it('שומר על סדר הקבוצות המקורי ומשמיט קבוצות ריקות', () => {
    const groups = groupCommands(filterCommands(COMMANDS, 'סיום'), COMMANDS)
    expect(groups).toEqual([{ group: 'עמוד', commands: [COMMANDS[5]] }])
    expect(groupCommands(COMMANDS).map((g) => g.group)).toEqual(['עריכה', 'צילום', 'עמוד'])
  })
})

describe('nextEnabledIndex', () => {
  it('מדלג על פקודות מושבתות וגולש', () => {
    expect(nextEnabledIndex(COMMANDS, 3, 1)).toBe(5)
    expect(nextEnabledIndex(COMMANDS, 5, 1)).toBe(0)
    expect(nextEnabledIndex(COMMANDS, 0, -1)).toBe(5)
    expect(nextEnabledIndex(COMMANDS, -1, 1)).toBe(0)
    expect(nextEnabledIndex([], -1, 1)).toBe(-1)
    expect(nextEnabledIndex([{ ...COMMANDS[0], disabled: true }], -1, 1)).toBe(-1)
  })
})
