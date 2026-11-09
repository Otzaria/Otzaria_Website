import Chip from '@/components/ui/Chip'
import { PAGE_SECTIONS } from '@/lib/chachmei-lev-data'

/**
 * ניווט מהיר בין אזורי הדף — שבבים שמקשרים לעוגנים (#memorial...). הקפיצה נעצרת מתחת לכותרת
 * הדביקה (Section anchor). gap-y-2.5 — כדי שמטרות המגע (44px) של השבבים לא יחפפו.
 */
export default function QuickNav({ className }: { className?: string }) {
  return (
    <nav aria-label="ניווט מהיר בדף" className={className}>
      <ul className="flex flex-wrap justify-center gap-x-2 gap-y-2.5">
        {PAGE_SECTIONS.map((section) => (
          <li key={section.id}>
            <Chip href={`#${section.id}`} icon={section.icon}>{section.label}</Chip>
          </li>
        ))}
      </ul>
    </nav>
  )
}
