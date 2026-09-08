// פונקציות טהורות (ללא state/refs/DOM) שחולצו מ-DictaEditorCore.jsx.
// כל פונקציה כאן מקבלת קלט ומחזירה פלט בלבד, ולכן ניתנת לבדיקה מלאה ב-vitest
// גם בסביבה שבה אין אפשרות לבדוק ויזואלית את העורך עצמו.

/**
 * בונה את תוכן העניינים מתוך HTML של הספר, לפי תגי כותרות h1-h6.
 * משמש הן לרינדור סרגל התוכן והן לניווט (scrollToHeading).
 */
export function buildTocFromContent(content) {
  if (!content) return []

  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  const tocItems = []
  let match
  let index = 0

  while ((match = headingRegex.exec(content)) !== null) {
    const [, rawLevel, innerHtml] = match
    // הפענוח של &amp; מתבצע אחרון: אחרת "&amp;lt;" (שאמור להישאר "&lt;" מילולי)
    // היה מפוענח פעמיים ל-"<" בטעות (codeql: js/double-escaping).
    const headingText = innerHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim()

    tocItems.push({
      id: `heading-${index}`,
      level: Math.min(Math.max(parseInt(rawLevel, 10), 1), 6),
      text: headingText,
      html: match[0],
      position: match.index
    })

    index += 1
  }

  return tocItems
}

/**
 * מאתר קטע מקישור עמוק (?find=) בתוכן הספר. הקטע המדווח מנוקה מתגי HTML
 * בעוד התוכן מכיל אותם, לכן אחרי התאמה מדויקת מנסים regex סובלני: תגים,
 * &nbsp; וישויות HTML בין/בתוך מילים, וגרשיים עבריים מול ASCII.
 */
export function locateTextFlexible(content, phrase) {
  const cleaned = String(phrase || '').replace(/\s+/g, ' ').trim()
  if (!cleaned || !content) return null

  const exactIndex = content.indexOf(cleaned)
  if (exactIndex !== -1) return { start: exactIndex, end: exactIndex + cleaned.length }

  // סדר ההחלפות חשוב: & לפני החלפות שמוסיפות &quot;/&#39; לתבנית.
  // תקרת 15 מילים — מגנה מפני backtracking קטלוני בקטע ארוך, ו-15 המילים
  // הראשונות כמעט תמיד ייחודיות מספיק לאיתור.
  const tokens = cleaned.split(' ').slice(0, 15).map(token =>
    token
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/&/g, '&(?:amp;)?')
      .replace(/["״]/g, '(?:["״]|&quot;)')
      .replace(/['׳]/g, "(?:['׳]|&#39;)")
  )
  try {
    const tolerant = new RegExp(tokens.join('(?:\\s|&nbsp;|<[^>]*>)+'))
    const match = tolerant.exec(content)
    if (match) return { start: match.index, end: match.index + match[0].length }
  } catch (e) {
    console.warn('locateTextFlexible: invalid pattern', e)
  }
  return null
}

/**
 * ממיר גרשיים/גרש ASCII לגרשיים עבריים (״ / ׳). משמש בבניית וריאנטים
 * למילה במהלך בדיקת איות (handleSpellcheckSelect).
 */
export function normalizeHebrewQuotes(value) {
  if (!value) return ''
  return value.replace(/["']/g, m => (m === '"' ? '״' : '׳'))
}

/**
 * בונה את קבוצת הוריאנטים לחיפוש מילה בבדיקת איות: המילה המקורית, הגרסה
 * עם גרשיים עבריים, והגרסה עם גרשיים ASCII - ללא כפילויות.
 */
export function buildWordVariants(word) {
  if (!word) return []
  const normalized = normalizeHebrewQuotes(word)
  const alt = normalized.replace(/[״׳]/g, m => (m === '״' ? '"' : "'"))
  const variants = [word, normalized, alt].filter(Boolean)
  return Array.from(new Set(variants))
}

/**
 * מחליף את הרצף המילולי "^13" (מוסכמה של דיקטה לירידת שורה) בתו ירידת
 * שורה אמיתי. משמש בכל מקומות החיפוש/החלפה (רגיל ו-regex) כדי לאפשר
 * למשתמש לחפש/להחליף ירידות שורה מבלי להקליד תו בלתי נראה.
 */
export function applyFindPatternTokens(str) {
  return str.replaceAll('^13', '\n')
}
