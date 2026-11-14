// סינון וקיבוץ הפקודות של ui/CommandPalette — לוגיקה טהורה (commandPaletteFilter.test.js).

import { normalizeHebrew } from '@/lib/hebrewSearchNormalize'

/**
 * @typedef {{ id: string, label: string, group?: string, keywords?: string[], shortcut?: string[],
 *   icon?: string, run: () => void, disabled?: boolean }} PaletteCommand
 */

/** טקסט החיפוש של פקודה: השם, הקבוצה ומילות מפתח — מנורמל (בלי ניקוד, אותיות סופיות, פיסוק) */
function haystack(command) {
  return normalizeHebrew([command.label, command.group, ...(command.keywords ?? [])].filter(Boolean).join(' '))
}

/**
 * מסנן לפי שאילתה: כל מילה בשאילתה צריכה להופיע (כתת-מחרוזת) בטקסט החיפוש.
 * הסדר נשמר, אבל פקודות ששמן מתחיל במילה הראשונה של השאילתה עולות לראש (בתוך הקבוצה שלהן).
 * שאילתה ריקה — כל הפקודות, בסדר המקורי.
 *
 * @param {PaletteCommand[]} commands
 * @param {string} query
 * @returns {PaletteCommand[]}
 */
export function filterCommands(commands, query) {
  const terms = normalizeHebrew(query).split(' ').filter(Boolean)
  if (terms.length === 0) return commands.slice()
  const scored = []
  commands.forEach((command, index) => {
    const text = haystack(command)
    if (!terms.every((term) => text.includes(term))) return
    const label = normalizeHebrew(command.label)
    const rank = label.startsWith(terms[0]) ? 0 : label.split(' ').some((w) => w.startsWith(terms[0])) ? 1 : 2
    scored.push({ command, index, rank })
  })
  scored.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return scored.map((s) => s.command)
}

/**
 * קיבוץ לפי group, בסדר ההופעה הראשונה של כל קבוצה ברשימה המקורית (כך שסדר הקבוצות
 * לא קופץ תוך כדי הקלדה). פקודה בלי group — בקבוצה ריקה ('').
 *
 * @param {PaletteCommand[]} filtered
 * @param {PaletteCommand[]} [all] — הרשימה המלאה, לסדר הקבוצות
 * @returns {{ group: string, commands: PaletteCommand[] }[]}
 */
export function groupCommands(filtered, all = filtered) {
  const order = []
  for (const command of all) {
    const group = command.group ?? ''
    if (!order.includes(group)) order.push(group)
  }
  const byGroup = new Map(order.map((group) => [group, []]))
  for (const command of filtered) {
    const group = command.group ?? ''
    if (!byGroup.has(group)) byGroup.set(group, [])
    byGroup.get(group).push(command)
  }
  return [...byGroup.entries()]
    .filter(([, commands]) => commands.length > 0)
    .map(([group, commands]) => ({ group, commands }))
}

/**
 * האינדקס הבא של פקודה זמינה (לא disabled) ברשימה השטוחה, בכיוון delta (1/-1), עם גלישה.
 * from = -1 — מתחילים מההתחלה (או מהסוף כש-delta=-1). אין זמינה — -1.
 *
 * @param {PaletteCommand[]} list
 * @param {number} from
 * @param {number} delta
 */
export function nextEnabledIndex(list, from, delta) {
  const n = list.length
  if (n === 0) return -1
  let i = from
  for (let step = 0; step < n; step++) {
    i = i === -1 ? (delta > 0 ? 0 : n - 1) : (i + delta + n) % n
    if (!list[i].disabled) return i
  }
  return -1
}
