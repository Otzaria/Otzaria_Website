'use client'

import { useId } from 'react'
import SelectMenu from '@/components/ui/SelectMenu'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldA11yProps, fieldClasses, fieldErrorId, fieldHintId } from '@/components/ui/fieldStyles'
import { ROLE_HINTS, ROLE_OPTIONS } from '@/lib/adminUsersScreen/userTerms'
import { DRAWER_HEADING, DRAWER_SECTION } from './drawerStyles'

function TextField({ label, value, onChange, error, hint, disabled, type = 'text', dir, inputMode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>{label}</label>
      <input
        {...fieldA11yProps(id, { hint: Boolean(hint), error })}
        type={type}
        dir={dir}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={fieldClasses({ invalid: Boolean(error), className: dir === 'ltr' ? 'text-start' : undefined })}
      />
      {hint && <p id={fieldHintId(id)} className={FIELD_HINT}>{hint}</p>}
      {error && <p id={fieldErrorId(id)} role="alert" className={FIELD_ERROR}>{error}</p>}
    </div>
  )
}

/**
 * "פרטים" ו"תפקיד" במגירה — הטופס עצמו (הטיוטה והשמירה ב-useUserDetails; "שמור" בתחתית המגירה).
 * שם, כתובת דואר (משמאל לימין), נקודות, ותפקיד בבורר: לכל תפקיד שורת הסבר (מה הוא רואה), והמסגרת
 * מודגשת רק כשהתפקיד שונה מהשמור.
 *
 * @param {{ details: ReturnType<typeof import('./useUserDetails').useUserDetails>, headingIds: { details: string, role: string } }} props
 */
export default function UserDetailsSection({ details, headingIds }) {
  const { form, change, errors, saving } = details
  return (
    <>
      <section aria-labelledby={headingIds.details} className={DRAWER_SECTION}>
        <h3 id={headingIds.details} className={DRAWER_HEADING}>פרטים</h3>
        <TextField label="שם" value={form.name} onChange={(v) => change('name', v)} error={errors.name} disabled={saving} />
        <TextField
          label="כתובת דואר"
          type="email"
          dir="ltr"
          value={form.email}
          onChange={(v) => change('email', v)}
          error={errors.email}
          hint={details.changes.email ? 'אחרי השמירה הכתובת תסומן כלא מאומתת.' : undefined}
          disabled={saving}
        />
        <TextField label="נקודות" inputMode="numeric" dir="ltr" value={form.points} onChange={(v) => change('points', v)} error={errors.points} disabled={saving} />
      </section>

      <section aria-labelledby={headingIds.role} className={DRAWER_SECTION}>
        <h3 id={headingIds.role} className={DRAWER_HEADING}>תפקיד</h3>
        <SelectMenu
          label="תפקיד"
          hideLabel
          options={ROLE_OPTIONS}
          value={form.role}
          onChange={(v) => change('role', v || 'user')}
          disabled={saving}
          searchable={false}
          highlight={details.changes.role}
        />
        <p className="text-body-sm text-on-surface-variant">
          {ROLE_HINTS[form.role]}
          {details.changes.role && ' לפני השמירה יוצג בדיוק מה ישתנה לו.'}
        </p>
      </section>
    </>
  )
}
