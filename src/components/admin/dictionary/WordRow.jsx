'use client'

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import ExpandToggle from '@/components/ui/ExpandToggle'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import { UNDO_SHORTCUT } from '@/components/ui/Toast'
import { wordRequestCount } from '@/lib/adminDictionaryScreen/dictionaryQuery'
import { DONE_LINE, PENDING_LINE, approveAriaLabel, removeLabel, usersCountText } from '@/lib/adminDictionaryScreen/dictionaryTerms'
import WordUsers from './WordUsers'
import { AREA_CHECK, AREA_DETAIL, AREA_MAIN, AREA_MENU, AREA_PRIMARY, AREA_USERS, ROW_GRID, ROW_PADDING, WORD_TEXT } from './wordRowLayout'

/** "משה כהן, יעקב לוי" — תצוגה מקדימה של מי הוסיף, ברשימה רחבה */
const previewNames = (users) => users.map((u) => u.name || u.email || 'משתמש').join(', ')

/**
 * שורת מילה: בחירה, המילה, מי הוסיף אותה ("3 משתמשים ⌄" פותח את הרשימה — ובה פעולה לכל משתמש לבד), "אשר" ו"דלג"
 * (בלשונית "דולגו" — רק "אשר"), ו-⋮ עם "הסר מהמילון האישי של כל N המשתמשים" (באדום, אחרון). הפעולות בשורה — על כל
 * מי שהוסיף את המילה, וזה נאמר (בתפריט, לקורא המסך ובהודעה). "דלג" ברשימה צרה — אייקון בלבד (שהצ'יפ לא יעלה עליו).
 * quiet — יש בחירה במסך: "אשר" בשורה שקט, כדי שהסרגל יהיה הפעולה הבולטת.
 * pending — הפעולה ממתינה ל"בטל": במקום הכפתורים — מה עומד לקרות ו"בטל" (באותו מקום ובאותו גודל).
 * done — הפעולה הצליחה: סימון שקט במקום הכפתורים, והשורה נשארת במקומה עד הרענון.
 * busy — הבקשות באוויר. locked — פעולה מרובה באמצע, או שהמסך ננעל.
 * המקלדת (↑ ↓, A, S) — ברשימה (DictionaryScreen), לפי השורה שבה הפוקוס (data-word-row).
 *
 * @param {{ word: any, view: string, selected: boolean, onSelect: (words: string[], checked: boolean) => void,
 *   pending?: string | null, done?: string | null, busy: boolean, locked: boolean, quiet?: boolean, busyUsers?: Set<string>,
 *   onAct: (word: any, action: string) => void, onCancel: (word: any) => void,
 *   onActUser?: (word: any, user: any, action: string) => void }} props
 */
function WordRow({ word, view, selected, onSelect, pending = null, done = null, busy, locked, quiet = false, busyUsers, onAct, onCancel, onActUser }) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const rowRef = useRef(null)
  const state = pending ? 'pending' : done ? 'done' : 'idle'

  // הכפתור שנלחץ מתחלף ("אשר" → "בטל" → "אשר", או סימון "נוספה") — הפוקוס עובר למה שבא במקומו, לא לתחילת הדף.
  // רק כשהפוקוס היה בשורה (או אבד) — לא גוזלים אותו ממקום אחר.
  const lastState = useRef(state)
  useEffect(() => {
    if (lastState.current === state) return
    lastState.current = state
    const row = rowRef.current
    const active = document.activeElement
    if (!row || (active && active !== document.body && !row.contains(active))) return
    const target = state === 'pending' ? row.querySelector('[data-cancel]') : state === 'idle' ? row.querySelector('[data-approve]') : row
    target?.focus({ preventScroll: true })
  }, [state])
  const inactive = Boolean(pending || done)
  const name = `"${word.word}"`
  const menuItems = useMemo(() => [
    { id: 'remove', icon: 'delete', label: removeLabel(word.users.length), danger: true, disabled: busy || locked || inactive, onSelect: () => onAct(word, 'remove') },
  ], [word, busy, locked, inactive, onAct])

  return (
    <li
      ref={rowRef}
      data-word-row={word.word}
      tabIndex={-1}
      className={cx(ROW_GRID, ROW_PADDING, 'relative rounded-(--radius-control) outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary', selected && 'bg-surface-selected')}
    >
      <div className={AREA_CHECK}>
        <Checkbox label={`בחר את ${name}`} checked={selected} disabled={locked || inactive} onChange={(checked) => onSelect([word.word], checked)} />
      </div>

      <div className={AREA_MAIN}>
        <h3 dir="auto" title={word.word} className={cx(WORD_TEXT, done && 'text-on-surface-variant')}>{word.word}</h3>
      </div>

      <div className={AREA_USERS}>
        <ExpandToggle
          label={usersCountText(word.users.length)}
          expanded={open}
          controls={detailId}
          onToggle={() => setOpen((v) => !v)}
          ariaLabel={`${open ? 'הסתר' : 'הצג'} מי הוסיף את ${name} (${usersCountText(word.users.length)})`}
          className="shrink-0"
        />
        <span aria-hidden="true" title={previewNames(word.users)} className={cx('hidden min-w-0 truncate text-body-sm text-on-surface-variant @3xl:inline', open && 'invisible')}>
          {previewNames(word.users)}
        </span>
      </div>

      <div className={AREA_PRIMARY}>
        {pending ? (
          <>
            <span className="text-body-sm text-on-surface-variant @max-md:sr-only">{PENDING_LINE[pending]}</span>
            <Button
              data-cancel=""
              variant="text"
              size="sm"
              icon="undo"
              onClick={() => onCancel(word)}
              aria-label={`בטל: ${name}`}
              aria-keyshortcuts={UNDO_SHORTCUT}
              title="בטל (Ctrl+Z)"
            >
              בטל
            </Button>
          </>
        ) : done ? (
          <span className="inline-flex min-h-(--touch-target) items-center gap-1.5 px-3 text-label-lg text-on-surface-variant">
            <AppIcon name="check" className="text-icon-md" />
            {DONE_LINE[done]}
          </span>
        ) : (
          <>
            <Button data-approve="" variant={quiet ? 'text' : 'tonal'} size="sm" icon="check" loading={busy} softDisabled={locked} onClick={() => onAct(word, 'approve')}
              aria-label={approveAriaLabel(word.word, word.users.length)} aria-keyshortcuts="A" title="אשר (A)">
              אשר
            </Button>
            {view === 'pending' && (
              <Button data-skip="" variant="text" size="sm" icon="redo" softDisabled={busy || locked} onClick={() => onAct(word, 'skip')}
                aria-label={`דלג על ${name}${wordRequestCount(word, 'skip') > 1 ? ` (אצל כל ${wordRequestCount(word, 'skip')} המשתמשים)` : ''}`} aria-keyshortcuts="S" title="דלג (S)"
                className="@max-md:px-2.5">
                <span className="@max-md:sr-only">דלג</span>
              </Button>
            )}
          </>
        )}
      </div>

      <div className={AREA_MENU}>
        <MenuButton label={`פעולות נוספות: ${name}`} items={menuItems} />
      </div>

      <div id={detailId} hidden={!open} className={AREA_DETAIL}>
        {open && <div data-word-users=""><WordUsers word={word} busyUsers={busyUsers} disabled={busy || locked || inactive} onActUser={onActUser} /></div>}
      </div>
    </li>
  )
}

export default memo(WordRow)

/** כותרות העמודות — רק ברשימה רחבה; לקורא המסך כל תא אומר מה הוא, ולכן aria-hidden */
export function WordColumnsHeader() {
  return (
    <div aria-hidden="true" className={cx(ROW_GRID, ROW_PADDING, 'hidden min-h-11 border-b border-outline-variant/60 py-1 text-label-md text-on-surface-variant @3xl:grid')}>
      <span className="[grid-area:main]">מילה</span>
      <span className="[grid-area:users]">מי הוסיף</span>
    </div>
  )
}
