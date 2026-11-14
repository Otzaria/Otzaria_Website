// צורת הדף — רשת העמודים של מסכת: מה אפשר לעשות בכל עמוד, מונים לפי מצב, והעמודים שבידיכם. טהור.
// העמוד: {id, daf, dafKey, state, pendingCount, round, nonVilna} (CONTRACT: books/[slug]/pages).
import { PAGE_STATE_UI } from './labels'

export const DEFAULT_MAX_HELD = 5

export function maxHeldNote(maxHeld = DEFAULT_MAX_HELD) {
  return `אפשר להחזיק עד ${maxHeld} עמודים בבת אחת. הגישו או שחררו עמוד כדי לקחת חדש.`
}

/**
 * הפעולה בכרטיס העמוד: {kind:'claim'|'resume'|'view'|'none', disabled, reason}.
 * claim — "קח את העמוד" (מושבת כשמחזיקים כבר את המקסימום); resume — "המשך לבדוק"; view — צפייה בלבד.
 */
export function pageAction(state, heldCount = 0, maxHeld = DEFAULT_MAX_HELD) {
  switch (state) {
    case 'open':
      if (heldCount >= maxHeld) return { kind: 'claim', disabled: true, reason: maxHeldNote(maxHeld) }
      return { kind: 'claim', disabled: false, reason: '' }
    case 'mine':
      return { kind: 'resume', disabled: false, reason: '' }
    case 'taken':
      return { kind: 'none', disabled: true, reason: 'מתנדב אחר בודק את העמוד הזה כרגע.' }
    case 'submitted':
      return { kind: 'view', disabled: false, reason: 'העמוד הוגש וממתין לבדיקת מנהל.' }
    case 'approved':
    case 'done':
      return { kind: 'view', disabled: false, reason: 'העמוד כבר נבדק.' }
    default:
      return { kind: 'none', disabled: true, reason: 'העמוד אינו פתוח לבדיקה כרגע.' }
  }
}

/** מונים לפי מצב, בסדר של PAGE_STATE_UI (רק מצבים שיש בהם עמודים) */
export function stateCounts(pages) {
  const m = new Map()
  for (const p of pages || []) m.set(p.state, (m.get(p.state) || 0) + 1)
  return Object.keys(PAGE_STATE_UI)
    .filter((s) => m.has(s))
    .map((s) => ({ state: s, count: m.get(s) }))
}

/** העמודים שבידיכם: here — כרטיסי העמודים מהמסכת הזו, elsewhere — מזהים ממסכתות אחרות */
export function heldSplit(pages, held) {
  const ids = new Set(held || [])
  const here = (pages || []).filter((p) => ids.has(p.id) || p.state === 'mine')
  const hereIds = new Set(here.map((p) => p.id))
  const elsewhere = [...ids].filter((id) => !hereIds.has(id))
  return { here, elsewhere }
}

/** המסכת לבחירה: מה שבכתובת אם קיים, אחרת הראשונה לפי הסדר */
export function pickSlug(books, wanted) {
  const list = [...(books || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (wanted && list.some((b) => b.slug === wanted)) return wanted
  return list[0]?.slug || null
}
