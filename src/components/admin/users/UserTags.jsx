import Badge from '@/components/ui/Badge'
import { cx } from '@/components/ui/cx'
import { RESTRICTIONS, TEAM_FLAGS, roleLabel, roleTone, showsRoleTag } from '@/lib/adminUsersScreen/userTerms'

/**
 * התפקיד כתג (השם מ-ROLE_LABELS): מנהל כללי בולט, כל תפקיד ניהול אחר — ניטרלי. משתמש רגיל — בלי תג (ברירת
 * המחדל; תג בכל שורה הוא רעש): fallback, או כלום.
 */
export function RoleTag({ role, className, fallback = null }) {
  if (!showsRoleTag(role)) return fallback
  return <Badge tone={roleTone(role)} className={className}>{roleLabel(role)}</Badge>
}

const CHIP = 'inline-flex min-h-6 shrink-0 items-center whitespace-nowrap rounded-(--radius-pill) border px-2 text-label-sm'

/** צ'יפ של צוות (מסגרת שקטה) או של הגבלה (מסגרת וטקסט בצבע השגיאה, בלי רקע מלא — שקט גם בכהה) */
export function FlagChip({ team, as: Tag = 'span' }) {
  return (
    <Tag className={cx(CHIP, team.tone === 'error' ? 'border-error text-error' : 'border-outline-variant text-on-surface-variant')}>
      {team.label}
    </Tag>
  )
}

/** ההגבלות קודם (הכי חשוב לראות), אחר כך הצוותים */
const ORDER = [...RESTRICTIONS, ...TEAM_FLAGS]

/**
 * הצוותים וההגבלות של המשתמש כצ'יפים קטנים, בשורה אחת שלא נשברת: עד max מוצגים, והשאר "+1" (השמות המלאים
 * ב-title ולקורא המסך; ובמגירה הכול). lead — מה שבא לפני הצ'יפים באותה שורה (תג התפקיד, ברשימה צרה).
 * בלי אף אחד — empty.
 * @param {{ user: any, empty?: import('react').ReactNode, max?: number, lead?: import('react').ReactNode, className?: string }} props
 */
export function TeamChips({ user, empty = null, max = 2, lead = null, className }) {
  const flags = ORDER.filter((t) => user?.[t.field] === true)
  if (flags.length === 0 && !lead) return empty
  const room = Math.max(0, max - (lead ? 1 : 0))
  // לא נכנס הכול — מקום אחד הולך ל"+N"
  const keep = flags.length > room ? Math.max(room - 1, 1) : flags.length
  const shown = flags.slice(0, keep)
  const hidden = flags.slice(keep)
  return (
    <div className={cx('flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden', className)}>
      {lead}
      {flags.length > 0 && (
        <ul aria-label="צוותים והגבלות" className="flex min-w-0 flex-nowrap items-center gap-1">
          {shown.map((t) => <FlagChip key={t.id} team={t} as="li" />)}
          {hidden.length > 0 && (
            <li className={cx(CHIP, 'border-outline-variant text-on-surface-variant')} title={hidden.map((t) => t.label).join(', ')}>
              <bdi aria-hidden="true" dir="ltr">+{hidden.length}</bdi>
              <span className="sr-only">{hidden.map((t) => t.label).join(', ')}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
