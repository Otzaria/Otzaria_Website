import { useId } from 'react'
import { cx } from '@/components/ui/cx'
import { LOCAL_LM_OPTIONS, LOCAL_SCRIPT_OPTIONS } from './ocrJobView'

/**
 * הגדרות העיבוד במחשב המקומי: מודל שפה (lm) וכתב ברירת מחדל (defaultScript).
 * הערכים חייבים להתאים ל-whitelist בשרת (LOCAL_OPTION_VALUES ב-localJobCreate.pure.js).
 *
 * @param {{ value: {lm:string, defaultScript:string}, onChange: (next:{lm:string, defaultScript:string}) => void, disabled?: boolean }} props
 */
export default function LocalOcrOptions({ value, onChange, disabled = false }) {
  const lmName = useId()
  const scriptName = useId()

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-bold text-on-surface">מודל שפה</legend>
        <div className="grid grid-cols-3 gap-2">
          {LOCAL_LM_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              name={lmName}
              checked={value.lm === opt.value}
              onSelect={() => onChange({ ...value, lm: opt.value })}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-2 text-sm font-bold text-on-surface">כתב ברירת מחדל</legend>
        <div className="grid grid-cols-2 gap-2">
          {LOCAL_SCRIPT_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              name={scriptName}
              checked={value.defaultScript === opt.value}
              onSelect={() => onChange({ ...value, defaultScript: opt.value })}
              label={opt.label}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function OptionCard({ name, checked, onSelect, label, desc }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-2 rounded-control border p-2.5 transition-colors',
        checked ? 'border-primary bg-surface-selected' : 'border-outline-variant hover:border-outline'
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 size-4 accent-primary" />
      <span>
        <span className="block text-sm font-medium text-on-surface">{label}</span>
        {desc && <span className="block text-xs text-on-surface-variant">{desc}</span>}
      </span>
    </label>
  )
}
