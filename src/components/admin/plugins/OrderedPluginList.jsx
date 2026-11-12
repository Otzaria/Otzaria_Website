'use client'

import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import SelectMenu from '@/components/ui/SelectMenu'
import { cx } from '@/components/ui/cx'
import { hiddenReason, moveItem, movedNotice, reorderList } from '@/lib/adminPlugins/storeLayout'
import PluginThumb from './PluginThumb'
import { useReorderFocus } from './useReorderFocus'

/**
 * גרירה לרשימה אנכית — HTML5, בלי ספרייה. כפתורי ↑ ↓ נשארים לצידה (מקלדת וקורא מסך).
 * מחזיר props לכל פריט לפי האינדקס.
 */
export function useDragReorder(onReorder) {
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null)
  const reset = () => { setDrag(null); setOver(null) }
  return (index) => ({
    draggable: true,
    onDragStart: (e) => { setDrag(index); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== index) setOver(index) },
    onDrop: (e) => { e.preventDefault(); if (drag !== null && drag !== index) onReorder(drag, index); reset() },
    onDragEnd: reset,
    'data-dragging': drag === index ? '' : undefined,
    className: cx(
      'cursor-grab active:cursor-grabbing',
      drag === index && 'opacity-40',
      over === index && drag !== null && drag !== index && 'outline-2 -outline-offset-2 outline-primary'
    ),
  })
}

/**
 * ↑ ↓ של שורה ברשימה מסודרת. busy — בקשה באוויר: הכפתורים לא מגיבים, אבל לא disabled, כדי שהפוקוס לא
 * ייפול לראש העמוד בכל לחיצה. בקצה הרשימה הכפתור מושבת באמת (והפוקוס עובר להפוך — useReorderFocus).
 * @param {{ name: string, index: number, count: number, disabled?: boolean, busy?: boolean, onMove: (direction: -1 | 1) => void }} props
 */
export function ReorderButtons({ name, index, count, disabled = false, busy = false, onMove }) {
  const button = (direction, control, icon, label, atEdge) => (
    <Button
      variant="text"
      size="sm"
      icon={icon}
      iconOnly
      data-reorder={control}
      aria-label={`${label}: ${name}`}
      aria-disabled={busy || undefined}
      disabled={disabled || atEdge}
      onClick={() => { if (!busy) onMove(direction) }}
    />
  )
  return (
    <>
      {button(-1, 'up', 'arrow_upward', 'הזז למעלה', index === 0)}
      {button(1, 'down', 'arrow_downward', 'הזז למטה', index === count - 1)}
    </>
  )
}

const SURFACES = { background: 'bg-background', surface: 'bg-surface' }

/**
 * רשימה מסודרת של תוספים (הנבחרים בדף הבית, או התוספים בקטגוריה): גרירה, ↑ ↓, "הסר", ו"הוסף תוסף"
 * (בורר עם חיפוש מתוך התוספים שבחנות). תוסף שלא יוצג בפועל (מושהה / מוסתר) — מסומן ולמה.
 * dividerAfter — קו "מכאן ומטה: לפי הדירוג" אחרי N הראשונים (קטגוריה עם סדר לפי דירוג).
 * reorderable=false — הסדר לא משפיע על מה שמוצג: בלי גרירה ובלי חצים (הוספה והסרה נשארות).
 * surface — צבע הרשימה מול מה שמתחתיה: background בתוך כרטיס, surface במגירה.
 *
 * @param {{ items: any[], onChange: (next: any[]) => void, options: any[], label: string, addLabel: string,
 *   emptyText: string, dividerAfter?: number, disabled?: boolean, reorderable?: boolean, surface?: 'background' | 'surface' }} props
 */
export default function OrderedPluginList({ items, onChange, options, label, addLabel, emptyText, dividerAfter = 0, disabled = false, reorderable = true, surface = 'background' }) {
  const { rootRef, notice, announce } = useReorderFocus()
  const move = (index, target, direction) => {
    const next = direction ? moveItem(items, index, direction) : reorderList(items, index, target)
    onChange(next)
    const plugin = items[index]
    // גרירה (בלי direction) — רק הכרזה: הפוקוס שייך לעכבר
    announce(movedNotice(plugin.name, target, items.length), direction ? { id: plugin.id, control: direction < 0 ? 'up' : 'down', fallback: direction < 0 ? 'down' : 'up' } : null)
  }
  const remove = (index) => {
    const neighbor = items[index + 1] || items[index - 1]
    onChange(items.filter((_, i) => i !== index))
    announce(`״${items[index].name}״ הוסר מהרשימה`, { id: neighbor?.id, control: 'remove' })
  }
  const dnd = useDragReorder((from, to) => move(from, to, 0))
  const taken = new Set(items.map((p) => p.id))
  const addOptions = options.filter((p) => !taken.has(p.id)).map((p) => ({ value: p.id, label: p.name }))

  return (
    <div ref={rootRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <p role="status" className="sr-only">{notice}</p>
      {items.length === 0 ? (
        <p className="rounded-(--radius-control) bg-surface-container-low p-4 text-center text-body-md text-on-surface-variant">{emptyText}</p>
      ) : (
        <ol aria-label={label} className={cx('flex flex-col divide-y divide-outline-variant/60 overflow-hidden rounded-(--radius-control)', SURFACES[surface])}>
          {items.map((plugin, index) => {
            const reason = hiddenReason(plugin)
            const drag = disabled || !reorderable ? {} : dnd(index)
            return (
              <li key={plugin.id} {...drag} data-reorder-row={plugin.id} className={cx('flex min-h-16 items-center gap-1 px-1 sm:px-2', drag.className)}>
                {reorderable && <AppIcon name="drag_indicator" className="shrink-0 text-icon-lg text-on-surface-variant max-sm:hidden" />}
                {reorderable && <span className="w-6 shrink-0 text-center text-label-md tabular-nums text-on-surface-variant">{index + 1}</span>}
                <PluginThumb plugin={{ _id: plugin.id }} hasImage={Boolean(plugin.image)} className="ms-1" />
                <span className="min-w-0 flex-1 px-2 py-2">
                  <span className="block text-title-sm text-on-surface [overflow-wrap:anywhere]">{plugin.name}</span>
                  {reason && <Badge tone="warning" className="mt-0.5">{reason}</Badge>}
                  {dividerAfter > 0 && index === dividerAfter - 1 && index < items.length - 1 && (
                    <span className="mt-1 block text-label-sm text-on-surface-variant">מכאן ומטה: לפי הדירוג</span>
                  )}
                </span>
                {reorderable && <ReorderButtons name={plugin.name} index={index} count={items.length} disabled={disabled} onMove={(direction) => move(index, index + direction, direction)} />}
                <Button variant="text" size="sm" icon="close" iconOnly data-reorder="remove" aria-label={`הסר: ${plugin.name}`} disabled={disabled} onClick={() => remove(index)} />
              </li>
            )
          })}
        </ol>
      )}
      <div>
        <SelectMenu
          variant="action"
          label={addLabel}
          triggerText={addLabel}
          icon="add"
          searchable
          searchPlaceholder="חפש תוסף"
          emptyText="אין תוסף בשם הזה"
          options={addOptions}
          value={null}
          disabled={disabled || addOptions.length === 0}
          onChange={(id) => {
            const plugin = options.find((p) => p.id === id)
            if (plugin) onChange([...items, plugin])
          }}
        />
      </div>
    </div>
  )
}
