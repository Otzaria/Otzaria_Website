// סריקת ערכי עיצוב קשיחים בקוד — לוגיקה טהורה (בלי קבצים, בלי process). הסקריפט
// scripts/check-admin-tokens.mjs קורא את הקבצים ומריץ את זה; כאן — רק טקסט נכנס וממצאים יוצאים,
// כדי שיהיה אפשר לבדוק ב-node:test (טסט תחת scripts/ לא נאסף אף פעם).
//
// מה נחשב "קשיח" (ראו src/app/styles/*.css — מקור האמת לטוקנים):
//   hex          — צבע hex / rgb() / hsl() בתוך מחרוזת.
//   raw-color    — צבע Tailwind גולמי (bg-gray-100, text-white…) — לא מתחלף בערכה כהה.
//   legacy-color — שם מסומן [מיושן] ב-colors.css (accent, surface-variant…) או רמפת מורשת
//                  (neutral-500, danger-100…) — שמורים רק כדי שעמודים ישנים לא יישברו.
//   old-scale    — הסולם הישן במקום התפקידים: text-sm/xs…, rounded-lg…, shadow-lg…, font-bold.
//   arbitrary    — ערך בסוגריים מרובעים (w-[380px]) שאינו var(--…) ואינו באחד מ-ARBITRARY_RULES.
//
// נסרקות רק מחרוזות (גרשיים, מירכאות, backtick) — לא הערות ולא שמות משתנים. מחרוזת במירכאות לא
// נמשכת מעבר לסוף השורה, כדי שקיצור עברי בטקסט JSX (ק"ב) לא "יבלע" את שאר הקובץ.

export const CATEGORIES = ['hex', 'raw-color', 'legacy-color', 'old-scale', 'arbitrary']

/** תוויות בעברית לדוח */
export const CATEGORY_LABELS = {
  hex: 'צבע hex / rgb',
  'raw-color': 'צבע Tailwind גולמי',
  'legacy-color': 'שם צבע מיושן / רמפת מורשת',
  'old-scale': 'סולם ישן (text-sm, rounded-lg, shadow-lg, font-bold)',
  arbitrary: 'ערך בסוגריים',
}

const COLOR_PREFIX = String.raw`(?:text|bg|border(?:-[xytrblse])?|ring(?:-offset)?|outline|from|via|to|fill|stroke|divide|placeholder|decoration|shadow|accent|caret)`
const TAILWIND_RAW = 'slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|rose'
const LEGACY_RAMPS = 'neutral-cool|neutral-warm|neutral|danger|success-alt|success|info-alt|info|warning-alt|warning-strong|warning|feature|aqua|pink'
const LEGACY_ALIASES = 'on-background|primary-container|accent|surface-variant|primary-dark|foreground|on-secondary'

const RAW_COLOR_RE = new RegExp(`^${COLOR_PREFIX}-(?:(?:${TAILWIND_RAW})-\\d{2,3}|black|white)(?:/\\d+)?$`)
const LEGACY_COLOR_RE = new RegExp(`^${COLOR_PREFIX}-(?:(?:${LEGACY_RAMPS})-\\d{2,3}|${LEGACY_ALIASES})(?:/\\d+)?$`)
/** הסולם הישן — לפי קידומת: הערכים שאינם תפקיד (text-body-sm, rounded-control, shadow-menu — תקינים) */
const OLD_SCALE = {
  text: new Set(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl']),
  rounded: new Set(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']),
  shadow: new Set(['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl']),
  font: new Set(['bold', 'extrabold', 'black']),
}
/** צד של rounded: rounded-t-lg, rounded-se-xl */
const ROUNDED_SIDES = new Set(['t', 'r', 'b', 'l', 's', 'e', 'tl', 'tr', 'bl', 'br', 'ss', 'se', 'es', 'ee'])

function isOldScale(cls) {
  const parts = cls.split('-')
  const values = OLD_SCALE[parts[0]]
  if (!values) return false
  if (parts.length === 2) return values.has(parts[1])
  return parts[0] === 'rounded' && parts.length === 3 && ROUNDED_SIDES.has(parts[1]) && values.has(parts[2])
}
const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g
const COLOR_FN_RE = /\b(?:rgba?|hsla?)\(/g

/**
 * המחרוזות שבקוד, עם מספר השורה שבה כל אחת מתחילה. מדלג על הערות // ו-/* *\/.
 * @param {string} source
 * @returns {{ text: string, line: number }[]}
 */
export function extractStrings(source) {
  const out = []
  let line = 1
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '\n') { line++; i++; continue }
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line++; i++ }
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = line
      let text = ''
      i++
      while (i < n && source[i] !== c) {
        if (source[i] === '\n') {
          if (c !== '`') break // מחרוזת רגילה לא חוצה שורה — כנראה טקסט JSX עם גרש
          line++
        }
        if (source[i] === '\\' && i + 1 < n) { text += source[i] + source[i + 1]; i += 2; continue }
        text += source[i]
        i++
      }
      if (source[i] === c) i++
      out.push({ text, line: start })
      continue
    }
    i++
  }
  return out
}

/** החלק שאחרי הווריאנטים (hover:, md:, data-[x]:…) — הנקודתיים האחרונים מחוץ לסוגריים; בלי ! ו-- בהתחלה */
export function baseClass(token) {
  let depth = 0
  let cut = -1
  for (let i = 0; i < token.length; i++) {
    const c = token[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth = Math.max(0, depth - 1)
    else if (c === ':' && depth === 0) cut = i
  }
  return token.slice(cut + 1).replace(/^[!-]+/, '').replace(/!$/, '')
}

/**
 * הקטגוריה של מחלקה אחת, או null כשהיא תקינה.
 * @param {string} token
 * @returns {string | null}
 */
export function classifyClass(token) {
  const cls = baseClass(token)
  if (!cls) return null
  if (RAW_COLOR_RE.test(cls)) return 'raw-color'
  if (LEGACY_COLOR_RE.test(cls)) return 'legacy-color'
  if (isOldScale(cls)) return 'old-scale'
  const bracket = cls.indexOf('-[')
  if (bracket !== -1 && cls.endsWith(']') && /^[a-z]/.test(cls)) {
    const value = cls.slice(bracket + 2, -1)
    if (!value.includes('var(--') && !allowedArbitrary(cls.slice(0, bracket), value)) return 'arbitrary'
  }
  return null
}

/** צבעי מערכת של מצב ניגודיות גבוהה (forced-colors) — אין להם טוקן, ואסור שיהיה */
const SYSTEM_COLORS = new Set(['Canvas', 'CanvasText', 'Highlight', 'HighlightText', 'ButtonFace', 'ButtonText', 'ButtonBorder', 'LinkText', 'VisitedText', 'ActiveText', 'GrayText', 'Field', 'FieldText', 'Mark', 'MarkText', 'SelectedItem', 'SelectedItemText', 'AccentColor', 'AccentColorText'])

/**
 * ערכים בסוגריים שאינם "ערך עיצוב קשיח" — אין ולא יהיה להם טוקן. כל כלל עם נימוק:
 *  - תבנית רשת (grid-cols-[…]): פריסה של מסך מסוים (קובצי *RowLayout.js), לא ערך שחוזר בין מסכים.
 *  - transition-[width]: רשימת מאפיינים להנפשה, לא ערך.
 *  - forced-colors:border-[CanvasText]: צבע מערכת במצב ניגודיות גבוהה.
 *  - יחסי להקשר — env(safe-area-…), %, em, lh, dvh/vh/vw: נגזר מהמסך / מהגופן / מההורה, לא מסולם.
 */
export const ARBITRARY_RULES = [
  { id: 'grid-template', reason: 'תבנית רשת של מסך — פריסה, לא ערך עיצוב', test: (prop) => prop === 'grid-cols' || prop === 'grid-rows' },
  { id: 'transition-property', reason: 'רשימת מאפיינים להנפשה', test: (prop, value) => prop === 'transition' && /^[a-z,_-]+$/.test(value) },
  { id: 'system-color', reason: 'צבע מערכת של forced-colors', test: (prop, value) => SYSTEM_COLORS.has(value) },
  { id: 'relative', reason: 'יחסי להקשר (אזור בטוח, אחוז, em, גובה שורה, אשנב)', test: (prop, value) => /env\(|\d(?:%|em\b|lh\b|[dsl]?v[hw]\b)/.test(value) },
]

/** האם ערך בסוגריים מותר לפי ARBITRARY_RULES. prop — מה שלפני "-[" (w, grid-cols, max-h…) */
export function allowedArbitrary(prop, value) {
  return ARBITRARY_RULES.some((rule) => rule.test(prop, value))
}

/**
 * כל הממצאים בקובץ אחד.
 * @param {string} source
 * @returns {{ category: string, token: string, line: number }[]}
 */
export function auditSource(source) {
  const findings = []
  for (const { text, line } of extractStrings(source || '')) {
    const lines = text.split('\n')
    lines.forEach((part, offset) => {
      const at = line + offset
      for (const m of part.matchAll(HEX_RE)) findings.push({ category: 'hex', token: m[0], line: at })
      for (const m of part.matchAll(COLOR_FN_RE)) findings.push({ category: 'hex', token: m[0], line: at })
      for (const token of part.split(/[\s"'`{}$]+/)) {
        const category = token ? classifyClass(token) : null
        if (category) findings.push({ category, token, line: at })
      }
    })
  }
  return findings
}

/**
 * האם ממצא חריג. חריגה: { path, reason, categories?, tokens? } — path הוא קובץ או תיקייה (מסתיים ב-/);
 * בלי categories — כל הקטגוריות; tokens — רק המחלקות האלה בדיוק (חריגה נקודתית, כדי שערך קשיח חדש
 * באותו קובץ עדיין ייתפס).
 * @param {string} file נתיב יחסי עם /
 * @param {string | { category: string, token?: string }} finding ממצא, או רק קטגוריה
 * @param {{ path: string, reason: string, categories?: string[], tokens?: string[] }[]} exceptions
 */
export function findException(file, finding, exceptions) {
  const { category, token } = typeof finding === 'string' ? { category: finding, token: undefined } : finding
  return (exceptions || []).find((ex) => {
    const matches = ex.path.endsWith('/') ? file.startsWith(ex.path) : file === ex.path
    return matches
      && (!ex.categories || ex.categories.includes(category))
      && (!ex.tokens || ex.tokens.includes(token))
  }) || null
}

/**
 * סיכום לכל הקבצים: ספירה לפי קטגוריה, לפי קובץ, ומה נפל בחריגות.
 * @param {{ file: string, findings: { category: string }[] }[]} results
 * @param {{ path: string, reason: string, categories?: string[] }[]} exceptions
 */
export function summarize(results, exceptions = []) {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  const excusedByCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
  const byFile = new Map()
  let total = 0
  let excused = 0
  for (const { file, findings } of results) {
    for (const f of findings) {
      if (findException(file, f, exceptions)) {
        excused++
        excusedByCategory[f.category]++
        continue
      }
      total++
      byCategory[f.category]++
      byFile.set(file, (byFile.get(file) || 0) + 1)
    }
  }
  const files = [...byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([file, count]) => ({ file, count }))
  return { total, excused, byCategory, excusedByCategory, files }
}
