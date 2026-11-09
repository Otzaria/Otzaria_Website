import Chip from '@/components/ui/Chip'
import { PAGE_SECTIONS } from '@/lib/chachmei-lev-data'

/**
 * ניווט מהיר בין אזורי הדף — שבבים שמקשרים לעוגנים (#memorial...). הקפיצה נעצרת מתחת לכותרת
 * הדביקה (Section anchor). בנייד — רשת של שלושה בטור (שתי שורות מלאות, בלי שבב בודד בשורה);
 * מ-md — שורה אחת ממורכזת. gap-y-2.5 — כדי שמטרות המגע (44px) של השבבים לא יחפפו.
 */
export default function QuickNav({ className }: { className?: string }) {
  return (
    <nav aria-label="ניווט מהיר בדף" className={className}>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-2.5 md:flex md:flex-wrap md:justify-center">
        {PAGE_SECTIONS.map((section) => (
          <li key={section.id} className="flex">
            <Chip href={`#${section.id}`} icon={section.icon} className="w-full justify-center md:w-auto">{section.label}</Chip>
          </li>
        ))}
      </ul>
    </nav>
  )
}
