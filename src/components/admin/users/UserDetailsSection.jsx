'use client'

import { useId } from 'react'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldA11yProps, fieldClasses, fieldErrorId, fieldHintId } from '@/components/ui/fieldStyles'
import { ROLE_HINTS, rolesLabel } from '@/lib/adminUsersScreen/userTerms'
import RoleChecklist from './RoleChecklist'
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
 * "פרטים" ו"תפקידים" במגירה — הטופס עצמו (הטיוטה והשמירה ב-useUserDetails; "שמור" בתחתית המגירה).
 * שם, כתובת דואר (משמאל לימין), נקודות, ותפקידים — תיבת סימון לכל תפקיד (אפשר כמה יחד; RoleChecklist), לכל
 * תפקיד שורת הסבר (מה הוא רואה), והמסגרת מודגשת רק כשהבחירה שונה מהשמורה.
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
        <h3 id={headingIds.role} className={DRAWER_HEADING}>תפקידים</h3>
        <p className="text-body-sm text-on-surface-variant">אפשר לסמן כמה תפקידים — הוא יראה בניהול את כל מה שכל אחד מהם מתיר.</p>
        <RoleChecklist
          aria-labelledby={headingIds.role}
          value={form.roles}
          onChange={(roles) => change('roles', roles)}
          disabled={saving}
          highlight={details.changes.roles}
        />
        <p className="text-body-sm text-on-surface-variant">
          {form.roles.length === 0 ? `${rolesLabel(form.roles)} — ${ROLE_HINTS.user}` : `עכשיו: ${rolesLabel(form.roles)}.`}
          {details.changes.roles && ' לפני השמירה יוצג בדיוק מה ישתנה לו.'}
        </p>
      </section>
    </>
  )
}
