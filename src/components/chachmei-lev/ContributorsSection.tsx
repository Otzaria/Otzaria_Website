import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { ESSENTIAL_PEOPLE } from '@/lib/chachmei-lev-data'
import PeopleList from './PeopleList'

/** "תרמו מהונם ומזמנם" — בתוכנה בתוך כרטיס התורמים, מתחת ללוח ההנצחה */
export default function ContributorsSection() {
  return (
    <Section id="contributors" labelledBy="contributors-heading" anchor spacing="top" container="narrow">
      <SectionHeading id="contributors-heading" title="תרמו מהונם ומזמנם" />
      <PeopleList people={ESSENTIAL_PEOPLE} icon="volunteer_activism" />
    </Section>
  )
}
