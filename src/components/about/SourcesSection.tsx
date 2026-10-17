import InfoCard from '@/components/ui/InfoCard'
import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import MoreSourcesCard from './MoreSourcesCard'

/**
 * "מקורות הספרים": ארבעה כרטיסים ברשת (טור אחד בנייד, שניים מ-md) — ספריא, דיקטה, מקורות נוספים
 * ופרויקט ה-OCR, באותו סדר כמו בטקסט המקורי.
 */
export default function SourcesSection() {
  return (
    <Section labelledBy="sources-heading" spacing="top">
      <SectionHeading id="sources-heading" title="מקורות הספרים" />
      <ul className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <InfoCard as="li" className="h-full" icon="public" title="ספריא (Sefaria)">
          מארה&quot;ב - הספרים ממאגר זה עברו סינון קפדני להסרת ספרים שאינם מתאימים לציבור התורני.
        </InfoCard>
        <InfoCard as="li" className="h-full" icon="edit_document" title="דיקטה">
          מקור משמעותי נוסף - ספרים אלו עברו עריכה עבור התאמתם ל&quot;אוצריא&quot;.
        </InfoCard>
        <MoreSourcesCard as="li" className="h-full" />
        <InfoCard as="li" className="h-full" icon="auto_awesome" title="פרויקט OCR + AI">
          המרה של ספרים מצולמים מאתר <strong className="font-bold text-on-surface">HebrewBooks</strong> באמצעות כלי OCR ושימוש במודלים מתקדמים של AI.
        </InfoCard>
      </ul>
    </Section>
  )
}
