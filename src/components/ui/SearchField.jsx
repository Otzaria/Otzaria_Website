'use client'

import { useEffect, useId, useRef, useState } from 'react'
import AppIcon from './AppIcon'
import { cx } from './cx'
import { FIELD_ICON_GLYPH, fieldAdornmentClasses, fieldClasses } from './fieldStyles'
import { FOCUS_RING_INSET } from './focusRing'

/**
 * שדה חיפוש לרשימה: אייקון חיפוש, כפתור ניקוי, והקלדה שמתעדכנת אחרי השהיה קצרה (debounce) —
 * כדי שהסינון והכתובת לא יתעדכנו בכל אות. Enter מעדכן מיד; Esc בשדה מלא מנקה.
 * shortcut="/" — מקש "/" בכל מקום בעמוד (לא בתוך שדה טקסט) מעביר את הפוקוס לשדה.
 *
 * value — הערך המאושר (מהכתובת); onSearch(value) — נקרא אחרי ההשהיה. הטיוטה המקומית מתאפסת
 * כשהערך מבחוץ משתנה (למשל "נקה סינון").
 *
 * @param {{ label: string, value: string, onSearch: (value: string) => void, placeholder?: string,
 *   delay?: number, shortcut?: string, className?: string }} props
 */
export default function SearchField({ label, value, onSearch, placeholder, delay = 250, shortcut = '/', className }) {
  const id = useId()
  const inputRef = useRef(null)
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  // מה שנשלח אחרון — כדי שהעדכון שחוזר מבחוץ לא ימחק אותיות שהוקלדו בינתיים
  const [sent, setSent] = useState(value)
  // ערך חדש מבחוץ (ניקוי סינון, חזרה אחורה) — מחליף את הטיוטה, בלי effect
  if (value !== synced) {
    setSynced(value)
    if (value !== sent) {
      setSent(value)
      setDraft(value)
    }
  }

  const submit = (next) => {
    setSent(next)
    onSearch(next)
  }

  useEffect(() => {
    if (draft.trim() === value) return undefined
    const timer = setTimeout(() => {
      setSent(draft.trim())
      onSearch(draft.trim())
    }, delay)
    return () => clearTimeout(timer)
  }, [draft, value, delay, onSearch])

  useEffect(() => {
    if (!shortcut) return undefined
    const onKey = (event) => {
      if (event.key !== shortcut || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcut])

  return (
    <div className={cx('relative', className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <span className={fieldAdornmentClasses('md', 'start')}>
        <AppIcon name="search" className={FIELD_ICON_GLYPH} />
      </span>
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-keyshortcuts={shortcut || undefined}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit(draft.trim())
          if (event.key === 'Escape' && draft) {
            event.preventDefault()
            setDraft('')
            submit('')
          }
        }}
        className={fieldClasses({ withIcon: true, trailing: Boolean(draft), className: '[&::-webkit-search-cancel-button]:appearance-none' })}
      />
      {draft && (
        <button
          type="button"
          aria-label="נקה חיפוש"
          onClick={() => {
            setDraft('')
            submit('')
            inputRef.current?.focus()
          }}
          className={cx('absolute end-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-(--radius-control) text-on-surface-variant hover:bg-surface-selected', FOCUS_RING_INSET)}
        >
          <AppIcon name="close" className="text-icon-lg" />
        </button>
      )}
    </div>
  )
}
