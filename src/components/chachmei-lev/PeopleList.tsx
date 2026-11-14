import { cx } from '@/components/ui/cx'
import PersonChip, { type Person } from './PersonChip'

/**
 * רשימת אנשים ברשת אחידה: כל השמות באותו שבב, עם קישור ובלעדיו (PersonChip).
 * בנייד — שלושה טורים שווים (wide: שניים, לשמות ארוכים כמו שמות המקורות); מ-sm — טורים ברוחב
 * קבוע (8rem) כמה שנכנסים, והרשת כולה ממורכזת (auto-fit מקפל טורים ריקים — שלושה שמות לא נצמדים
 * לצד אחד). gap-y-2.5 — מטרות המגע (44px) של השבבים לא חופפות.
 * תיאורים (person.description) — הערה שקטה מתחת לרשת ("שם — תיאור"), כדי שהשבבים יישארו אחידים.
 * label — שורה שקטה מעל (למשל דרגת המהדירים).
 */
export default function PeopleList({ people, label, wide = false, className }: {
  people: Person[]
  label?: string
  wide?: boolean
  className?: string
}) {
  const notes = people.filter((person) => person.description)
  return (
    <div className={cx('flex flex-col items-center gap-3', className)}>
      {label && <p className="text-center text-body-md text-on-surface-variant">{label}</p>}
      <ul
        className={cx(
          'grid w-full gap-x-2 gap-y-2.5',
          wide ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,10rem)]' : 'grid-cols-3 sm:grid-cols-[repeat(auto-fit,8rem)]',
          'sm:justify-center'
        )}
      >
        {people.map((person) => (
          <li key={`${person.name}-${person.url ?? ''}`} className="flex min-w-0">
            <PersonChip person={person} />
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="mt-1 flex flex-col items-center gap-1 text-center text-body-sm text-on-surface-variant">
          {notes.map((person) => (
            <li key={`note-${person.name}`}>
              <bdi className="text-on-surface">{person.name}</bdi> — <bdi>{person.description}</bdi>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
