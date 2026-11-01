'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import MenuButton from '@/components/ui/MenuButton'
import Tooltip from '@/components/ui/Tooltip'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { fitToolbarGroups } from './toolbarOverflow'
import { toAriaKeys } from './editorShellLogic'

/**
 * שורת הכלים של פאנל בעורך (צילום / טקסט): שם הפאנל בצד ההתחלה, הכלים בצד הסוף.
 * שורה אחת ואוורירית (סגנון "אוורירי וקל" + קבוצות): גובה --editor-toolbar-height (52px;
 * במגע 56px), כפתורי Button size="tool" (38px, אייקון דק; במגע 44px). בלי קווי הפרדה — הפס בגוון
 * --tool-strip-bg, וכל קבוצה של כלים קשורים כרטיס צף (ToolGroup), עם מרווח נדיב בין הקבוצות (--tool-group-gap).
 *
 * השורה לא נגללת לעולם: הקבוצות נמדדות (העתק נסתר, ResizeObserver) וכשאין מקום — שם הפאנל
 * יורד, ואחריו הקבוצות הפחות חשובות עוברות לתפריט "עוד" (fitToolbarGroups, לפי priority).
 * כפתור "עוד" תמיד בסוף: עם קבוצות שיצאו — תפריט (ובסופו "כל הפקודות"); בלעדיהן — חלון הפקודות.
 *
 * @typedef {{ id: string, label: string, icon?: string, glyph?: string, tip?: string, mirror?: boolean, glyphClassName?: string,
 *   onClick: () => void, keepFocus?: boolean, pressed?: boolean, disabled?: boolean,
 *   shortcut?: string[], keyshortcuts?: string, hidden?: boolean,
 *   render?: () => import('react').ReactNode, menu?: import('@/components/ui/MenuButton').MenuItem[] }} ToolItem
 *   glyph  — טקסט קצר במקום אייקון (H1, B); glyphClassName — משקל הגליף (ברירת מחדל דק, font-light);
 *   render — תצוגה מיוחדת בשורה (בתפריט — label/icon);
 *   mirror — אייקון כיווני שמתהפך ב-RTL (ביטול/ביצוע מחדש). גליף האייקון עצמו ב-direction: ltr
 *            (base.css), ולכן אייקון לא-כיווני לעולם לא מתהפך;
 *   shortcut — מקשי הקיצור (לתפריט "עוד"); נגזר ממנו גם aria-keyshortcuts, אלא אם keyshortcuts הועבר;
 *   menu   — כשהקבוצה בתפריט "עוד": הפריטים האלה במקום הפריט עצמו (למשל בחירת מנוע הזיהוי).
 * @typedef {{ id: string, priority?: number, pinned?: boolean, items: ToolItem[] }} ToolGroup
 *
 * @param {{ label: string, groups: ToolGroup[], onAllCommands?: () => void,
 *   allCommandsShortcut?: string[], className?: string }} props
 */
export default function PaneToolbar({ label, groups, onAllCommands, allCommandsShortcut, className }) {
  const rootRef = useRef(null)
  const measureRef = useRef(null)
  const [fit, setFit] = useState(null)

  const liveGroups = (groups || [])
    .map((g) => ({ ...g, items: g.items.filter((item) => item && !item.hidden) }))
    .filter((g) => g.items.length > 0)
  const signature = liveGroups.map((g) => `${g.id}:${g.items.map((i) => i.id).join(',')}`).join('|')

  const measure = useCallback(() => {
    const root = rootRef.current
    const box = measureRef.current
    if (!root || !box) return
    const style = getComputedStyle(root)
    const available = root.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0') - 8
    const width = (selector) => box.querySelector(selector)?.getBoundingClientRect().width ?? 0
    // המרווח בין הקבוצות (--tool-group-gap) — ה-column-gap של השורה
    const gap = parseFloat(getComputedStyle(box).columnGap || '0') || 0
    const measured = [...box.querySelectorAll('[data-measure-group]')].map((el) => {
      const meta = liveGroups.find((g) => g.id === el.getAttribute('data-measure-group'))
      return { id: meta?.id ?? '', priority: meta?.priority, pinned: meta?.pinned, width: el.getBoundingClientRect().width }
    })
    const next = fitToolbarGroups({
      groups: measured,
      available,
      gap,
      moreWidth: width('[data-measure="more"]'),
      labelWidth: width('[data-measure="label"]') + gap
    })
    setFit((prev) => (prev && prev.showLabel === next.showLabel && prev.overflow.join() === next.overflow.join() ? prev : next))
    // liveGroups מתחלף בכל רינדור; signature מייצג את התוכן שלו
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  useLayoutEffect(() => {
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => measure())
    if (rootRef.current) observer.observe(rootRef.current)
    if (measureRef.current) observer.observe(measureRef.current)
    return () => observer.disconnect()
  }, [measure])

  const overflowIds = new Set(fit?.overflow ?? [])
  const visible = liveGroups.filter((g) => !overflowIds.has(g.id))
  const hidden = liveGroups.filter((g) => overflowIds.has(g.id))
  const showLabel = fit ? fit.showLabel : true

  const menuItems = []
  hidden.forEach((g, index) => {
    if (index > 0) menuItems.push({ separator: true, id: `sep-${g.id}` })
    for (const item of g.items) {
      if (item.menu) {
        menuItems.push(...item.menu)
        continue
      }
      menuItems.push({
        id: item.id, label: item.label, icon: item.icon, glyph: item.glyph, glyphClassName: item.glyphClassName, mirror: item.mirror, shortcut: item.shortcut,
        disabled: item.disabled, pressed: item.pressed, onSelect: item.onClick
      })
    }
  })
  if (onAllCommands) {
    if (menuItems.length) menuItems.push({ separator: true, id: 'sep-all' })
    menuItems.push({ id: 'all-commands', label: 'כל הפקודות…', icon: 'keyboard', shortcut: allCommandsShortcut, onSelect: onAllCommands })
  }
  const moreTip = allCommandsShortcut?.length ? `כל הפקודות (${allCommandsShortcut.join('+')})` : 'כל הפקודות'

  return (
    // המכל העוטף — container query: בפאנל צר (מתחת ל-44rem, למשל 1280 בשני פאנלים) ובעכבר בלבד, הכפתורים
    // והמרווחים מעט קטנים יותר, כדי שכלי העיצוב החובה לא ייצאו ל"עוד" (במגע — 44px תמיד)
    <div className={cx('@container shrink-0 border-b border-outline-subtle bg-(--tool-strip-bg)', className)}>
    <div
      ref={rootRef}
      role="group"
      aria-label={`כלי ה${label}`}
      className="relative flex min-h-(--editor-toolbar-height) items-center gap-(--tool-group-gap) overflow-x-clip px-3 pointer-fine:@max-[44rem]:[--button-height-tool:2.125rem] pointer-fine:@max-[44rem]:[--tool-group-gap:0.5rem]"
    >
      <span aria-hidden="true" className={cx('shrink-0 whitespace-nowrap px-1 text-body-md text-on-surface-variant', !showLabel && 'hidden')}>{label}</span>
      <span className="-ms-(--tool-group-gap) min-w-0 flex-1" />
      {visible.map((g) => (
        <ToolGroup key={g.id}>
          {g.items.map((item) => <ToolItemView key={item.id} item={item} />)}
        </ToolGroup>
      ))}
      {hidden.length > 0 ? (
        <MenuButton icon="more_vert" label={`עוד כלי ${label}`} tip="עוד כלים" items={menuItems} keepFocus size="tool" />
      ) : onAllCommands ? (
        <ToolButton icon="more_vert" label="כל הפקודות" tip={moreTip} onClick={onAllCommands} keyshortcuts={toAriaKeys(allCommandsShortcut)} />
      ) : null}

      {/* העתק נסתר למדידה: כל הקבוצות ברוחבן הטבעי */}
      <div aria-hidden="true" inert className="pointer-events-none invisible absolute inset-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max items-center gap-(--tool-group-gap)">
          <span data-measure="label" className="shrink-0 whitespace-nowrap px-1 text-body-md">{label}</span>
          <span data-measure="more" className={buttonClasses({ variant: 'text', size: 'tool', iconOnly: true })} />
          {liveGroups.map((g) => (
            <ToolGroup key={g.id} data-measure-group={g.id}>
              {g.items.map((item) => <ToolItemView key={item.id} item={item} />)}
            </ToolGroup>
          ))}
        </div>
      </div>
    </div>
    </div>
  )
}

function ToolItemView({ item }) {
  if (item.render) return item.render()
  const keyshortcuts = item.keyshortcuts ?? toAriaKeys(item.shortcut)
  if (item.glyph && !item.icon) return <GlyphButton {...item} keyshortcuts={keyshortcuts} />
  return <ToolButton {...item} keyshortcuts={keyshortcuts} />
}

/**
 * קבוצת כלים קשורים: כרטיס צף בצורת גלולה — רקע --tool-group-bg, טבעת 1px וצל חם רך
 * (--tool-group-shadow; מתחזק מעט בריחוף), במקום קו הפרדה. בתוכה הריחוף כהה מהכרטיס
 * (--tool-bg-hover → --tool-group-bg-hover), אחרת surface-selected הבהיר נבלע בו.
 */
export function ToolGroup({ children, ...props }) {
  return (
    <div
      {...props}
      className="flex shrink-0 items-center gap-(--tool-gap) rounded-(--radius-pill) bg-(--tool-group-bg) p-(--tool-group-padding) shadow-(--tool-group-shadow) transition-shadow duration-200 hover:shadow-(--tool-group-shadow-hover) motion-reduce:transition-none [--tool-bg-hover:var(--tool-group-bg-hover)]"
    >
      {children}
    </div>
  )
}

/**
 * כפתור אייקון בשורת הכלים, עם רמז (כולל קיצור המקלדת, אם יש).
 * keepFocus — לא מוציא את הפוקוס מה-textarea בלחיצה (הדגשה, כותרת, ביטול).
 *
 * @param {{ icon: string, label: string, tip?: string, onClick: () => void, disabled?: boolean,
 *   pressed?: boolean, keepFocus?: boolean, keyshortcuts?: string, iconClassName?: string }} props
 */
export function ToolButton({ icon, label, tip, onClick, disabled = false, pressed, keepFocus = false, keyshortcuts, iconClassName, mirror = false }) {
  return (
    <Tooltip content={tip || label} compact>
      <Button
        variant="text"
        size="tool"
        iconOnly
        icon={icon}
        iconClassName={cx(mirror && 'rtl:-scale-x-100', iconClassName)}
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={keyshortcuts}
        disabled={disabled}
        onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
        onClick={onClick}
      />
    </Tooltip>
  )
}

/**
 * כפתור עם טקסט קצר במקום אייקון (H1–H3, B) — באותו גודל ומראה של ToolButton.
 * טקסט ולא אייקון Material: הספרות המרובעות של format_h2/format_h3 נקראו כהפוכות, ו-format_bold
 * במשקל דק לא נראה מודגש.
 */
export function GlyphButton({ glyph, glyphClassName, label, tip, onClick, disabled = false, pressed, keepFocus = false, keyshortcuts }) {
  return (
    <Tooltip content={tip || label} compact>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={keyshortcuts}
        disabled={disabled}
        onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
        onClick={onClick}
        className={buttonClasses({
          variant: 'text',
          size: 'tool',
          iconOnly: true,
          disabled,
          pressed: Boolean(pressed),
          className: 'tabular-nums'
        })}
      >
        <ToolGlyph glyph={glyph} className={glyphClassName} />
      </button>
    </Tooltip>
  )
}

/**
 * גליף טקסט של כלי: גודל --tool-glyph-size, דק (font-light) כברירת מחדל — רק "הדגשה" מקבלת
 * משקל כבד (className). dir="ltr" + unicode-bidi: isolate — "H2" לא מתהפך בשורה RTL.
 */
export function ToolGlyph({ glyph, className }) {
  return (
    <span aria-hidden="true" dir="ltr" className={cx('text-(length:--tool-glyph-size) leading-none [unicode-bidi:isolate]', className || 'font-light')}>
      {glyph}
    </span>
  )
}
