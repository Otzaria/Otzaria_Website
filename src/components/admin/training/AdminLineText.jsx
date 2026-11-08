'use client'

import { useId, useMemo, useState } from 'react'
import AutoGrowTextarea from '@/components/ocr/AutoGrowTextarea'
import Button from '@/components/ui/Button'
import { fieldClasses } from '@/components/ui/fieldStyles'
import { findForbidden, normalizeLineText } from '@/lib/ocr/textStandard'

/**
 * טקסט השורה, לעריכה בידי המנהל (כמו אצל המתמלל): "שמור" מופיע רק כשהטקסט שונה מהשמור, ואותם כללי תקן נאכפים
 * בזמן ההקלדה (תווים לא מותרים — רשימה מתחת לשדה). Enter שומר (וכשיש שינוי — רמז על כך מתחת לשדה). הלוגיקה כמו
 * במסך הקודם; רק המראה חדש. onTextChange — כל שינוי בשדה (כדי שהכרטיס ידע שיש עריכה שלא נשמרה).
 * @param {{ line: { id: string, text?: string }, onSave: (line: any, text: string) => Promise<void>, onTextChange?: (text: string) => void,
 *   label: string, disabled?: boolean }} props
 */
export default function AdminLineText({ line, onSave, onTextChange, label, disabled = false }) {
  const hintId = useId()
  const errorId = useId()
  const [text, setText] = useState(line.text || '')
  const [saving, setSaving] = useState(false)
  // סנכרון כשהשורה מתעדכנת מבחוץ (למשל אחרי שמירה מוצלחת) — בזמן הרינדור, לא ב-effect
  const [synced, setSynced] = useState(line.text || '')
  if (synced !== (line.text || '')) {
    setSynced(line.text || '')
    setText(line.text || '')
  }

  const forbidden = useMemo(() => findForbidden(text), [text])
  const dirty = text !== (line.text || '')
  const canSave = dirty && !saving && !disabled && forbidden.length === 0 && !!normalizeLineText(text)

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(line, text)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-start gap-2">
        <AutoGrowTextarea
          dir="rtl"
          aria-label={label}
          aria-describedby={forbidden.length > 0 ? errorId : dirty ? hintId : undefined}
          aria-invalid={forbidden.length > 0 || undefined}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value)
            onTextChange?.(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
          className={fieldClasses({ kind: 'textarea', invalid: forbidden.length > 0, className: 'min-h-0! w-full resize-none py-2 text-title-md' })}
        />
        {dirty && (
          <Button variant="tonal" size="sm" icon="save" onClick={save} disabled={!canSave} loading={saving} className="shrink-0">
            שמור
          </Button>
        )}
      </div>
      {dirty && forbidden.length === 0 && <p id={hintId} className="text-body-sm text-on-surface-variant">Enter — שמור</p>}
      {forbidden.length > 0 && (
        <p id={errorId} className="flex flex-wrap items-center gap-1 text-body-sm text-error">
          תווים לא מותרים:
          {forbidden.map((c) => (
            <bdi key={c} className="rounded-(--radius-xs) bg-error-container px-1.5 font-mono text-on-error-container">{c}</bdi>
          ))}
        </p>
      )}
    </div>
  )
}
