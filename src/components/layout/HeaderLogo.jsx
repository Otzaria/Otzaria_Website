'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRef } from 'react'
import useWordmarkHandoff from '@/hooks/useWordmarkHandoff'
import { FOCUS_RING } from '@/components/ui/focusRing'

const WORDMARK = 'אוצריא'

/**
 * הלוגו ושם האתר שבכותרת העליונה — קישור לדף הבית.
 *
 * הלוגו מוצג תמיד, קבוע, מטעינת הדף. שם האתר — "אוצריא" ב-OT Vilna Regular, כמו המילה הגדולה
 * שבגיבור (OT Vilna נטען בלי Bold — design-system.md).
 *
 * handoff (דף הבית בלבד): בראש הדף שם האתר אינו מוצג בכותרת — הוא המילה הגדולה שבגיבור.
 * כשהמילה נגללת אל מתחת לכותרת, שם האתר נכנס כאן בדהייה ועלייה קצרה, וכשהיא חוזרת — יוצא
 * (useWordmarkHandoff, "מעבר שם האתר" ב-animations.css). השם תמיד תופס את מקומו ב-layout
 * (רק opacity/transform משתנים), כך שאין קפיצה. השם הנגיש של הקישור קבוע (aria-label), בלי
 * קשר למה שמוצג כרגע.
 */
export default function HeaderLogo({ handoff = false }) {
  const targetRef = useRef(null)
  useWordmarkHandoff({ enabled: handoff, targetRef })

  return (
    // קישור הלוגו מופיע בכל דף ואינו מצדיק prefetch
    <Link
      href="/"
      prefetch={false}
      aria-label={handoff ? `${WORDMARK} — דף הבית` : undefined}
      className={`flex min-h-12 shrink-0 items-center gap-2 rounded-lg transition-opacity hover:opacity-80 ${FOCUS_RING}`}
    >
      <Image src="/logo.webp" alt={handoff ? '' : 'לוגו אוצריא'} width={32} height={32} className="size-[32px] shrink-0" />
      <span ref={targetRef} className={`font-display text-2xl font-normal leading-none text-on-surface ${handoff ? 'wordmark-handoff-target' : ''}`}>
        {WORDMARK}
      </span>
    </Link>
  )
}
