import Link from 'next/link'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import Section from '@/components/ui/Section'

// "עדכוני אוצריא" — הכלי הנפרד לעדכון מחשב לא-מקוון (/offline). אזור עצמאי ברוחב מלא:
// פס אופקי (אייקון · טקסט · כפתור) מ-md, וטור בנייד.
export default function OfflineToolCard() {
  return (
    <Section labelledBy="offline-heading" spacing="none">
      <Card padding="lg" className="flex flex-col gap-5 md:flex-row md:items-center md:gap-8">
        <IconTile icon="cloud_off" size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id="offline-heading" className="font-display text-headline-sm text-on-surface">המחשב שלך לא מחובר לאינטרנט?</h2>
          <p className="mt-2 max-w-3xl leading-relaxed text-on-surface-variant">
            &quot;עדכוני אוצריא&quot; הוא כלי נפרד שמורידים במחשב מקוון על כונן USB, ומעדכנים
            איתו במחשב הלא-מקוון את התוכנה, את ספריית הספרים ואת התוספים, בלי חיבור לרשת.
          </p>
        </div>
        {/* עדיין לא ui/Button: הכפתור הזה בגופן 16px (יורש מה-body) ובאייקון 24px, ואילו Button md
            הוא 15.36px (text-base) ו-22px, כמו בגיבור. האחדה = שינוי חזותי קטן — ממתין להחלטה
            (refactor-notes/redesign/design-system.md). הצבעים כבר מטוקני הכפתור הטונלי. */}
        <Link
          href="/offline"
          prefetch={false}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-(--button-radius) bg-(--button-tonal-bg) px-6 font-semibold text-(--button-tonal-fg) transition-colors hover:bg-(--button-tonal-bg-hover)"
        >
          <span className="material-symbols-outlined" aria-hidden="true">usb</span>
          לכלי העדכון הלא-מקוון
        </Link>
      </Card>
    </Section>
  )
}
