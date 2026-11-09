import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { DEVELOPERS } from '@/lib/chachmei-lev-data'
import PeopleList from './PeopleList'

/**
 * "אודות פיתוח התוכנה": המפתחים, כל אחד עם קישור ל-GitHub. שורת "משוב ותמיכה" של התוכנה
 * (דיווח תקלה, כניסה לפורום) הושמטה בכוונה — לפורום יש קישור בכותרת האתר, והיא אינה מנושא הדף.
 */
export default function DevelopersSection() {
  return (
    <Section id="developers" labelledBy="developers-heading" anchor spacing="top" container="narrow">
      <SectionHeading id="developers-heading" title="אודות פיתוח התוכנה" subtitle="מפתחי התוכנה" />
      <PeopleList people={DEVELOPERS} icon="code" />
    </Section>
  )
}
