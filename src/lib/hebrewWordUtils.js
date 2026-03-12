export const HEBREW_BOUNDARY = '\\u0590-\\u05FF'

export const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildWholeWordRegex = (word, global = true) => {
  if (!word) return null
  const escaped = escapeRegExp(word)
  const pattern = `(^|[^${HEBREW_BOUNDARY}])(${escaped})(?=([^${HEBREW_BOUNDARY}]|$))`
  return new RegExp(pattern, global ? 'g' : '')
}

export const findNextWholeWordInTextarea = (textarea, word, options = {}) => {
  if (!textarea || !word) return false

  const {
    text = textarea.value || '',
    suppressAlerts = false,
    onWrap,
    onNotFound,
    getCaretTop,
    scrollDelay = 0
  } = options

  const regex = buildWholeWordRegex(word, true)
  if (!regex) return false

  const startPos = textarea.selectionEnd || 0
  regex.lastIndex = startPos
  let match = regex.exec(text)
  let wrapped = false

  if (!match) {
    regex.lastIndex = 0
    match = regex.exec(text)
    wrapped = !!match
  }

  if (!match) {
    if (!suppressAlerts && onNotFound) onNotFound()
    return false
  }

  const prefixLen = match[1] ? match[1].length : 0
  const wordText = match[2] || word
  const matchIndex = match.index + prefixLen
  const matchLength = wordText.length

  textarea.focus()
  textarea.setSelectionRange(matchIndex, matchIndex + matchLength)

  if (getCaretTop && typeof window !== 'undefined') {
    setTimeout(() => {
      const computedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight)
      const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 24
      const caretTop = getCaretTop(textarea, matchIndex)
      const scrollPos = Math.max(0, caretTop - (textarea.clientHeight / 2) + lineHeight)
      textarea.scrollTop = scrollPos
    }, scrollDelay)
  }

  if (wrapped && !suppressAlerts && onWrap) {
    onWrap()
  }

  return true
}