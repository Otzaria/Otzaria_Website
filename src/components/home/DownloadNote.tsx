import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'
import Ltr from '@/components/ui/Ltr'

/**
 * הערה בחלון ההורדה.
 * - "lead": שורת ההסבר הראשית של החלון — תיבה טונלית שקטה וממורכזת, role="note", בלי אייקון
 *   (icon לא בשימוש בה): כותרת מודגשת (title) ומתחתיה, בשורה נפרדת, מה עושים בקובץ.
 * - "quiet": הערה משנית שאין לה מקום אחר (uname -m, Gatekeeper) — טקסט קטן עם אייקון.
 */
export default function DownloadNote({ icon = 'info', variant = 'quiet', title, children }: {
  icon?: string
  variant?: 'lead' | 'quiet'
  /** ב-lead: שורה מודגשת נפרדת מעל ההסבר — העובדה החשובה, שנקראת גם במבט חטוף */
  title?: ReactNode
  children: ReactNode
}) {
  if (variant === 'lead') {
    return (
      // ממורכזת, בלי אייקון — הכותרת המודגשת היא העוגן, וריפוד שווה מכל הצדדים.
      // text-balance מאזן את השורות, כדי שלא תישאר מילה יתומה בשורה האחרונה.
      <Card tone="tonal" role="note" className="px-3 py-3.5 text-center text-sm leading-relaxed text-balance text-on-surface sm:px-4 sm:py-4 sm:text-[0.9375rem]">
        {title && <p className="font-bold">{title}</p>}
        <p className={title ? 'mt-1 text-on-surface-variant' : undefined}>{children}</p>
      </Card>
    )
  }

  return (
    <div className="flex gap-2 px-1 text-sm leading-relaxed text-on-surface-variant">
      <span aria-hidden="true" className="material-symbols-outlined mt-0.5 shrink-0 text-lg text-on-tile">{icon}</span>
      <p className="min-w-0">{children}</p>
    </div>
  )
}

// שמות קבצים ופקודות הם LTR; בלי בידוד הסוגריים והנקודה סביבם מתהפכים בפסקה עברית.
export function LtrCode({ children }: { children: string }) {
  return <Ltr className="font-mono text-[0.92em]">{children}</Ltr>
}

// מצמיד תחילית עברית ("ה-") למילה הלועזית שאחריה, כדי שהשורה לא תישבר באמצע
export function Nowrap({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}
