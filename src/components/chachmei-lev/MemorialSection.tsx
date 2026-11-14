import Section from '@/components/ui/Section'
import SectionHeading from '@/components/ui/SectionHeading'
import { cx } from '@/components/ui/cx'
import { MEMORIAL_OPEN_SLOT, MEMORIALS } from '@/lib/chachmei-lev-data'
import MemorialCard from './MemorialCard'
import OpenSlotCard from './OpenSlotCard'

const SQUARE = 'aspect-square w-full max-w-80 justify-self-center md:max-w-none'

/**
 * לוח ההנצחה: ההקדשות ומשבצת פנויה שמובילה לדף התרומה. טור אחד בנייד, שלושה מ-lg.
 * כל השלושה ריבועים זהים (SQUARE). בטור יחיד ריבוע ברוחב המסך גבוה מדי — לכן רוחב מרבי וממורכז;
 * ב-md המשבצת הפנויה בשורה משלה ברוחב טור אחד (חצי שורה פחות חצי מרווח gap-3), ממורכזת.
 * האזור הראשון אחרי הפתיחה, במרווח העליון הרגיל של הדף ועוד תוספת (mt) — רווח נשימה ברור מהפתיחה ומהניווט המהיר.
 * כניסה מדורגת עדינה ב-CSS (animate-enter-up; מבוטלת ב-reduced-motion ב-animations.css).
 */
export default function MemorialSection() {
  return (
    <Section id="memorial" labelledBy="memorial-heading" anchor spacing="top" className="mt-8 md:mt-12">
      <SectionHeading id="memorial-heading" title="לוח הנצחה" spacing="none" className="mb-6 md:mb-8" />
      <ul className="mx-auto grid max-w-4xl gap-3 md:grid-cols-2 lg:grid-cols-3">
        {MEMORIALS.map((memorial, index) => (
          <MemorialCard
            key={memorial.title}
            title={memorial.title}
            description={memorial.description}
            className={cx(SQUARE, 'animate-enter-up')}
            style={{ animationDelay: `${index * 0.08}s` }}
          />
        ))}
        <OpenSlotCard
          title={MEMORIAL_OPEN_SLOT}
          cta="להנצחה בתרומה"
          icon="candle"
          padding="sm"
          className={cx(SQUARE, 'animate-enter-up md:col-span-2 md:w-[calc(50%-0.375rem)] lg:col-span-1 lg:w-full')}
          style={{ animationDelay: `${MEMORIALS.length * 0.08}s` }}
        />
      </ul>
    </Section>
  )
}
