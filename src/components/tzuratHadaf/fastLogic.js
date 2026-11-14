// צורת הדף — לוגיקה טהורה של כרטיס ההחלטה (FastItem): מקשים, גוף התשובה, משפט ההקשר ומסגרת החיתוך.
// FastItem (CONTRACT.md): {id, kind, question, prompt, focus, options:[{id, label, words?}], allowText,
// ctxBefore, ctxAfter, imageUrl, fullImageUrl, box}. value של הכרטיס: {choice, text} או null.

export const EXCLUDE_MAX = 12
export const MAX_TEXT = 200

/** מילים ממערך או ממחרוזת */
export function toWords(x) {
  if (Array.isArray(x)) return x.filter((w) => typeof w === 'string' && w)
  if (typeof x === 'string') return x.split(/\s+/).filter(Boolean)
  return []
}

/** הטקסט שמוצג לאפשרות: label, ואם אין — המילים */
export function optionText(opt) {
  if (!opt) return ''
  if (typeof opt.label === 'string' && opt.label.trim()) return opt.label
  return toWords(opt.words).join(' ')
}

/** רשימת הדילוגים: id בסוף, בלי כפילות, עד EXCLUDE_MAX האחרונים */
export function pushExclude(list, id, max = EXCLUDE_MAX) {
  if (!id) return list.slice(-max)
  return [...list.filter((x) => x !== id), id].slice(-max)
}

/** האם אפשר לשלוח את התשובה */
export function answerReady(value) {
  if (!value || typeof value.choice !== 'string' || !value.choice) return false
  if (value.choice === 'other') return typeof value.text === 'string' && value.text.trim().length > 0 && value.text.trim().length <= MAX_TEXT
  return true
}

/** גוף הבקשה POST items/[id]/answer (או רשומה ב-itemAnswers / practice), null אם אינה מוכנה */
export function answerBody(value, via) {
  if (!answerReady(value)) return null
  const body = { choice: value.choice }
  if (Number.isInteger(value.revision)) body.revision = value.revision
  if (value.choice === 'other') body.text = value.text.trim()
  if (via) body.via = via
  return body
}

/**
 * משפט ההקשר: {before, middle, after, mode}. mode — 'option' (המילים של האפשרות שנבחרה),
 * 'focus' (המילים שבשאלה), 'text' (מה שהוקלד ב"משהו אחר"), 'gap' (אין עדיין מה להציג).
 */
export function contextParts(item, value) {
  const before = toWords(item?.ctxBefore)
  const after = toWords(item?.ctxAfter)
  if (value?.choice === 'other' && value.text?.trim()) return { before, middle: toWords(value.text), after, mode: 'text' }
  const chosen = (item?.options || []).find((o) => o.id === value?.choice)
  if (chosen && toWords(chosen.words).length) return { before, middle: toWords(chosen.words), after, mode: 'option' }
  const focus = toWords(item?.focus)
  if (focus.length) return { before, middle: focus, after, mode: 'focus' }
  return { before, middle: [], after, mode: 'gap' }
}

/** מסגרת על החיתוך: box {x,y,w,h} (שברים) → style באחוזים; null כשאין תיבה תקינה */
export function boxStyle(box) {
  if (!box) return null
  const v = Array.isArray(box) ? { x: box[0], y: box[1], w: box[2], h: box[3] } : box
  if (![v.x, v.y, v.w, v.h].every((n) => Number.isFinite(n))) return null
  if (v.w <= 0 || v.h <= 0) return null
  const c = (n) => Math.max(0, Math.min(100, n * 100))
  return { left: `${c(v.x)}%`, top: `${c(v.y)}%`, width: `${c(v.w)}%`, height: `${c(v.h)}%` }
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** האם המקש נלחץ בתוך שדה הקלדה (ואז מתעלמים ממנו) */
export function isTypingTarget(target) {
  if (!target) return false
  if (TYPING_TAGS.has(target.tagName)) return true
  return !!target.isContentEditable
}

/**
 * מקש → פעולה בכרטיס: {type:'choose', id} (1..4 לפי סדר האפשרויות), {type:'submit'} (Enter),
 * {type:'skip'} (N), {type:'other'} (O, כשיש "משהו אחר"), {type:'unclear'} (U). null — לא שלנו.
 */
export function keyAction(e, item) {
  if (!e || !item) return null
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (isTypingTarget(e.target)) return null
  const k = e.key
  if (k === 'Enter') return { type: 'submit' }
  if (/^[1-9]$/.test(k)) {
    const opt = (item.options || [])[Number(k) - 1]
    return opt ? { type: 'choose', id: opt.id } : null
  }
  // גם בפריסת מקלדת עברית: N = מ, O = ם, U = ו
  if (k === 'n' || k === 'N' || k === 'מ') return { type: 'skip' }
  if (k === 'o' || k === 'O' || k === 'ם') return item.allowText ? { type: 'other' } : null
  if (k === 'u' || k === 'U' || k === 'ו') return { type: 'unclear' }
  return null
}
