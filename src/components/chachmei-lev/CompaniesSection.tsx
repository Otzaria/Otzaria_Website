import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { COMPANY_MAILTO, COMPANY_OPEN_SLOT, SPONSOR_COMPANIES } from '@/lib/chachmei-lev-data'
import CompanyCard from './CompanyCard'
import OpenSlotCard from './OpenSlotCard'

/**
 * חברות שתרמו: רשת לוגואים ממורכזת (כרטיסים מרובעים קטנים ברוחב קבוע) ובסופה משבצת פנויה לדף התרומה.
 * חברה חדשה = שורה ב-SPONSOR_COMPANIES (src/lib/chachmei-lev-data.js) + קובץ לוגו ב-public/sponsors.
 */
export default function CompaniesSection() {
  return (
    <Section id="companies" labelledBy="companies-heading" anchor spacing="top">
      <SectionHeading id="companies-heading" title="חברות שתרמו" />
      {/* flex ממורכז ולא grid: כשיש מעט חברות הרשת לא נצמדת לצד אחד */}
      <ul className="flex flex-wrap justify-center gap-3 sm:gap-4 [&>li]:aspect-square [&>li]:w-40 sm:[&>li]:w-44">
        {SPONSOR_COMPANIES.map((company) => <CompanyCard key={company.url} company={company} />)}
        <OpenSlotCard title={COMPANY_OPEN_SLOT} cta="שלח מייל" href={COMPANY_MAILTO} icon="add" padding="sm" />
      </ul>
    </Section>
  )
}
