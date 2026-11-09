import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { ESSENTIAL_PEOPLE } from '@/lib/chachmei-lev-data'
import PeopleList from './PeopleList'

/**
 * "תרמו מהונם ומזמנם" — בתוכנה בתוך כרטיס התורמים, מתחת ללוח ההנצחה. כאן ממשיך את "חברות
 * שתרמו" שמעליו: שלושה שמות בלבד, ולכן כותרת בגודל משנה (size="md") ומרווח עליון קצר — שני
 * הנושאים נקראים כאזור אחד של תורמים, בלי כותרת ענק לשורה קצרה.
 */
export default function ContributorsSection() {
  return (
    <Section id="contributors" labelledBy="contributors-heading" anchor spacing="none" container="narrow" className="pt-10 md:pt-12">
      <SectionHeading id="contributors-heading" title="תרמו מהונם ומזמנם" size="md" className="mb-5 md:mb-6" spacing="none" />
      <PeopleList people={ESSENTIAL_PEOPLE} />
    </Section>
  )
}
