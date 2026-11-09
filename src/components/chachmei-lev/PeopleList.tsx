import { cx } from '@/components/ui/cx'
import PersonChip, { type Person } from './PersonChip'

/**
 * רשימת אנשים ממורכזת — לסריקה מהירה במקום קיר טקסט: שבב לכל מי שיש לו קישור, ושם שטוח למי
 * שאין. label — שורה שקטה מעל (למשל דרגת המהדירים). gap-y-2.5 — מטרות המגע של השבבים לא חופפות.
 */
export default function PeopleList({ people, label, className }: {
  people: Person[]
  label?: string
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-center gap-3', className)}>
      {label && <p className="text-center text-body-md text-on-surface-variant">{label}</p>}
      <ul className="flex flex-wrap justify-center gap-x-2 gap-y-2.5">
        {people.map((person) => (
          <li key={`${person.name}-${person.url ?? ''}`} className="max-w-full">
            <PersonChip person={person} />
          </li>
        ))}
      </ul>
    </div>
  )
}
