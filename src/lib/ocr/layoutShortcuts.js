// קיצורי המקלדת בדף תיוג המבנה של המתנדבים (/library/ocr-layout): Enter = שמירה (או "הכול נכון"
// כשעוד לא נגעו בכלום), N = דילוג. טהור — מקבל את האירוע ואת מצב העמוד, מחזיר איזו פעולה (או null).
// לא פועל כשהמקש שייך למשהו אחר: הקלדה בשדה, בורר (הכפתור שלו או הרשימה הפתוחה), חלון, או
// אירוע שכבר טופל (preventDefault).

const MENU_OR_DIALOG = '[role="listbox"],[role="combobox"],[aria-haspopup],[role="dialog"],[role="menu"]'

export function ownedElsewhere(event) {
  if (event.defaultPrevented) return true
  const el = event.target
  if (!el) return false
  if (el.isContentEditable) return true
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
  return Boolean(el.closest?.(MENU_OR_DIALOG))
}

/** @returns {'save' | 'allCorrect' | 'skip' | null} */
export function layoutShortcut(event, { allValid, untouched }) {
  if (ownedElsewhere(event)) return null
  if (event.key === 'Enter') {
    if (allValid) return 'save'
    if (untouched) return 'allCorrect'
    return null
  }
  if (event.key === 'n' || event.key === 'N') return 'skip'
  return null
}
