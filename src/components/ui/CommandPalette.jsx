'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import Kbd from './Kbd'
import { cx } from './cx'
import { hasIconGlyph } from './iconGlyphs'
import { useDialogA11y } from './useDialogA11y'
import { usePortalContainer } from './portalContainer'
import { filterCommands, groupCommands, nextEnabledIndex } from './commandPaletteFilter'

/**
 * חלון פקודות (Ctrl+K) — רכיב גנרי. ההורה שולט בפתיחה (open) ובקיצור שפותח אותו.
 *
 * commands — [{ id, label, group?, keywords?, shortcut?: ['Ctrl','H'], icon?, run, disabled? }].
 * הקלדה מסננת (בלי ניקוד ואותיות סופיות — normalizeHebrew), חצים / Home / End נעים בין
 * הפקודות הזמינות, Enter מריץ, Esc ולחיצה על הרקע סוגרים. ההרצה מתבצעת אחרי הסגירה
 * (הפוקוס כבר חזר למי שפתח) — כך פקודה שפותחת חלון אחר לא מתנגשת עם החלון הזה.
 *
 * נגישות: role="dialog" מודאלי (useDialogA11y — לכידת פוקוס, החזרת פוקוס), שדה role="combobox"
 * עם aria-activedescendant, רשימה role="listbox" מקובצת (role="group" לכל קבוצה), ושורת
 * סטטוס חיה שאומרת כמה תוצאות נמצאו.
 *
 * @param {{ open: boolean, onClose: () => void, commands: import('./commandPaletteFilter').PaletteCommand[],
 *   label?: string, placeholder?: string, emptyText?: string }} props
 */
export default function CommandPalette({ open, onClose, ...rest }) {
  const container = usePortalContainer()
  if (!open || !container) return null
  return createPortal(<PalettePanel onClose={onClose} {...rest} />, container)
}

function PalettePanel({
  onClose,
  commands,
  label = 'פקודות וכלים',
  placeholder = 'חפש פעולה, למשל: הדגשה, סיבוב, פיצול',
  emptyText = 'לא נמצאה פעולה מתאימה'
}) {
  const panelRef = useRef(null)
  const baseId = useId()
  const listId = `${baseId}-list`
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])
  const groups = useMemo(() => groupCommands(filtered, commands), [filtered, commands])
  // הסדר השטוח כפי שהוא מוצג (לפי קבוצות) — לניווט בחצים
  const flat = useMemo(() => groups.flatMap((g) => g.commands), [groups])
  const [activeId, setActiveId] = useState(null)

  const activeIndex = flat.findIndex((c) => c.id === activeId)
  // הפקודה הפעילה נגזרת: אם זו שנבחרה סוננה החוצה — הראשונה הזמינה
  const effectiveIndex = activeIndex !== -1 && !flat[activeIndex].disabled ? activeIndex : nextEnabledIndex(flat, -1, 1)
  const active = effectiveIndex === -1 ? null : flat[effectiveIndex]
  const optionId = (command) => `${baseId}-opt-${command.id}`

  useDialogA11y(panelRef, onClose)

  useEffect(() => {
    if (!active) return
    const el = document.getElementById(optionId(active))
    el?.scrollIntoView?.({ block: 'nearest' })
    // optionId תלוי רק ב-baseId היציב
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  const runCommand = (command) => {
    if (!command || command.disabled) return
    onClose()
    setTimeout(() => command.run(), 0)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = nextEnabledIndex(flat, effectiveIndex, event.key === 'ArrowDown' ? 1 : -1)
      if (next !== -1) setActiveId(flat[next].id)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const next = nextEnabledIndex(flat, -1, event.key === 'Home' ? 1 : -1)
      if (next !== -1) setActiveId(flat[next].id)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runCommand(active)
    }
  }

  return (
    <div className="fixed inset-0 z-(--z-overlay) flex items-start justify-center px-4 pt-[12dvh]">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-(--dialog-scrim) animate-enter-fade motion-reduce:animate-none" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative flex max-h-[70dvh] w-full max-w-(--container-xl) flex-col overflow-hidden rounded-(--dialog-radius) bg-(--dialog-bg) shadow-(--dialog-shadow) outline-none animate-enter-scale motion-reduce:animate-none"
      >
        {/* טבעת הפוקוס של השדה: קו תחתון עבה בצבע הפוקוס (השדה עצמו בלי מסגרת) */}
        <div className="flex items-center gap-3 border-b-2 border-outline-variant px-4 focus-within:border-focus-ring">
          <AppIcon name="search" className="text-2xl text-on-surface-variant" />
          <input
            // הפוקוס נכנס ישר לשדה החיפוש — זו כל המטרה של החלון
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionId(active) : undefined}
            aria-label="חיפוש פעולה"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-14 min-w-0 flex-1 bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          <Kbd keys={['Esc']} decorative />
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {query ? (flat.length ? `נמצאו ${flat.length} פעולות` : emptyText) : ''}
        </div>

        <div id={listId} role="listbox" aria-label={label} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {flat.length === 0 && (
            <p className="px-3 py-6 text-center text-body-md text-on-surface-variant">{emptyText}</p>
          )}
          {groups.map(({ group, commands: items }) => (
            <PaletteGroup key={group || '_'} id={`${baseId}-g-${group}`} title={group}>
              {items.map((command) => (
                <PaletteOption
                  key={command.id}
                  id={optionId(command)}
                  command={command}
                  active={active?.id === command.id}
                  onHover={() => { if (!command.disabled) setActiveId(command.id) }}
                  onRun={() => runCommand(command)}
                />
              ))}
            </PaletteGroup>
          ))}
        </div>
      </div>
    </div>
  )
}

function PaletteGroup({ id, title, children }) {
  if (!title) return <div role="group">{children}</div>
  return (
    <div role="group" aria-labelledby={id} className="pb-1">
      <div id={id} role="presentation" className="px-3 pb-1 pt-3 text-label-sm text-on-surface-variant">{title}</div>
      {children}
    </div>
  )
}

function PaletteOption({ id, command, active, onHover, onRun }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-disabled={command.disabled || undefined}
      onPointerMove={onHover}
      // mousedown לא מוציא את הפוקוס מהשדה
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
      className={cx(
        'flex min-h-(--touch-target) cursor-pointer items-center gap-3 rounded-(--radius-control) px-3 text-body-md text-on-surface',
        active && 'bg-surface-selected',
        command.disabled && 'cursor-not-allowed opacity-(--button-disabled-opacity)'
      )}
    >
      <span className="flex w-6 shrink-0 justify-center text-on-surface-variant">
        {hasIconGlyph(command.icon) && <AppIcon name={command.icon} className="text-xl" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {command.shortcut?.length > 0 && (
        <>
          <span className="sr-only">{`, קיצור: ${command.shortcut.join('+')}`}</span>
          <Kbd keys={command.shortcut} decorative />
        </>
      )}
    </div>
  )
}
