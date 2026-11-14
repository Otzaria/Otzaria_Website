'use client'

import { useId } from 'react'
import Button from '@/components/ui/Button'
import { FIELD_ERROR, FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles'
import { textToItems } from '@/lib/adminBooks/instructions'

/**
 * עורך סעיפי הנחיות — משותף ל"הנחיות עריכה" של ספר ול"הנחיות כלליות": לכל סעיף כותרת ותיבת טקסט,
 * שורה בתיבה = הנחיה אחת (Enter פותח הנחיה חדשה; השורות מתפרקות רק בשמירה). "הסר סעיף" בראש כל סעיף
 * (שני השדות ברוחב מלא, באותו קו), ו"הוסף סעיף" בסוף — כפתור טקסט, כמו "הוסף קטגוריה" בלשונית הקטגוריות. untitled — סעיפים עם הנחיות ובלי כותרת: כשהכותרת נדרשת הם לא יישמרו, והשורה
 * אומרת את זה במקום שהם ייעלמו בשקט.
 *
 * @param {{ sections: { key: string, title: string, text: string }[], onChange: (next: any[]) => void,
 *   onAdd: () => void, disabled?: boolean, untitled?: string[], requireTitle?: boolean }} props
 */
export default function InstructionSectionsEditor({ sections, onChange, onAdd, disabled = false, untitled = [], requireTitle = false }) {
  const update = (key, patch) => onChange(sections.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  const remove = (key) => onChange(sections.filter((s) => s.key !== key))

  return (
    <section aria-label="סעיפים" className="flex flex-col gap-3">
      {sections.length === 0 && <p className="text-body-md text-on-surface-variant">אין סעיפים עדיין.</p>}
      {sections.map((section, index) => (
        <SectionCard
          key={section.key}
          index={index}
          section={section}
          disabled={disabled}
          missingTitle={requireTitle && untitled.includes(section.key)}
          onChange={(patch) => update(section.key, patch)}
          onRemove={() => remove(section.key)}
        />
      ))}
      <div>
        <Button variant="text" size="sm" icon="add" onClick={onAdd} disabled={disabled}>הוסף סעיף</Button>
      </div>
    </section>
  )
}

function SectionCard({ index, section, disabled, missingTitle, onChange, onRemove }) {
  const titleId = useId()
  const textId = useId()
  const errorId = useId()
  const count = textToItems(section.text).length
  const name = section.title.trim() || `סעיף ${index + 1}`
  return (
    <div className="flex flex-col gap-3 rounded-(--radius-control) bg-surface p-4">
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor={titleId} className="block text-label-md text-on-surface">כותרת הסעיף</label>
          <Button variant="text" size="sm" iconOnly icon="delete" aria-label={`הסר את ${name}`} onClick={onRemove} disabled={disabled} className="-my-2 -me-2" />
        </div>
        <div>
          <input
            id={titleId}
            type="text"
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={disabled}
            placeholder="למשל: כללי, פיסוק, שמירה"
            aria-invalid={missingTitle || undefined}
            aria-describedby={missingTitle ? errorId : undefined}
            className={fieldClasses({ invalid: missingTitle })}
          />
        </div>
      </div>
      {missingTitle && <p id={errorId} className={`${FIELD_ERROR} -mt-1`}>סעיף בלי כותרת לא יישמר. כתוב כותרת, או הסר אותו.</p>}
      <div>
        <label htmlFor={textId} className={FIELD_LABEL_COMPACT}>
          ההנחיות <span className="font-normal text-on-surface-variant">— שורה לכל הנחיה{count > 0 ? ` (${count})` : ''}</span>
        </label>
        <textarea
          id={textId}
          value={section.text}
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={disabled}
          rows={Math.min(12, Math.max(4, section.text.split('\n').length + 1))}
          className={fieldClasses({ kind: 'textarea', className: 'min-h-0 resize-y' })}
        />
      </div>
    </div>
  )
}
