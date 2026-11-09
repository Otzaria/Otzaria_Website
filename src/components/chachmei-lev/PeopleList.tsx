import { cx } from '@/components/ui/cx'
import PersonChip, { type Person } from './PersonChip'

/**
 * רשימת אנשים כשבבים ממורכזים — לסריקה מהירה במקום קיר טקסט. label — שורה שקטה מעל
 * (למשל דרגת המהדירים). gap-y-2.5 — מטרות המגע של השבבים לא חופפות.
 */
export default function PeopleList({ people, label, icon, className }: {
  people: Person[]
  label?: string
  icon?: string
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-center gap-3', className)}>
      {label && <p className="text-center text-body-md text-on-surface-variant">{label}</p>}
      <ul className="flex flex-wrap justify-center gap-x-2 gap-y-2.5">
        {people.map((person) => (
          <li key={`${person.name}-${person.url ?? ''}`} className="max-w-full">
            <PersonChip person={person} icon={icon} />
          </li>
        ))}
      </ul>
    </div>
  )
}
