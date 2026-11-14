'use client'

import { useId } from 'react'
import CheckRow from '@/components/ui/CheckRow'
import { cx } from '@/components/ui/cx'
import { ASSIGNABLE_ROLE_IDS, ROLE_HINTS, roleLabel, toggleRole } from '@/lib/adminUsersScreen/userTerms'

/**
 * בחירת התפקידים של משתמש — תיבת סימון לכל תפקיד, ומתחתיה מה הוא רואה בניהול. אפשר לסמן כמה תפקידים יחד
 * (למשל מנהל ספרים + מנהל OCR): המשתמש יראה את האיחוד שלהם. מנהל כללי כולל את כל השאר — כשהוא מסומן,
 * שאר התיבות כבויות (toggleRole משאיר אותו לבדו). בלי אף סימון — משתמש רגיל.
 * highlight — המסגרת מודגשת (הבחירה שונה מהשמורה).
 *
 * @param {{ value: string[], onChange: (roles: string[]) => void, disabled?: boolean, highlight?: boolean,
 *   'aria-labelledby'?: string }} props
 */
export default function RoleChecklist({ value, onChange, disabled = false, highlight = false, 'aria-labelledby': labelledBy }) {
  const baseId = useId()
  const isGeneralAdmin = value.includes('admin')
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={cx('flex flex-col rounded-(--radius-control) border px-3 py-1', highlight ? 'border-primary' : 'border-outline-variant')}
    >
      {ASSIGNABLE_ROLE_IDS.map((role) => {
        const labelId = `${baseId}-${role}-label`
        const hintId = `${baseId}-${role}-hint`
        const covered = isGeneralAdmin && role !== 'admin'
        return (
          <CheckRow
            key={role}
            checked={value.includes(role)}
            onChange={(on) => onChange(toggleRole(value, role, on))}
            disabled={disabled || covered}
            // השם — שם התפקיד בלבד; ההסבר (מה הוא רואה) — תיאור, ולא חלק מהשם
            aria-labelledby={labelId}
            aria-describedby={hintId}
            className="py-1"
          >
            <span id={labelId} className="block text-body-md">{roleLabel(role)}</span>
            <span id={hintId} className="block text-body-sm text-on-surface-variant">
              {covered ? 'כלול במנהל כללי.' : ROLE_HINTS[role]}
            </span>
          </CheckRow>
        )
      })}
    </div>
  )
}
