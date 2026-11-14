import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { MEMORIAL_OPEN_SLOT, MEMORIALS } from '@/lib/chachmei-lev-data'
import MemorialCard from './MemorialCard'
import OpenSlotCard from './OpenSlotCard'

/**
 * לוח ההנצחה: ההקדשות ומשבצת פנויה שמובילה לדף התרומה. טור אחד בנייד, שלושה מ-lg.
 * האזור הראשון אחרי הפתיחה, במרווח העליון הרגיל של הדף (spacing="top") — רווח נשימה מהניווט המהיר.
 * כניסה מדורגת עדינה ב-CSS (animate-enter-up; מבוטלת ב-reduced-motion ב-animations.css).
 */
export default function MemorialSection() {
  return (
    <Section id="memorial" labelledBy="memorial-heading" anchor spacing="top">
      <SectionHeading id="memorial-heading" title="לוח הנצחה" spacing="none" className="mb-6 md:mb-8" />
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {MEMORIALS.map((memorial, index) => (
          <MemorialCard
            key={memorial.title}
            title={memorial.title}
            description={memorial.description}
            className="animate-enter-up"
            style={{ animationDelay: `${index * 0.08}s` }}
          />
        ))}
        <OpenSlotCard
          title={MEMORIAL_OPEN_SLOT}
          cta="להנצחה בתרומה"
          icon="candle"
          className="animate-enter-up md:col-span-2 lg:col-span-1"
          style={{ animationDelay: `${MEMORIALS.length * 0.08}s` }}
        />
      </ul>
    </Section>
  )
}
