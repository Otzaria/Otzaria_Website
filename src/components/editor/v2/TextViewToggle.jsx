'use client'

import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'

/** מה הכפתור מציג בכל מצב — את היעד (הפעולה), לא את המצב הנוכחי */
export const TEXT_VIEW_TARGETS = {
  rich: { label: 'קוד', icon: 'code' },
  code: { label: 'עיצוב', icon: 'format_paragraph' }
}

/**
 * כפתור-מתג יחיד להחלפת תצוגת הטקסט בשורת הכלים: בתצוגה המעוצבת מציג "קוד" (מעבר לתצוגת הקוד),
 * ובתצוגת הקוד — "עיצוב" (חזרה). השם הנגיש קבוע ("תצוגת קוד") ו-aria-pressed מסמן אם תצוגת הקוד פעילה.
 * לא לוקח את הפוקוס מהשדה (כדי שהסמן יחזור למקומו בתצוגה החדשה — useTextViewToggle).
 * בפאנל רחב (container query על שורת הכלים, ≥52rem) — אייקון ומילה; בצר — אייקון בלבד.
 *
 * @param {{ value?: 'rich'|'code', onToggle: () => void, tip: string, keyshortcuts?: string }} props
 */
export default function TextViewToggle({ value = 'rich', onToggle, tip, keyshortcuts }) {
  const isCode = value === 'code'
  const target = TEXT_VIEW_TARGETS[isCode ? 'code' : 'rich']
  const common = {
    variant: /** @type {const} */ ('text'),
    size: /** @type {const} */ ('tool'),
    icon: target.icon,
    'aria-label': 'תצוגת קוד',
    'aria-pressed': isCode,
    'aria-keyshortcuts': keyshortcuts,
    onMouseDown: (event) => event.preventDefault(),
    onClick: onToggle
  }
  return (
    <>
      <span className="contents @max-[52rem]:hidden">
        <Tooltip content={tip} compact>
          <Button {...common}>{target.label}</Button>
        </Tooltip>
      </span>
      <span className="hidden @max-[52rem]:contents">
        <Tooltip content={tip} compact>
          <Button {...common} iconOnly />
        </Tooltip>
      </span>
    </>
  )
}
