'use client'

import { useId } from 'react'
import { FIELD_HINT, FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles'
import { FINISH_QUESTION_MODES, FINISH_QUESTION_MODE_LABELS, questionsFromText } from '@/lib/finishQuestions'

const MODES = [FINISH_QUESTION_MODES.BASE, FINISH_QUESTION_MODES.BASE_AND_CUSTOM, FINISH_QUESTION_MODES.CUSTOM]

/**
 * שאלות בסיום עמוד (lib/finishQuestions.js) — תיבות סימון רשות בחלון "סיום עמוד" של העורך.
 * בלי mode — שאלות הבסיס ("הנחיות כלליות"). עם mode — הגדרת ספר: אילו שאלות יוצגו, ושאלות הספר
 * (התיבה מוסתרת ב"שאלות בסיס בלבד"; שאלות שכבר נשמרו נשמרות, ורק לא מוצגות).
 *
 * @param {{ text: string, onTextChange: (text: string) => void, mode?: string,
 *   onModeChange?: (mode: string) => void, disabled?: boolean }} props
 */
export default function FinishQuestionsFields({ text, onTextChange, mode, onModeChange, disabled = false }) {
  const headingId = useId()
  const textId = useId()
  const hintId = useId()
  const isBook = mode !== undefined
  const showText = !isBook || mode !== FINISH_QUESTION_MODES.BASE
  const count = questionsFromText(text).length

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-(--radius-control) bg-surface p-4">
      <div>
        <h3 id={headingId} className="text-title-sm text-on-surface">שאלות בסיום עמוד</h3>
        <p className={FIELD_HINT}>
          {isBook
            ? 'תיבות סימון בחלון "סיום עמוד" למי שעורך עמוד בספר. הן לא חוסמות את הסיום. שאלות הבסיס מוגדרות ב"הנחיות כלליות".'
            : 'תיבות סימון בחלון "סיום עמוד" בכל הספרים, אלא אם בספר נקבע "שאלות לספר בלבד". הן לא חוסמות את הסיום.'}
        </p>
      </div>

      {isBook && (
        <fieldset disabled={disabled} className="flex flex-col gap-2">
          <legend className={FIELD_LABEL_COMPACT}>אילו שאלות יוצגו</legend>
          {MODES.map((m) => (
            <label key={m} className="flex cursor-pointer items-center gap-2 text-body-md text-on-surface">
              <input
                type="radio"
                name={`${headingId}-mode`}
                value={m}
                checked={mode === m}
                onChange={() => onModeChange?.(m)}
                className="size-4 accent-primary"
              />
              {FINISH_QUESTION_MODE_LABELS[m]}
            </label>
          ))}
        </fieldset>
      )}

      {showText ? (
        <div>
          <label htmlFor={textId} className={FIELD_LABEL_COMPACT}>
            {isBook ? 'שאלות לספר' : 'שאלות הבסיס'} <span className="font-normal text-on-surface-variant">— שורה לכל שאלה{count > 0 ? ` (${count})` : ''}</span>
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={disabled}
            aria-describedby={hintId}
            rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
            placeholder={'למשל:\nבדקתי שכל ראשי התיבות מסומנים\nעברתי על הכותרות מול הצילום'}
            className={fieldClasses({ kind: 'textarea', className: 'min-h-0 resize-y' })}
          />
          <p id={hintId} className={FIELD_HINT}>הבדיקות האוטומטיות (מילים חשודות, שורות, שמירה) מופיעות תמיד.</p>
        </div>
      ) : count > 0 && (
        <p className={FIELD_HINT}>שאלות הספר ({count}) נשמרות, אבל לא יוצגו במצב הזה.</p>
      )}
    </section>
  )
}
