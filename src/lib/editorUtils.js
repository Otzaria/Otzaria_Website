/**
 * חישוב מיקום מדויק של הסמן (caret) ב-textarea
 * הפונקציה יוצרת אלמנט מראה (mirror) כדי לחשב את המיקום האנכי של הסמן
 * 
 * @param {HTMLTextAreaElement} textarea - אלמנט ה-textarea
 * @param {number} position - מיקום הסמן (index) בטקסט
 * @returns {number} המיקום האנכי של הסמן בפיקסלים
 */
export function getTextareaCaretTop(textarea, position) {
  const computedStyle = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const span = document.createElement('span')
  const propertiesToCopy = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'MozTabSize'
  ]

  mirror.dir = textarea.dir || 'rtl'
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.wordBreak = 'break-word'

  propertiesToCopy.forEach((property) => {
    mirror.style[property] = computedStyle[property]
  })

  mirror.textContent = textarea.value.slice(0, position)
  span.textContent = textarea.value.slice(position, position + 1) || '.'
  mirror.appendChild(span)
  document.body.appendChild(mirror)

  const caretTop = span.offsetTop
  document.body.removeChild(mirror)
  return caretTop
}
