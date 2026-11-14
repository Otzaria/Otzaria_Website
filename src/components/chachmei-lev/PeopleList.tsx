import { cx } from '@/components/ui/cx'
import PersonChip, { type Person } from './PersonChip'

/**
 * רשימת אנשים ברשת אחידה: כל השמות באותו שבב, עם קישור ובלעדיו (PersonChip).
 * בנייד — שלושה טורים שווים (שניים ל-wide, או כשיש תיאורים); מ-sm — טורים ברוחב קבוע כמה
 * שנכנסים, והרשת כולה ממורכזת (auto-fit מקפל טורים ריקים — שלושה שמות לא נצמדים לצד אחד).
 * תיאורים (person.description) — שורה שנייה קטנה בתוך השבב, מתחת לשם. כשיש ברשימה תיאור
 * כלשהו, כל השבבים בה בגובה שתי שורות וברוחב טור רחב יותר — כך כולם באותו גודל בדיוק.
 * gap-y-2.5 — מטרות המגע (44px) של השבבים לא חופפות.
 * label — שורה שקטה מעל (למשל דרגת המהדירים).
 */
export default function PeopleList({ people, label, wide = false, className }: {
  people: Person[]
  label?: string
  wide?: boolean
  className?: string
}) {
  const twoLine = people.some((person) => person.description)
  const columns = twoLine
    ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,11rem)]'
    : wide
      ? 'grid-cols-2 sm:grid-cols-[repeat(auto-fit,10rem)]'
      : 'grid-cols-3 sm:grid-cols-[repeat(auto-fit,8rem)]'
  return (
    <div className={cx('flex flex-col items-center gap-3', className)}>
      {label && <p className="text-center text-body-md text-on-surface-variant">{label}</p>}
      <ul className={cx('grid w-full gap-x-2 gap-y-2.5 sm:justify-center', columns)}>
        {people.map((person) => (
          <li key={`${person.name}-${person.url ?? ''}`} className="flex min-w-0">
            <PersonChip person={person} twoLine={twoLine} />
          </li>
        ))}
      </ul>
    </div>
  )
}
