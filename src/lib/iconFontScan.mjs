/**
 * iconFontScan.mjs — איתור שמות אייקוני Material Symbols שבשימוש בקוד (לוגיקה טהורה).
 *
 * משמש את scripts/build-icon-font.mjs (בניית ה-subset ובדיקת --check).
 *
 * למה לא סריקה של "כל token בקוד": היא אספה כ-470 שמות, ובהם function, class, map,
 * try, image ו-height. אלה מילים בקוד שבמקרה הן גם שמות של אייקונים. מעל כ-4,096
 * תווים בפרמטר icon_names, Google Fonts מתעלם מה-subset ומחזיר בשקט את הגופן המלא
 * (316KB במקום כ-35KB). לכן אוספים רק מחרוזות שמופיעות בהקשר של אייקון:
 *
 *  1. תוכן של אלמנט עם המחלקה material-symbols-outlined: טקסט (`>close<`) או כל
 *     מחרוזת בביטוי הילד (`{open ? 'expand_less' : 'expand_more'}`).
 *  2. ה-prop name של <AppIcon>.
 *  3. ביטוי שמוצב בשם שמכיל "icon" (בכל רישיות): `icon: 'x'`, `icon="x"`,
 *     `iconEnd={a ? 'x' : 'y'}`, `icon = 'help'` (ברירת מחדל), `PAGE_ICONS = {...}`,
 *     `const getIcon = () => {...}`.
 *  4. גוף של פונקציה שבשמה "icon" (`function getSortIcon() {...}`), וארגומנטים של
 *     קריאה לפונקציה כזו (`icon('edit')`).
 *
 * מחרוזת נחשבת לשם אייקון רק אם היא כולה בצורה [a-z][a-z0-9_]*. הסינון מול רשימת
 * השמות התקפים של Material Symbols נעשה בסקריפט (filterKnown), כי הרשימה מגיעה מהרשת.
 */

const NAME_RE = /^[a-z][a-z0-9_]*$/

/**
 * מחליף הערות ברווחים (באותו אורך, כדי שהאינדקסים יישארו), כך ש-`icon: 'x'` בהערה
 * לא ייאסף. מחרוזות נשארות כמות שהן.
 */
export function maskComments(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const lit = skipLiteral(text, i)
    if (!lit) {
      out += text[i++]
      continue
    }
    const chunk = text.slice(i, lit.end)
    out += lit.value === undefined ? chunk.replace(/[^\n]/g, ' ') : chunk
    i = lit.end
  }
  return out
}

/** תווי פתיחה/סגירה לאיזון סוגריים */
const OPEN = { '(': ')', '[': ']', '{': '}' }
const CLOSE = new Set([')', ']', '}'])

/**
 * מדלג על מחרוזת או הערה שמתחילה ב-i. מחזיר את האינדקס שאחריה, או -1 אם אין שם כזו.
 * כשהיא מחרוזת, מחזיר גם את תוכנה (בלי המרכאות).
 */
function skipLiteral(text, i) {
  const ch = text[i]
  if (ch === '/' && text[i + 1] === '/') {
    const end = text.indexOf('\n', i)
    return { end: end === -1 ? text.length : end }
  }
  if (ch === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2)
    return { end: end === -1 ? text.length : end + 2 }
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    let j = i + 1
    while (j < text.length && text[j] !== ch) {
      if (text[j] === '\\') j++
      // מחרוזת רגילה אינה חוצה שורה; אם כן — זה גרש בתוך טקסט JSX, לא מחרוזת
      else if (text[j] === '\n' && ch !== '`') return { end: i + 1 }
      j++
    }
    return { end: j + 1, value: text.slice(i + 1, j) }
  }
  return null
}

/**
 * אוסף את כל המחרוזות בביטוי שמתחיל ב-start, עד סוף הביטוי: פסיק, נקודה-פסיק או
 * ירידת שורה ברמה העליונה, או סוגר שסוגר את מה שנפתח לפני הביטוי.
 * מחזיר את המחרוזות ואת אינדקס הסוף.
 */
export function stringsInExpression(text, start) {
  const values = []
  const stack = []
  let i = start
  // דילוג על רווחים בתחילת הביטוי — ירידת שורה כאן אינה סוף הביטוי
  while (i < text.length && /\s/.test(text[i])) i++
  while (i < text.length) {
    const ch = text[i]
    const lit = skipLiteral(text, i)
    if (lit) {
      if (lit.value !== undefined) values.push(lit.value)
      i = lit.end
      continue
    }
    if (OPEN[ch]) {
      stack.push(OPEN[ch])
      i++
      continue
    }
    if (CLOSE.has(ch)) {
      if (stack.length === 0) break
      stack.pop()
      i++
      // סוף בלוק ברמה העליונה (`() => {...}` או `{...}`) — הביטוי נגמר אם אחריו אין המשך
      continue
    }
    if (stack.length === 0) {
      if (ch === ',' || ch === ';') break
      // ירידת שורה מסיימת את הביטוי, אלא אם הוא ממשיך בשורה הבאה (טרנרי, ||, ??)
      if (ch === '\n' && !continuesOnNextLine(text, i)) break
      // `>` של סוף תגית JSX (icon="x">) — לא חלק מהביטוי, אבל `=>` כן
      if (ch === '>' && text[i - 1] !== '=') break
      // מאפיין JSX הבא אחרי מחרוזת: icon="x" title="y"
      if (/\s/.test(ch) && /^\s+[A-Za-z_$][\w$-]*=/.test(text.slice(i, i + 64)) && values.length > 0) break
    }
    i++
  }
  return { values, end: i }
}

/** האם הביטוי שנקטע בירידת השורה ב-i ממשיך בשורה הבאה (אופרטור בסוף השורה או בתחילת הבאה). */
function continuesOnNextLine(text, i) {
  const next = text.slice(i).match(/^\s*(\S)/)?.[1]
  const prev = text.slice(0, i).match(/(\S)\s*$/)?.[1]
  return (next !== undefined && '?:|&.+'.includes(next)) || (prev !== undefined && '?:|&=+('.includes(prev))
}

/** מחזיר את האינדקס שאחרי `>` שסוגר את תגית הפתיחה שמכילה את from (עם איזון {} ומחרוזות). */
function endOfOpeningTag(text, from) {
  let depth = 0
  let i = from
  while (i < text.length) {
    const lit = skipLiteral(text, i)
    if (lit && depth > 0) {
      i = lit.end
      continue
    }
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (depth === 0 && ch === '>') return text[i - 1] === '/' ? -1 : i + 1
    else if (depth === 0 && ch === '<') return -1
    i++
  }
  return -1
}

/** השמות בתוכן של אלמנט אייקון: טקסט ישיר או מחרוזות בביטוי {…}. */
function namesInIconElement(text, contentStart) {
  const rest = text.slice(contentStart)
  const plain = rest.match(/^\s*([a-z][a-z0-9_]*)\s*</)
  if (plain) return [plain[1]]
  const expr = rest.match(/^\s*\{/)
  if (!expr) return []
  return stringsInExpression(text, contentStart + expr[0].length).values
}

/** מקום שבו "icon" הוא חלק משם מזהה: אחריו בא ביטוי שנאסף. */
const ICON_IDENT_RE = /["']?([A-Za-z_$][\w$]*)["']?\s*(\??:(?!:)|=(?![=>])|\()/g

/**
 * כל שמות האייקונים (המועמדים) בקובץ אחד, לפי ההקשרים שבראש הקובץ.
 * @param {string} text תוכן הקובץ
 * @returns {Set<string>}
 */
export function iconNamesInSource(source) {
  const text = maskComments(source)
  const found = new Set()
  const add = (values) => {
    for (const v of values) if (NAME_RE.test(v)) found.add(v)
  }

  // 1. אלמנט עם המחלקה material-symbols-outlined
  for (const m of text.matchAll(/material-symbols-outlined/g)) {
    const tagStart = text.lastIndexOf('<', m.index)
    if (tagStart === -1) continue
    const contentStart = endOfOpeningTag(text, tagStart + 1)
    if (contentStart !== -1) add(namesInIconElement(text, contentStart))
  }

  // 2. <AppIcon name="x" /> / name={...}
  for (const m of text.matchAll(/<AppIcon\b/g)) {
    const tagEnd = endOfOpeningTag(text, m.index + 1)
    const tag = text.slice(m.index, tagEnd === -1 ? text.indexOf('>', m.index) + 1 : tagEnd)
    const name = tag.match(/\bname=(["'])([^"']*)\1/)
    if (name) add([name[2]])
    const expr = tag.match(/\bname=\{/)
    if (expr) add(stringsInExpression(tag, expr.index + expr[0].length).values)
  }

  // 3+4. מזהה שמכיל "icon": השמה, מאפיין, prop, פונקציה וקריאה לפונקציה
  for (const m of text.matchAll(ICON_IDENT_RE)) {
    if (!/icon/i.test(m[1])) continue
    const after = m.index + m[0].length
    if (m[2] === '(') {
      // הגדרת פונקציה: function getIcon(x) {…} — הגוף; קריאה: icon('x') — הארגומנטים
      const isDecl = /\bfunction\s+$/.test(text.slice(Math.max(0, m.index - 16), m.index))
      const args = stringsInExpression(text, after)
      if (!isDecl) {
        add(args.values)
        continue
      }
      const bodyStart = text.indexOf('{', args.end)
      if (bodyStart !== -1) add(stringsInExpression(text, bodyStart).values)
      continue
    }
    if (m[2] === '=' && text[after] === '{') {
      // icon={…} ב-JSX
      add(stringsInExpression(text, after + 1).values)
      continue
    }
    add(stringsInExpression(text, after).values)
  }

  // 5. פרמטר מיקומי בשם icon: `const toolButton = (tool, icon, label) => …` —
  //    בכל קריאה toolButton('x', 'format_size', '…') נאסף הארגומנט שבמקום של icon.
  for (const { fn, index } of positionalIconParams(text)) {
    const callRe = new RegExp(`(?<![\\w$.])${fn.replace(/\$/g, '\\$')}\\s*\\(`, 'g')
    for (const call of text.matchAll(callRe)) {
      const arg = nthArgument(text, call.index + call[0].length, index)
      if (arg) add(arg)
    }
  }

  return found
}

/** פונקציות שאחד הפרמטרים שלהן (לפי מיקום) נקרא icon/…Icon. */
function positionalIconParams(text) {
  const out = []
  const re = /(?:\bfunction\s+([A-Za-z_$][\w$]*)\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async )?\()([^()]*)\)/g
  for (const m of text.matchAll(re)) {
    const fn = m[1] || m[2]
    const params = m[3].split(',').map((p) => p.trim().replace(/\s*=.*$/, ''))
    const index = params.findIndex((p) => /^[A-Za-z_$][\w$]*$/.test(p) && /icon/i.test(p))
    if (index !== -1) out.push({ fn, index })
  }
  return out
}

/** המחרוזות בארגומנט ה-n של קריאה שמתחילה ב-start (אחרי הסוגר הפותח). */
function nthArgument(text, start, n) {
  let i = start
  for (let k = 0; k <= n; k++) {
    const { values, end } = stringsInExpression(text, i)
    if (k === n) return values
    if (text[end] !== ',') return null
    i = end + 1
  }
  return null
}

/**
 * מאחד את השמות מכל הקבצים, ושומר לכל שם את הקובץ הראשון שבו נמצא.
 * @param {{ file: string, text: string }[]} contents
 * @returns {Map<string, string>} שם → קובץ
 */
export function collectIconNames(contents) {
  const found = new Map()
  for (const { file, text } of contents) {
    for (const name of iconNamesInSource(text)) {
      if (!found.has(name)) found.set(name, file)
    }
  }
  return found
}

/**
 * מפצל את השמות לפי רשימת השמות התקפים של Material Symbols.
 * @param {Iterable<string>} names
 * @param {Set<string>} universe
 */
export function filterKnown(names, universe) {
  const known = []
  const unknown = []
  for (const name of names) (universe.has(name) ? known : unknown).push(name)
  return { known: known.sort(), unknown: unknown.sort() }
}

/**
 * Google Fonts מתעלם מ-icon_names כשהערך ארוך מ-4,096 תווים, ומחזיר את הגופן המלא
 * (נמדד: 4,094 תווים — subset; 4,098 — הגופן המלא, בלי קשר למספר השמות).
 */
export const ICON_NAMES_MAX_CHARS = 4096

/** אורך הערך של icon_names (שמות ממוינים מופרדים בפסיק). */
export function iconNamesParamLength(names) {
  return names.join(',').length
}
