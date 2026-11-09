import Card from '@/components/ui/Card'
import TitleOrnament from '@/components/ui/TitleOrnament'
import { QUOTE } from '@/lib/chachmei-lev-data'

/**
 * הציטוט שבראש הדף (בתוכנה: _ClosingQuote): הפסוק, קישוט, והמאמר שמפרש אותו — כל אחד עם מקורו.
 * figure בכרטיס טונלי, כמו מובאת המקור בדף האודות. הטבעת שסביב נקודת הקישוט בצבע האטום של הכרטיס.
 * קטן ושקט מה-h1 בכוונה (headline-sm ומטה, צבע הטקסט המשני): הכותרת נשארת הדבר הבולט בראש הדף.
 */
export default function QuoteFigure({ className }: { className?: string }) {
  return (
    <Card tone="tonal" padding="md" className={className}>
      <figure className="flex flex-col items-center text-center">
        <blockquote className="flex flex-col items-center">
          <p className="text-balance font-display text-headline-sm text-on-surface-variant">{QUOTE.verse}</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">{QUOTE.verseSource}</p>
          <TitleOrnament className="my-3" ratio="60%" ringColor="var(--card-bg-tonal-solid)" />
          <p className="text-balance font-display text-xl text-on-surface-variant">{QUOTE.explanation}</p>
        </blockquote>
        <figcaption className="mt-1 text-body-sm text-on-surface-variant">{QUOTE.explanationSource}</figcaption>
      </figure>
    </Card>
  )
}
