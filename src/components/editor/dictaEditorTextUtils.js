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

/**
 * מחשב את תוצאת insertTag (עטיפת הבחירה הנוכחית בתג HTML): הטקסט החדש
 * ומיקום הסמן החדש. חולץ מ-DictaEditorCore.insertTag - כל מה שנשאר בקומפוננטה
 * הוא תופעות הלוואי על ה-DOM (focus/scrollTop/setSelectionRange).
 *
 * @param {string} content - תוכן המסמך המלא
 * @param {number} start - תחילת הבחירה בטקסטאריה
 * @param {number} end - סוף הבחירה בטקסטאריה
 * @param {string} tag - שם התג להוספה (למשל 'b', 'h1')
 * @returns {{ newText: string, newCursorPos: number }}
 */
export function computeInsertTagResult(content, start, end, tag) {
  const selectedText = content.substring(start, end)

  // הסרת רווחים מלפני ואחרי הטקסט הנבחר
  const trimmedText = selectedText.trim()
  const leadingSpaces = selectedText.match(/^\s*/)[0]
  const trailingSpaces = selectedText.match(/\s*$/)[0]

  // בדיקה אם זה תג כותרת
  const isHeadingTag = /^h[1-6]$/.test(tag)

  let insertion

  if (isHeadingTag && trimmedText) {
    // עבור כותרות: הסרת כל התגים הקיימים מהטקסט
    // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): this is an editor
    // convenience action (strip tags before wrapping in a heading), not the security
    // boundary — final content is always run through DOMPurify.sanitize() before render.
    const cleanText = trimmedText.replace(/<[^>]*>/g, '')
    insertion = `<${tag}>${cleanText}</${tag}>`

    // הוספת ירידת שורה אחרי הכותרת אם אין כבר
    const textAfterSelection = content.substring(end)
    const hasNewlineAfter = textAfterSelection.startsWith('\n')
    const hasNewlineInTrailing = trailingSpaces.includes('\n')
    const needsNewline = !hasNewlineAfter && !hasNewlineInTrailing && textAfterSelection.length > 0
    if (needsNewline) {
      insertion += '\n'
    }
  } else {
    // עבור תגים רגילים: התנהגות קיימת
    insertion = trimmedText ? `<${tag}>${trimmedText}</${tag}>` : `<${tag}></${tag}>`
  }

  const newText = content.substring(0, start) + leadingSpaces + insertion + trailingSpaces + content.substring(end)
  const newCursorPos = trimmedText ? (start + leadingSpaces.length + insertion.length) : (start + tag.length + 2)

  return { newText, newCursorPos }
}

/**
 * מחשב את תוצאת removeTags (הסרת תגי HTML מהטקסט הנבחר): הטקסט החדש
 * וטווח הבחירה החדש. מחזיר error כאשר אין טקסט נבחר. חולץ מ-
 * DictaEditorCore.removeTags - תופעות הלוואי על ה-DOM נשארות בקומפוננטה.
 *
 * @returns {{ error: string }|{ newText: string, newSelectionStart: number, newSelectionEnd: number }}
 */
export function computeRemoveTagsResult(content, start, end) {
  const selectedText = content.substring(start, end)

  if (!selectedText) {
    return { error: 'יש לבחור טקסט להסרת תגים' }
  }

  // הסרת כל תגי ה-HTML מהטקסט הנבחר
  // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): editor convenience
  // action, not the security boundary — rendering always goes through DOMPurify.sanitize() first.
  const cleanedText = selectedText.replace(/<[^>]*>/g, '')
  const newText = content.substring(0, start) + cleanedText + content.substring(end)

  return { newText, newSelectionStart: start, newSelectionEnd: start + cleanedText.length }
}
