import { useId } from 'react'
import { cx } from '@/components/ui/cx'
import { PROOFREADING_OPTION_KEYS } from '@/lib/ocr/proofreadingOptions'
import { LOCAL_LM_OPTIONS, LOCAL_SCRIPT_OPTIONS, LOCAL_SENSITIVITY_OPTIONS } from './ocrJobView'

/**
 * הגדרות העיבוד במחשב המקומי: מודל שפה (lm) וכתב ברירת מחדל (defaultScript).
 * הערכים חייבים להתאים ל-whitelist בשרת (LOCAL_OPTION_VALUES ב-localJobCreate.pure.js).
 *
 * @param {{ value: {lm:string, defaultScript:string}, onChange: (next:{lm:string, defaultScript:string}) => void, disabled?: boolean }} props
 */
export default function LocalOcrOptions({ value, onChange, disabled = false, capabilities }) {
  const lmName = useId()
  const scriptName = useId()
  const sensitivityName = useId()
  const advanced = capabilities?.state === 'available'
  const supportsLm = advanced && capabilities.lmCheck
  const supportsAlts = advanced && capabilities.alternatives
  const supportsSensitivity = advanced && capabilities.sensitivity === true
  const lexicons = advanced && capabilities.lexiconAvailable ? capabilities.lexicons || [] : []
  const inheritLexicons = () => { const next = { ...value }; delete next.lexicons; onChange(next) }
  // "normal" is the pipeline default: it is sent as an absent key, so the job keeps the legacy envelope.
  const setSensitivity = (s) => { const next = { ...value }; if (s === 'normal') delete next.sensitivity; else next.sensitivity = s; onChange(next) }

  return (
    <div className="space-y-4">
      <fieldset disabled={disabled}>
        <legend className="mb-2 text-title-sm text-on-surface">{supportsLm ? 'תחום הספר' : 'מודל שפה'}</legend>
        <div className="grid grid-cols-3 gap-2">
          {LOCAL_LM_OPTIONS.filter((opt) => !supportsLm || opt.value !== 'off' || value.lm === 'off').map((opt) => (
            <OptionCard
              key={opt.value}
              name={lmName}
              checked={value.lm === opt.value}
              onSelect={() => onChange({ ...value, lm: opt.value, ...(opt.value === 'modern' && value.alts === 'on' ? { alts: 'off' } : {}) })}
              label={opt.label}
              desc={supportsLm && opt.value === 'rabbinic' ? 'ספרות תורנית' : opt.desc}
            />
          ))}
        </div>
      </fieldset>

      {supportsLm && <label className="flex items-start gap-2 text-body-sm text-on-surface">
        <input type="checkbox" checked={value.lm !== 'off' && value.lmCheck !== 'off'} disabled={disabled}
          onChange={(e) => onChange({ ...value, lm: value.lm === 'off' ? 'rabbinic' : value.lm, lmCheck: e.target.checked ? 'on' : 'off' })} />
        בדיקה באמצעות מודל השפה
      </label>}
      {supportsAlts && <div>
        <label className="flex items-start gap-2 text-body-sm text-on-surface">
          <input type="checkbox" checked={value.alts === 'on'}
            disabled={disabled || value.lm === 'modern' || !capabilities.contextAvailable || !capabilities.lexiconAvailable}
            onChange={(e) => onChange({ ...value, alts: e.target.checked ? 'on' : 'off' })} />
          חלופות למילים חשודות לפי ההקשר בספרייה
        </label>
        <p className="mt-1 text-label-sm text-on-surface-variant">{value.lm === 'modern'
          ? 'ההגהה לפי הספרייה מיועדת לספרות תורנית ואינה מופעלת בתחום המודרני.'
          : !capabilities.contextAvailable || !capabilities.lexiconAvailable
            ? 'ספריית ההקשר אינה זמינה כרגע במחשב המקומי.'
            : 'כבוי כברירת מחדל. חישוב ראשון עשוי להוסיף 7–25 דקות; הטקסט משתנה רק בבחירה שלכם.'}</p>
      </div>}
      {supportsSensitivity && <fieldset disabled={disabled}>
        <legend className="mb-2 text-title-sm text-on-surface">רגישות ההגהה</legend>
        <div className="grid grid-cols-2 gap-2">
          {LOCAL_SENSITIVITY_OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              name={sensitivityName}
              checked={(value.sensitivity || 'normal') === opt.value}
              onSelect={() => setSensitivity(opt.value)}
              label={opt.label}
              desc={opt.desc}
            />
          ))}
        </div>
      </fieldset>}
      {advanced && capabilities.lexiconAvailable && <fieldset disabled={disabled}>
        <legend className="mb-2 text-title-sm text-on-surface">מילונים נוספים לספר</legend>
        <select aria-label="בחירת מילונים נוספים" value={!Object.hasOwn(value, 'lexicons') ? 'default' : value.lexicons.length ? 'custom' : 'none'}
          className="rounded-control border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface"
          onChange={(e) => e.target.value === 'default' ? inheritLexicons() : onChange({ ...value, lexicons: e.target.value === 'none' ? [] : lexicons.slice(0, 1).map((item) => item.name) })}>
          <option value="default">ברירת המחדל במחשב המקומי</option>
          <option value="none">ללא מילונים נוספים</option>
          {!!lexicons.length && <option value="custom">בחירה לספר הזה</option>}
        </select>
        {value.lexicons?.length > 0 && <div className="mt-2 flex flex-wrap gap-3">{lexicons.map((item) => <label key={item.name} className="flex items-center gap-2 text-body-sm">
          <input type="checkbox" checked={value.lexicons.includes(item.name)} disabled={disabled || (!value.lexicons.includes(item.name) && value.lexicons.length >= 16)}
            onChange={(e) => onChange({ ...value, lexicons: e.target.checked ? [...value.lexicons, item.name].sort() : value.lexicons.filter((n) => n !== item.name) })} />
          {item.name}
        </label>)}</div>}
        <p className="mt-1 text-label-sm text-on-surface-variant">מילון נוסף עשוי להפחית התרעות וגם להסתיר שגיאות; בחרו רק מילון שמתאים לספר.</p>
      </fieldset>}
      {!advanced && <p className="text-label-sm text-on-surface-variant">{capabilities?.state === 'stale'
        ? 'דיווח יכולות ההגהה התיישן. ההגדרות הנוספות יהיו זמינות אחרי חיבור המחשב.'
        : 'הגדרות הגהה נוספות יופיעו אחרי שהמחשב המקומי ידווח על תמיכה בהן.'}</p>}
      {!advanced && PROOFREADING_OPTION_KEYS.some((key) => Object.hasOwn(value, key)) && <button type="button"
        disabled={disabled} className="text-body-sm text-primary underline underline-offset-2"
        onClick={() => onChange({ lm: value.lmCheck === 'off' ? 'off' : value.lm, defaultScript: value.defaultScript })}>
        חזור להגדרות הזיהוי הבסיסיות
      </button>}

      <fieldset disabled={disabled}>
        <legend className="mb-2 text-title-sm text-on-surface">כתב ברירת מחדל</legend>
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
        <span className="block text-label-md font-medium text-on-surface">{label}</span>
        {desc && <span className="block text-label-sm font-normal text-on-surface-variant">{desc}</span>}
      </span>
    </label>
  )
}
